package com.liitpos.app;

import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

/** Keeps a WebView on the light register theme when the device is in night mode. */
final class WebLight {
    static final int BACKGROUND = 0xFFFBF9FF;

    private WebLight() {}

    static void apply(WebView webView) {
        if (webView == null) return;
        webView.setBackgroundColor(BACKGROUND);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
            WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.getSettings(), false);
        } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(webView.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
        }
    }
}
