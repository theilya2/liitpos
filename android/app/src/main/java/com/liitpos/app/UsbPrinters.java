package com.liitpos.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * USB ESC/POS output. Selection matches pickPrinter in src/lib/pos/printer.ts:
 * product name (default "Default"), then the first printer, else the caller
 * falls back to the system print dialog. The permission dialog is shown once
 * per printer unless Settings asks again.
 */
final class UsbPrinters {
    static final String ACTION = "com.liitpos.app.USB_PERMISSION";

    interface Emitter {
        void emit(String event, String detailJson);
    }

    private final Activity activity;
    private final UsbManager usb;
    private final SharedPreferences prefs;
    private final Emitter emitter;
    private final Object permissionLock = new Object();
    private final Object ioLock = new Object();
    private String permissionDevice = "";
    private boolean permissionGranted;

    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (intent == null || !ACTION.equals(intent.getAction())) return;
            UsbDevice device = readDevice(intent);
            boolean granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
            synchronized (permissionLock) {
                permissionDevice = device == null || device.getDeviceName() == null ? "" : device.getDeviceName();
                permissionGranted = granted;
                permissionLock.notifyAll();
            }
            emitUsb(device, granted);
        }
    };

    UsbPrinters(Activity activity, Emitter emitter) {
        this.activity = activity;
        this.usb = (UsbManager) activity.getSystemService(Context.USB_SERVICE);
        this.prefs = activity.getSharedPreferences("liitpos", Context.MODE_PRIVATE);
        this.emitter = emitter;
    }

    void register() {
        IntentFilter filter = new IntentFilter(ACTION);
        if (Build.VERSION.SDK_INT >= 33) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(receiver, filter);
        }
    }

    void unregister() {
        try {
            activity.unregisterReceiver(receiver);
        } catch (Exception ignored) {
            /* already gone */
        }
    }

    String listJson() {
        JSONArray array = new JSONArray();
        if (usb == null) return "[]";
        for (UsbDevice device : sorted()) {
            JSONObject item = new JSONObject();
            try {
                String name = device.getProductName();
                item.put("name", name == null ? "" : name);
                item.put("deviceName", device.getDeviceName() == null ? "" : device.getDeviceName());
                item.put("vendorId", device.getVendorId());
                item.put("productId", device.getProductId());
                item.put("printer", isPrinter(device));
                item.put("hasPermission", usb.hasPermission(device));
                array.put(item);
            } catch (Exception ignored) {
                /* skip a device we cannot describe */
            }
        }
        return array.toString();
    }

    void printAsync(String json) {
        new Thread(() -> {
            String id = "";
            try {
                JSONObject job = new JSONObject(json == null ? "{}" : json);
                id = job.optString("id", "");
                synchronized (ioLock) {
                    UsbDevice device = resolve(job.optString("printerName", "Default"));
                    if (device == null) {
                        emitPrint(id, "fallback", "no-printer");
                        return;
                    }
                    byte[] payload = ReceiptBitmap.encode(job);
                    if (!write(device, payload)) {
                        emitPrint(id, "fallback", "write-failed");
                        return;
                    }
                }
                emitPrint(id, "usb", "ok");
            } catch (Exception error) {
                android.util.Log.e("Liitpos", "usb print failed", error);
                emitPrint(id, "fallback", "error");
            }
        }).start();
    }

    void pulseAsync(String json) {
        new Thread(() -> {
            String id = "";
            try {
                JSONObject job = new JSONObject(json == null ? "{}" : json);
                id = job.optString("id", "");
                String status = "unavailable";
                synchronized (ioLock) {
                    UsbDevice device = resolve(job.optString("printerName", "Default"));
                    byte[] payload = new byte[] {0x1b, 0x40, 0x1b, 0x70, 0x00, 0x19, (byte) 0xfa};
                    if (device != null && write(device, payload)) status = "sent";
                }
                emitDrawer(id, status);
            } catch (Exception error) {
                emitDrawer(id, "unavailable");
            }
        }).start();
    }

    void requestPermission(String deviceName) {
        new Thread(() -> {
            UsbDevice device = findByPath(deviceName);
            boolean granted = false;
            if (device != null && usb != null) {
                synchronized (ioLock) {
                    granted = usb.hasPermission(device) || requestOnce(device);
                }
            }
            emitUsb(device, granted);
        }).start();
    }

    private UsbDevice resolve(String preferred) {
        if (usb == null) return null;
        UsbDevice chosen = pick(preferred);
        if (chosen != null) {
            if (usb.hasPermission(chosen)) return chosen;
            if (asked(chosen)) return null;
            return requestOnce(chosen) ? chosen : null;
        }
        for (UsbDevice device : sorted()) {
            if (usb.hasPermission(device) || asked(device)) continue;
            if (!requestOnce(device)) return null;
            break;
        }
        chosen = pick(preferred);
        if (chosen != null && usb.hasPermission(chosen)) return chosen;
        return null;
    }

    private UsbDevice pick(String preferred) {
        List<UsbDevice> devices = sorted();
        String wanted = preferred == null ? "" : preferred.trim().toLowerCase(Locale.ROOT);
        if (!wanted.isEmpty()) {
            for (UsbDevice device : devices) {
                String name = device.getProductName();
                if (name != null && name.trim().toLowerCase(Locale.ROOT).equals(wanted)) return device;
            }
        }
        for (UsbDevice device : devices) {
            if (isPrinter(device)) return device;
        }
        return null;
    }

    private static boolean isPrinter(UsbDevice device) {
        if (device.getDeviceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            if (device.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return true;
        }
        String name = device.getProductName();
        return name != null && name.toLowerCase(Locale.ROOT).contains("printer");
    }

    private List<UsbDevice> sorted() {
        if (usb == null) return Collections.emptyList();
        List<UsbDevice> devices = new ArrayList<>(usb.getDeviceList().values());
        devices.sort((left, right) -> {
            String a = left.getDeviceName() == null ? "" : left.getDeviceName();
            String b = right.getDeviceName() == null ? "" : right.getDeviceName();
            return a.compareTo(b);
        });
        return devices;
    }

    private UsbDevice findByPath(String deviceName) {
        if (deviceName == null || deviceName.isEmpty() || usb == null) return null;
        for (UsbDevice device : usb.getDeviceList().values()) {
            if (deviceName.equals(device.getDeviceName())) return device;
        }
        return null;
    }

    private boolean requestOnce(UsbDevice device) {
        markAsked(device);
        if (usb.hasPermission(device)) return true;
        synchronized (permissionLock) {
            permissionGranted = false;
            permissionDevice = "";
        }
        activity.runOnUiThread(() -> {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
            Intent intent = new Intent(ACTION);
            intent.setPackage(activity.getPackageName());
            PendingIntent pending = PendingIntent.getBroadcast(activity, 0, intent, flags);
            usb.requestPermission(device, pending);
        });
        long deadline = System.currentTimeMillis() + 45_000;
        synchronized (permissionLock) {
            String path = device.getDeviceName() == null ? "" : device.getDeviceName();
            while (!path.equals(permissionDevice) && System.currentTimeMillis() < deadline) {
                long wait = deadline - System.currentTimeMillis();
                if (wait <= 0) break;
                try {
                    permissionLock.wait(Math.min(wait, 500));
                } catch (InterruptedException error) {
                    Thread.currentThread().interrupt();
                    return false;
                }
            }
            return device.getDeviceName() != null
                    && device.getDeviceName().equals(permissionDevice)
                    && permissionGranted;
        }
    }

    private boolean asked(UsbDevice device) {
        return prefs.getBoolean(askedKey(device), false);
    }

    private void markAsked(UsbDevice device) {
        prefs.edit().putBoolean(askedKey(device), true).apply();
    }

    private String askedKey(UsbDevice device) {
        return "usb-asked-" + device.getVendorId() + "-" + device.getProductId();
    }

    private boolean write(UsbDevice device, byte[] payload) {
        OutPipe pipe = findOut(device);
        if (pipe == null || usb == null) return false;
        UsbDeviceConnection connection = usb.openDevice(device);
        if (connection == null) return false;
        try {
            if (!connection.claimInterface(pipe.iface, true)) return false;
            int offset = 0;
            while (offset < payload.length) {
                int length = Math.min(2048, payload.length - offset);
                int wrote = connection.bulkTransfer(pipe.endpoint, payload, offset, length, 8000);
                if (wrote <= 0) return false;
                offset += wrote;
            }
            return true;
        } finally {
            try {
                connection.releaseInterface(pipe.iface);
            } catch (Exception ignored) {
                /* already released */
            }
            connection.close();
        }
    }

    private OutPipe findOut(UsbDevice device) {
        OutPipe fallback = null;
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface iface = device.getInterface(i);
            for (int endpointIndex = 0; endpointIndex < iface.getEndpointCount(); endpointIndex++) {
                UsbEndpoint endpoint = iface.getEndpoint(endpointIndex);
                if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_BULK) continue;
                if (endpoint.getDirection() != UsbConstants.USB_DIR_OUT) continue;
                OutPipe pipe = new OutPipe(iface, endpoint);
                if (iface.getInterfaceClass() == UsbConstants.USB_CLASS_PRINTER) return pipe;
                if (fallback == null) fallback = pipe;
            }
        }
        return fallback;
    }

    private void emitPrint(String id, String status, String reason) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("id", id);
            detail.put("status", status);
            detail.put("reason", reason);
            emitter.emit("liitpos-print", detail.toString());
        } catch (Exception ignored) {
            /* the page treats a missing event as a fallback */
        }
    }

    private void emitDrawer(String id, String status) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("id", id);
            detail.put("status", status);
            emitter.emit("liitpos-drawer", detail.toString());
        } catch (Exception ignored) {
            /* same as an unavailable drawer */
        }
    }

    private void emitUsb(UsbDevice device, boolean granted) {
        try {
            JSONObject detail = new JSONObject();
            detail.put("deviceName", device == null || device.getDeviceName() == null ? "" : device.getDeviceName());
            detail.put("granted", granted);
            emitter.emit("liitpos-usb", detail.toString());
        } catch (Exception ignored) {
            /* the settings screen refreshes on its own */
        }
    }

    @SuppressWarnings("deprecation")
    private static UsbDevice readDevice(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) {
            return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE, UsbDevice.class);
        }
        return intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
    }

    private static final class OutPipe {
        final UsbInterface iface;
        final UsbEndpoint endpoint;

        OutPipe(UsbInterface iface, UsbEndpoint endpoint) {
            this.iface = iface;
            this.endpoint = endpoint;
        }
    }
}
