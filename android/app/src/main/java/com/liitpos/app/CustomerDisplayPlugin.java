package com.liitpos.app;

import android.app.Presentation;
import android.content.Context;
import android.hardware.display.DisplayManager;
import android.os.Bundle;
import android.view.Display;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Customer-facing screen for dual-display Android registers (Sunmi D/T and others).
 * A phone or a single-screen device reports no presentation display and stays quiet.
 */
@CapacitorPlugin(name = "CustomerDisplay")
public class CustomerDisplayPlugin extends Plugin {
    private CustomerPresentation presentation;
    private boolean enabled = true;
    private String lastPayload = "{\"mode\":\"idle\"}";

    @PluginMethod
    public void getInfo(PluginCall call) {
        Display[] displays = presentationDisplays();
        JSObject result = new JSObject();
        result.put("count", displays.length);
        result.put("available", displays.length > 0);
        call.resolve(result);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        if (!enabled) dismiss();
        else show(lastPayload);
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        String payload = call.getString("payload", "{}");
        if (payload == null || !payload.startsWith("{") || payload.length() > 2_000_000) {
            call.reject("payload");
            return;
        }
        lastPayload = payload;
        if (enabled) show(payload);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        dismiss();
        super.handleOnDestroy();
    }

    private Display[] presentationDisplays() {
        Context context = getContext();
        if (context == null) return new Display[0];
        DisplayManager manager = (DisplayManager) context.getSystemService(Context.DISPLAY_SERVICE);
        if (manager == null) return new Display[0];
        Display[] found = manager.getDisplays(DisplayManager.DISPLAY_CATEGORY_PRESENTATION);
        if (found.length > 0) return found;
        int extra = 0;
        for (Display display : manager.getDisplays()) {
            if (display.getDisplayId() != Display.DEFAULT_DISPLAY) extra += 1;
        }
        if (extra == 0) return new Display[0];
        Display[] rest = new Display[extra];
        int index = 0;
        for (Display display : manager.getDisplays()) {
            if (display.getDisplayId() != Display.DEFAULT_DISPLAY) rest[index++] = display;
        }
        return rest;
    }

    private void show(String payload) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            Display[] displays = presentationDisplays();
            if (displays.length == 0) {
                dismissOnUi();
                return;
            }
            Display display = displays[0];
            if (presentation == null || presentation.getDisplay() != display || !presentation.isShowing()) {
                dismissOnUi();
                presentation = new CustomerPresentation(getActivity(), display);
                try {
                    presentation.show();
                } catch (RuntimeException ignored) {
                    presentation = null;
                    return;
                }
            }
            presentation.push(payload);
        });
    }

    private void dismiss() {
        if (getActivity() == null) {
            dismissOnUi();
            return;
        }
        getActivity().runOnUiThread(this::dismissOnUi);
    }

    private void dismissOnUi() {
        if (presentation != null) {
            try {
                presentation.dismiss();
            } catch (RuntimeException ignored) {
                // The display may already be gone.
            }
            presentation = null;
        }
    }

    private static final class CustomerPresentation extends Presentation {
        private WebView web;
        private String pending;
        private boolean ready;

        CustomerPresentation(Context outer, Display display) {
            super(outer, display);
        }

        @Override
        protected void onCreate(Bundle savedInstanceState) {
            super.onCreate(savedInstanceState);
            web = new WebView(getContext());
            web.setBackgroundColor(0xFF10241C);
            web.getSettings().setJavaScriptEnabled(true);
            web.getSettings().setDomStorageEnabled(true);
            web.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    ready = true;
                    if (pending != null) push(pending);
                }
            });
            setContentView(web);
            web.loadUrl("file:///android_asset/customer-display.html");
        }

        void push(String json) {
            pending = json;
            if (!ready || web == null) return;
            web.evaluateJavascript("window.liitposShow(" + json + ")", null);
        }
    }
}
