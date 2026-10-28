package com.liitpos.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;

/**
 * Downloads an update APK and installs it.
 *
 * <p>A device owner on Android 12+ installs through a PackageInstaller session without a
 * confirmation screen, so kiosk lock task can stay on. Every other case uses the system
 * installer. Lock task is stopped before that screen and before the unknown-sources
 * permission screen, then put back when the cashier returns. Granting the permission
 * resumes the download without another tap.
 */
final class UpdateInstaller {
    static final String ACTION = "com.liitpos.app.UPDATE_STATUS";
    private static final String KEY_URL = "updateUrl";
    private static final String KEY_TOKEN = "updateToken";
    private static final String KEY_AWAIT = "updateAwaitingPermission";
    private static final String KEY_HOLD = "updateHoldLock";
    private static final int MAX_REDIRECTS = 5;

    private enum Phase {
        IDLE,
        DOWNLOADING,
        AWAITING_PERMISSION,
        INSTALLING
    }

    private final MainActivity activity;
    private final BroadcastReceiver statusReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            onInstallStatus(intent);
        }
    };
    private boolean registered;
    private volatile Phase phase = Phase.IDLE;
    private volatile boolean holdLock;
    private volatile boolean preferSilent;
    private volatile boolean triedUserAction;
    private String pendingUrl = "";
    private String pendingToken = "";

    UpdateInstaller(MainActivity activity) {
        this.activity = activity;
        SharedPreferences prefs = activity.prefs();
        holdLock = prefs.getBoolean(KEY_HOLD, false);
        if (prefs.getBoolean(KEY_AWAIT, false)) {
            pendingUrl = prefs.getString(KEY_URL, "");
            pendingToken = prefs.getString(KEY_TOKEN, "");
            phase = pendingUrl == null || pendingUrl.isEmpty() ? Phase.IDLE : Phase.AWAITING_PERMISSION;
        }
    }

    void register() {
        if (registered) return;
        IntentFilter filter = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(statusReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(statusReceiver, filter);
        }
        registered = true;
    }

    void unregister() {
        if (!registered) return;
        try {
            activity.unregisterReceiver(statusReceiver);
        } catch (Exception ignored) {
            // Already unregistered.
        }
        registered = false;
    }

    boolean holdsLockOpen() {
        return holdLock;
    }

    void markHold(boolean open) {
        holdLock = open;
        activity.prefs().edit().putBoolean(KEY_HOLD, open).apply();
    }

    void onHostResume() {
        if (phase == Phase.AWAITING_PERMISSION) {
            if (activity.canInstallUnknownApps()) {
                String url = pendingUrl;
                String token = pendingToken == null ? "" : pendingToken;
                clearPendingPermission();
                phase = Phase.DOWNLOADING;
                activity.restoreLockAfterUpdate();
                activity.emitUpdate("progress", -1, UpdateFlow.DOWNLOADING);
                downloadAsync(url, token);
            } else {
                phase = Phase.IDLE;
                clearPendingPermission();
                activity.restoreLockAfterUpdate();
                activity.emitUpdate("error", -1, UpdateFlow.PERMISSION_DENIED);
            }
            return;
        }
        if (phase == Phase.INSTALLING) {
            phase = Phase.IDLE;
            activity.restoreLockAfterUpdate();
            return;
        }
        if (holdLock) {
            activity.restoreLockAfterUpdate();
            return;
        }
        activity.ensureLockTask();
    }

    void start(String url, String token) {
        activity.runOnUiThread(() -> startOnMain(url, token == null ? "" : token));
    }

    private void startOnMain(String url, String token) {
        if (phase != Phase.IDLE) return;
        if (!UpdateFlow.allowedDownloadUrl(url)) {
            activity.emitUpdate("error", -1, UpdateFlow.BAD_URL);
            return;
        }
        pendingUrl = url;
        pendingToken = token;
        preferSilent = activity.deviceOwner();
        triedUserAction = false;
        if (needsUnknownSourcesPermission()) {
            askForPermission(url, token);
            return;
        }
        phase = Phase.DOWNLOADING;
        activity.emitUpdate("progress", -1, UpdateFlow.DOWNLOADING);
        downloadAsync(url, token);
    }

    private boolean needsUnknownSourcesPermission() {
        if (preferSilent && !triedUserAction) return false;
        return !activity.canInstallUnknownApps();
    }

    private void askForPermission(String url, String token) {
        phase = Phase.AWAITING_PERMISSION;
        pendingUrl = url;
        pendingToken = token;
        activity.prefs().edit()
                .putString(KEY_URL, url)
                .putString(KEY_TOKEN, token)
                .putBoolean(KEY_AWAIT, true)
                .apply();
        activity.pauseLockForUpdate();
        activity.emitUpdate("permission", -1, UpdateFlow.PERMISSION);
        try {
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName()));
            settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(settings);
        } catch (Exception error) {
            phase = Phase.IDLE;
            clearPendingPermission();
            activity.restoreLockAfterUpdate();
            activity.emitUpdate("error", -1, UpdateFlow.PERMISSION_SCREEN);
        }
    }

    private void clearPendingPermission() {
        activity.prefs().edit().remove(KEY_URL).remove(KEY_TOKEN).putBoolean(KEY_AWAIT, false).apply();
    }

    private void downloadAsync(String url, String token) {
        new Thread(() -> {
            try {
                File apk = download(url, token);
                String problem = rejectApk(apk);
                if (problem != null) {
                    fail(problem);
                    return;
                }
                activity.emitUpdate("installing", 100, UpdateFlow.INSTALLING);
                try {
                    commit(apk, preferSilent && !triedUserAction);
                } catch (Exception error) {
                    fail(UpdateFlow.INSTALL_FAILED);
                }
            } catch (Exception error) {
                String message = error instanceof UpdateException && error.getMessage() != null
                        ? error.getMessage()
                        : UpdateFlow.forTransport(error);
                fail(message);
            }
        }, "liitpos-update").start();
    }

    private File download(String url, String token) throws Exception {
        String current = url;
        String auth = token;
        int hops = 0;
        while (true) {
            HttpURLConnection connection = activity.open(current, auth);
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (hops >= MAX_REDIRECTS) throw new UpdateException(UpdateFlow.TOO_MANY_REDIRECTS);
                    String next = UpdateFlow.nextHttps(current, location);
                    if (next == null) throw new UpdateException(UpdateFlow.INSECURE_REDIRECT);
                    current = next;
                    auth = "";
                    hops++;
                    continue;
                }
                if (status < 200 || status >= 300) throw new UpdateException(UpdateFlow.httpFailed(status));
                File part = new File(activity.getCacheDir(), "liitpos-update.apk.part");
                File done = new File(activity.getCacheDir(), "liitpos-update.apk");
                long total = connection.getContentLengthLong();
                long readTotal = 0;
                int lastPercent = -2;
                try (InputStream in = connection.getInputStream(); FileOutputStream fos = new FileOutputStream(part)) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = in.read(buffer)) >= 0) {
                        fos.write(buffer, 0, read);
                        readTotal += read;
                        int percent = UpdateFlow.percent(readTotal, total);
                        if (percent != lastPercent) {
                            lastPercent = percent;
                            String message = percent < 0 ? UpdateFlow.DOWNLOADING : UpdateFlow.downloading(percent);
                            activity.emitUpdate("progress", percent, message);
                        }
                    }
                }
                if (done.exists() && !done.delete()) throw new UpdateException(UpdateFlow.DOWNLOAD_FAILED);
                if (!part.renameTo(done)) throw new UpdateException(UpdateFlow.DOWNLOAD_FAILED);
                activity.emitUpdate("progress", 100, UpdateFlow.downloading(100));
                return done;
            } finally {
                connection.disconnect();
            }
        }
    }

    private String rejectApk(File apk) {
        if (apk == null || !apk.isFile() || apk.length() < 4096) return UpdateFlow.CORRUPT;
        try (InputStream in = new FileInputStream(apk)) {
            byte[] magic = new byte[4];
            if (in.read(magic) != 4 || magic[0] != 'P' || magic[1] != 'K') return UpdateFlow.CORRUPT;
        } catch (Exception error) {
            return UpdateFlow.CORRUPT;
        }
        PackageManager manager = activity.getPackageManager();
        PackageInfo archive = readArchive(manager, apk);
        if (archive == null || archive.packageName == null) return UpdateFlow.CORRUPT;
        if (!activity.getPackageName().equals(archive.packageName)) return UpdateFlow.WRONG_PACKAGE;
        try {
            PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), signingFlags());
            Signature[] current = signers(installed);
            Signature[] incoming = signers(archive);
            if (current != null && current.length > 0 && incoming != null && incoming.length > 0 && !sameSigners(current, incoming)) {
                return UpdateFlow.SIGNATURE_MISMATCH;
            }
            long newer = versionOf(archive);
            long installedCode = versionOf(installed);
            if (newer > 0 && newer <= installedCode) return UpdateFlow.NOT_NEWER;
        } catch (Exception error) {
            return UpdateFlow.GENERIC;
        }
        return null;
    }

    private void commit(File apk, boolean silent) throws Exception {
        if (apk == null || !apk.isFile()) throw new UpdateException(UpdateFlow.CORRUPT);
        PackageInstaller installer = activity.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(activity.getPackageName());
        params.setSize(apk.length());
        if (silent && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            } catch (IllegalArgumentException error) {
                // This device will not install quietly. The session asks the cashier instead.
            }
        }
        int sessionId = installer.createSession(params);
        PackageInstaller.Session session = installer.openSession(sessionId);
        boolean committed = false;
        try {
            try (InputStream in = new FileInputStream(apk);
                    OutputStream out = session.openWrite("base.apk", 0, apk.length())) {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = in.read(buffer)) >= 0) out.write(buffer, 0, read);
                session.fsync(out);
            }
            Intent callback = new Intent(ACTION);
            callback.setPackage(activity.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pending = PendingIntent.getBroadcast(activity, sessionId, callback, flags);
            session.commit(pending.getIntentSender());
            committed = true;
        } catch (Exception error) {
            if (!committed) {
                try {
                    session.abandon();
                } catch (Exception ignored) {
                    // The session is already gone.
                }
            }
            throw error;
        } finally {
            try {
                session.close();
            } catch (Exception ignored) {
                // Closing after commit is best-effort.
            }
        }
    }

    private void onInstallStatus(Intent intent) {
        if (intent == null) {
            fail(UpdateFlow.INSTALL_FAILED);
            return;
        }
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = confirmIntent(intent);
            if (confirm == null) {
                fail(UpdateFlow.NO_INSTALLER);
                return;
            }
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            phase = Phase.INSTALLING;
            triedUserAction = true;
            preferSilent = false;
            activity.pauseLockForUpdate();
            try {
                activity.startActivity(confirm);
                activity.emitUpdate("installing", -1, UpdateFlow.INSTALLING);
            } catch (Exception error) {
                phase = Phase.IDLE;
                activity.restoreLockAfterUpdate();
                activity.emitUpdate("error", -1, UpdateFlow.NO_INSTALLER);
            }
            return;
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            phase = Phase.IDLE;
            activity.emitUpdate("done", 100, UpdateFlow.INSTALLED);
            return;
        }
        if (status == PackageInstaller.STATUS_FAILURE_BLOCKED && preferSilent && !triedUserAction) {
            preferSilent = false;
            triedUserAction = true;
            File apk = new File(activity.getCacheDir(), "liitpos-update.apk");
            if (!activity.canInstallUnknownApps()) {
                askForPermission(pendingUrl, pendingToken);
                return;
            }
            new Thread(() -> {
                try {
                    commit(apk, false);
                } catch (Exception error) {
                    fail(UpdateFlow.INSTALL_FAILED);
                }
            }, "liitpos-update-retry").start();
            return;
        }
        String message = UpdateFlow.messageForStatus(status);
        fail(message);
    }

    private void fail(String message) {
        phase = Phase.IDLE;
        String text = message == null || message.isEmpty() ? UpdateFlow.GENERIC : message;
        activity.runOnUiThread(() -> {
            activity.restoreLockAfterUpdate();
            activity.emitUpdate("error", -1, text);
        });
    }

    @SuppressWarnings("deprecation")
    private static Intent confirmIntent(Intent status) {
        if (Build.VERSION.SDK_INT >= 33) {
            return status.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
        }
        return status.getParcelableExtra(Intent.EXTRA_INTENT);
    }

    @SuppressWarnings("deprecation")
    private static int signingFlags() {
        if (Build.VERSION.SDK_INT >= 28) {
            return PackageManager.GET_SIGNING_CERTIFICATES | PackageManager.GET_SIGNATURES;
        }
        return PackageManager.GET_SIGNATURES;
    }

    private static PackageInfo readArchive(PackageManager manager, File apk) {
        String path = apk.getAbsolutePath();
        PackageInfo info = manager.getPackageArchiveInfo(path, signingFlags());
        if (info != null && info.applicationInfo != null) {
            info.applicationInfo.sourceDir = path;
            info.applicationInfo.publicSourceDir = path;
        }
        return info;
    }

    private static Signature[] signers(PackageInfo info) {
        if (info == null) return null;
        if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null) {
            Signature[] current = info.signingInfo.getApkContentsSigners();
            if (current != null && current.length > 0) return current;
        }
        return info.signatures;
    }

    private static boolean sameSigners(Signature[] left, Signature[] right) {
        if (left.length != right.length) return false;
        for (Signature signature : left) {
            boolean found = false;
            for (Signature other : right) {
                if (signature.equals(other)) {
                    found = true;
                    break;
                }
            }
            if (!found) return false;
        }
        return true;
    }

    @SuppressWarnings("deprecation")
    private static long versionOf(PackageInfo info) {
        if (info == null) return 0;
        if (Build.VERSION.SDK_INT >= 28) return info.getLongVersionCode();
        return info.versionCode;
    }

    static final class UpdateException extends Exception {
        UpdateException(String message) {
            super(message);
        }
    }
}
