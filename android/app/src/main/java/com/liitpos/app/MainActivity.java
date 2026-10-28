package com.liitpos.app;

import android.app.admin.DevicePolicyManager;
import android.content.ClipData;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.util.UUID;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "liitpos";
    private UsbPrinters usbPrinters;
    private UpdateInstaller updater;
    private boolean lockWanted;
    private String lastUpdateDetail = "";

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(CustomerDisplayPlugin.class);
        super.onCreate(savedInstanceState);
        lockWanted = prefs().getBoolean("lockWanted", false);
        updater = new UpdateInstaller(this);
        updater.register();
        usbPrinters = new UsbPrinters(this, (event, detail) -> {
            WebView webView = getBridge().getWebView();
            String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event) + ",{detail:" + detail + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        });
        usbPrinters.register();
    }

    @Override
    public void onDestroy() {
        if (updater != null) updater.unregister();
        if (usbPrinters != null) usbPrinters.unregister();
        super.onDestroy();
    }

    @Override
    public void onResume() {
        super.onResume();
        WebView webView = getBridge().getWebView();
        webView.removeJavascriptInterface("LiitposNative");
        webView.addJavascriptInterface(new Bridge(), "LiitposNative");
        webView.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        WebLight.apply(webView);
        if (updater != null) updater.onHostResume();
        else ensureLockTask();
    }

    SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    boolean deviceOwner() {
        DevicePolicyManager manager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
        return manager != null && manager.isDeviceOwnerApp(getPackageName());
    }

    /**
     * Hardware serial is readable by the device owner from Android 10.
     * It is the preferred activation source because it survives a factory reset.
     */
    private String hardwareSerial() {
        if (!deviceOwner() || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "";
        try {
            String serial = Build.getSerial();
            if (serial == null) return "";
            String trimmed = serial.trim();
            if (trimmed.isEmpty() || trimmed.equalsIgnoreCase("unknown")) return "";
            return trimmed.replace("\n", "").replace("\r", "");
        } catch (Throwable ignored) {
            return "";
        }
    }

    private String androidId() {
        String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        if (androidId == null) return "";
        return androidId.replace("\n", "").replace("\r", "").trim();
    }

    void applyLockTask(boolean enabled) {
        lockWanted = enabled;
        prefs().edit().putBoolean("lockWanted", enabled).apply();
        if (enabled && updater != null && updater.holdsLockOpen()) return;
        try {
            if (!enabled) {
                stopLockTask();
                return;
            }
            DevicePolicyManager manager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            ComponentName admin = new ComponentName(this, LiitposAdmin.class);
            if (manager != null && manager.isDeviceOwnerApp(getPackageName())) {
                manager.setLockTaskPackages(admin, new String[] { getPackageName() });
            }
            // Device owner is the full lock. Otherwise Android offers screen pinning.
            startLockTask();
        } catch (Exception ignored) {
            // Screen pinning is unavailable until the device owner step in ANDROID.md.
        }
    }

    private final class Bridge {
        @JavascriptInterface
        public String getCloudUrl() {
            return prefs().getString("cloud", "");
        }

        @JavascriptInterface
        public void setCloudUrl(String url) {
            prefs().edit().putString("cloud", url == null ? "" : url).apply();
        }

        @JavascriptInterface
        public String getSessionToken() {
            return prefs().getString("token", "");
        }

        @JavascriptInterface
        public void setSessionToken(String token) {
            prefs().edit().putString("token", token == null ? "" : token).apply();
        }

        @JavascriptInterface
        public String getDeviceId() {
            String id = prefs().getString("deviceId", "");
            if (id == null || id.isEmpty()) {
                id = UUID.randomUUID().toString();
                prefs().edit().putString("deviceId", id).apply();
            }
            return id;
        }

        @JavascriptInterface
        public void setDeviceId(String id) {
            if (id == null || id.isEmpty()) return;
            String current = prefs().getString("deviceId", "");
            if (current != null && !current.isEmpty()) return;
            prefs().edit().putString("deviceId", id).apply();
        }

        @JavascriptInterface
        public boolean isDeviceOwner() {
            return deviceOwner();
        }

        @JavascriptInterface
        public String getHardwareSerial() {
            return hardwareSerial();
        }

        @JavascriptInterface
        public String getAndroidId() {
            return androidId();
        }

        @JavascriptInterface
        public String getDeviceModel() {
            String maker = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
            String model = Build.MODEL == null ? "" : Build.MODEL;
            String label = (maker + " " + model).trim();
            return label.length() > 80 ? label.substring(0, 80) : label;
        }

        @JavascriptInterface
        public int getVersionCode() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    return (int) info.getLongVersionCode();
                }
                return info.versionCode;
            } catch (Exception error) {
                return 0;
            }
        }

        @JavascriptInterface
        public String getVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception error) {
                return "";
            }
        }

        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
        }

        @JavascriptInterface
        public void sendSms(String number, String body) {
            runOnUiThread(() -> {
                String to = number == null ? "" : number;
                String text = body == null ? "" : body;
                Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("sms:" + to));
                intent.putExtra("sms_body", text);
                intent.putExtra(Intent.EXTRA_TEXT, text);
                try {
                    startActivity(intent);
                } catch (Exception error) {
                    try {
                        Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse("sms:" + to + "?body=" + Uri.encode(text)));
                        startActivity(view);
                    } catch (Exception ignored) {
                        // No SMS app on this device. The register keeps the summary on screen.
                    }
                }
            });
        }

        @JavascriptInterface
        public void setLockTask(boolean enabled) {
            runOnUiThread(() -> applyLockTask(enabled));
        }

        @JavascriptInterface
        public void printReceipt() {
            runOnUiThread(() -> {
                PrintManager manager = (PrintManager) getSystemService(PRINT_SERVICE);
                if (manager == null) return;
                manager.print(
                        "Liitpos",
                        getBridge().getWebView().createPrintDocumentAdapter("Liitpos"),
                        new PrintAttributes.Builder().build());
            });
        }

        @JavascriptInterface
        public String listUsbPrinters() {
            return usbPrinters == null ? "[]" : usbPrinters.listJson();
        }

        @JavascriptInterface
        public void printReceiptUsb(String json) {
            if (usbPrinters != null) usbPrinters.printAsync(json);
        }

        @JavascriptInterface
        public void requestUsbPermission(String deviceName) {
            if (usbPrinters != null) usbPrinters.requestPermission(deviceName);
        }

        @JavascriptInterface
        public void pulseDrawerUsb(String json) {
            if (usbPrinters != null) usbPrinters.pulseAsync(json);
        }

        @JavascriptInterface
        public void shareCachedFile(String name, String base64, String mime, String text, String title) {
            runOnUiThread(() -> shareReceiptFile(name, base64, mime, text, title));
        }

        @JavascriptInterface
        public String checkUpdate(String cloudUrl) {
            int current = getVersionCode();
            if (cloudUrl != null && (cloudUrl.startsWith("https://") || cloudUrl.startsWith("http://localhost")
                    || cloudUrl.startsWith("http://127.0.0.1"))) {
                String fromCloud = newerRelease(httpGet(cloudUrl + "/api/pos/update", false), current);
                if (!fromCloud.isEmpty()) return fromCloud;
            }
            return fromGithub(httpGet("https://api.github.com/repos/theilya2/Liitpos/releases/latest", true), current);
        }

        @JavascriptInterface
        public void downloadAndInstall(String url, String token) {
            if (updater == null) {
                emitUpdate("error", -1, UpdateFlow.GENERIC);
                return;
            }
            updater.start(url, token);
        }

        @JavascriptInterface
        public String lastUpdateEvent() {
            return lastUpdateDetail == null ? "" : lastUpdateDetail;
        }
    }

    boolean canInstallUnknownApps() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return getPackageManager().canRequestPackageInstalls();
    }

    void ensureLockTask() {
        if (!lockWanted || (updater != null && updater.holdsLockOpen())) return;
        try {
            startLockTask();
        } catch (Exception ignored) {
            // Pinning can fail until the device-owner step in ANDROID.md.
        }
    }

    void pauseLockForUpdate() {
        if (updater != null) updater.markHold(true);
        allowUpdateUiInLockTask();
        try {
            stopLockTask();
        } catch (Exception ignored) {
            // Lock task was not running. The installer screen can still open.
        }
    }

    void restoreLockAfterUpdate() {
        if (updater != null) updater.markHold(false);
        if (lockWanted) applyLockTask(true);
    }

    /** Lets the system installer and the unknown-sources screen show while this app is device owner. */
    private void allowUpdateUiInLockTask() {
        if (!deviceOwner()) return;
        try {
            DevicePolicyManager manager = (DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            if (manager == null) return;
            ComponentName admin = new ComponentName(this, LiitposAdmin.class);
            manager.setLockTaskPackages(admin, new String[] {
                getPackageName(),
                "com.android.packageinstaller",
                "com.google.android.packageinstaller",
                "com.samsung.android.packageinstaller",
                "com.miui.packageinstaller",
                "com.android.permissioncontroller",
                "com.google.android.permissioncontroller",
                "com.android.settings"
            });
        } catch (Exception ignored) {
            // Not the device owner, or the admin component is not active.
        }
    }

    void emitUpdate(String phase, int percent, String message) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        try {
            org.json.JSONObject detail = new org.json.JSONObject();
            detail.put("phase", phase);
            if (percent >= 0) detail.put("percent", percent);
            detail.put("message", message == null ? "" : message);
            lastUpdateDetail = detail.toString();
            String script = "window.dispatchEvent(new CustomEvent('liitpos-update',{detail:" + lastUpdateDetail + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        } catch (Exception error) {
            android.util.Log.e("Liitpos", "update event failed", error);
        }
    }

    private void shareReceiptFile(String name, String base64, String mime, String text, String title) {
        try {
            String safe = name == null ? "receipt.pdf" : name.replaceAll("[^A-Za-z0-9._-]", "");
            if (safe.isEmpty()) safe = "receipt.pdf";
            byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
            File out = new File(getCacheDir(), safe);
            try (FileOutputStream fos = new FileOutputStream(out)) {
                fos.write(bytes);
            }
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", out);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime == null || mime.isEmpty() ? "application/pdf" : mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            send.putExtra(Intent.EXTRA_SUBJECT, title == null ? "קבלה" : title);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(ClipData.newRawUri("", uri));
            startActivity(Intent.createChooser(send, title == null ? "שליחת קבלה" : title));
        } catch (Exception error) {
            android.util.Log.e("Liitpos", "share failed", error);
        }
    }

    HttpURLConnection open(String url, String token) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(20000);
        connection.setReadTimeout(120000);
        connection.setRequestProperty("User-Agent", "liitpos-update");
        if (token != null && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        return connection;
    }

    private String httpGet(String url, boolean github) {
        try {
            HttpURLConnection connection = open(url, "");
            connection.setRequestProperty("Accept", github ? "application/vnd.github+json" : "application/json");
            if (connection.getResponseCode() < 200 || connection.getResponseCode() >= 300) return "";
            return readAll(connection.getInputStream());
        } catch (Exception error) {
            return "";
        }
    }

    private String readAll(InputStream input) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int read;
        while ((read = input.read(buffer)) >= 0) out.write(buffer, 0, read);
        return out.toString("UTF-8");
    }

    private int versionCodeFromName(String name) {
        if (name == null || name.isEmpty()) return 0;
        String raw = name;
        int plus = name.lastIndexOf('+');
        if (plus >= 0 && plus < name.length() - 1) raw = name.substring(plus + 1);
        else {
            int dot = name.lastIndexOf('.');
            raw = dot >= 0 ? name.substring(dot + 1) : name;
        }
        try {
            return Integer.parseInt(raw);
        } catch (NumberFormatException error) {
            return 0;
        }
    }

    private String newerRelease(String body, int current) {
        if (body == null || body.isEmpty()) return "";
        try {
            JSONObject json = new JSONObject(body);
            int code = json.optInt("versionCode", 0);
            String apk = json.optString("apkUrl", "");
            if (code > current && apk.startsWith("https://")) return body;
        } catch (Exception ignored) {
            return "";
        }
        return "";
    }

    private String fromGithub(String body, int current) {
        if (body == null || body.isEmpty()) return "";
        try {
            JSONObject release = new JSONObject(body);
            String tag = release.optString("tag_name", "").replaceFirst("^v", "");
            int code = versionCodeFromName(tag);
            if (code <= current) return "";
            JSONArray assets = release.optJSONArray("assets");
            String apk = "";
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.getJSONObject(i);
                    if ("liitpos-release.apk".equals(asset.optString("name"))) {
                        apk = asset.optString("browser_download_url", "");
                    }
                }
            }
            if (!apk.startsWith("https://")) return "";
            JSONObject out = new JSONObject();
            out.put("versionCode", code);
            out.put("versionName", tag);
            out.put("apkUrl", apk);
            out.put("notes", release.optString("body", ""));
            return out.toString();
        } catch (Exception error) {
            return "";
        }
    }
}
