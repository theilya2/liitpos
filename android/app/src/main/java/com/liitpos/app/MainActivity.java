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
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
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
    private boolean lockWanted;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        usbPrinters = new UsbPrinters(this, (event, detail) -> {
            WebView webView = getBridge().getWebView();
            String script = "window.dispatchEvent(new CustomEvent(" + JSONObject.quote(event) + ",{detail:" + detail + "}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        });
        usbPrinters.register();
    }

    @Override
    public void onDestroy() {
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
        if (lockWanted) {
            try {
                startLockTask();
            } catch (Exception ignored) {
                // Pinning can fail until the device-owner step in ANDROID.md.
            }
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    /** Real serial only. ANDROID_ID already survives reinstall; a missing serial stays empty. */
    @SuppressWarnings("deprecation")
    private String deviceSerial() {
        try {
            String serial = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? Build.getSerial() : Build.SERIAL;
            if (serial == null) return "";
            String trimmed = serial.trim();
            if (trimmed.isEmpty() || trimmed.equalsIgnoreCase("unknown")) return "";
            return trimmed.replace("\n", "").replace("\r", "");
        } catch (Throwable ignored) {
            return "";
        }
    }

    /**
     * Same bytes as activationMaterial("android") in the web app.
     * The build fingerprint is not mixed in: a system update would change the code.
     */
    private String activationMaterial() {
        String androidId = Settings.Secure.getString(getContentResolver(), Settings.Secure.ANDROID_ID);
        if (androidId == null) androidId = "";
        androidId = androidId.replace("\n", "").replace("\r", "").trim();
        return "v1\n" + androidId + "\n" + deviceSerial();
    }

    private byte[] sha256(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (Exception error) {
            return new byte[32];
        }
    }

    private String hex(byte[] hash) {
        StringBuilder out = new StringBuilder(hash.length * 2);
        for (byte value : hash) out.append(String.format("%02x", value & 0xff));
        return out.toString();
    }

    private String activationCode(byte[] hash) {
        String alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        StringBuilder code = new StringBuilder(7);
        for (int index = 0; index < 6; index++) {
            if (index == 3) code.append('-');
            code.append(alphabet.charAt(hash[index] & 31));
        }
        return code.toString();
    }

    private void applyLockTask(boolean enabled) {
        lockWanted = enabled;
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
        public String getActivationDeviceId() {
            return hex(sha256(activationMaterial()));
        }

        @JavascriptInterface
        public String getActivationCode() {
            return activationCode(sha256(activationMaterial()));
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
            new Thread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                            && !getPackageManager().canRequestPackageInstalls()) {
                        runOnUiThread(() -> startActivity(new Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName()))));
                        return;
                    }
                    HttpURLConnection connection = open(url, token);
                    int hops = 0;
                    while (hops < 5) {
                        int status = connection.getResponseCode();
                        if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308) break;
                        String location = connection.getHeaderField("Location");
                        connection.disconnect();
                        if (location == null || !location.startsWith("https://")) return;
                        connection = open(location, "");
                        hops++;
                    }
                    File out = new File(getCacheDir(), "liitpos-update.apk");
                    try (InputStream in = connection.getInputStream();
                            FileOutputStream fos = new FileOutputStream(out)) {
                        byte[] buffer = new byte[8192];
                        int read;
                        while ((read = in.read(buffer)) >= 0) fos.write(buffer, 0, read);
                    }
                    Uri uri = FileProvider.getUriForFile(
                            MainActivity.this, getPackageName() + ".fileprovider", out);
                    Intent install = new Intent(Intent.ACTION_VIEW);
                    install.setDataAndType(uri, "application/vnd.android.package-archive");
                    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    runOnUiThread(() -> startActivity(install));
                } catch (Exception error) {
                    android.util.Log.e("Liitpos", "update install failed", error);
                }
            }).start();
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

    private HttpURLConnection open(String url, String token) throws Exception {
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
