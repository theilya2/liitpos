import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android application id. Change this before the first public install if
 * `com.liitpos.app` is not the id you want — it cannot change later without
 * becoming a different app. The same value is in `android/app/build.gradle`
 * after `npx cap sync` (see ANDROID.md).
 */
const config: CapacitorConfig = {
  appId: "com.liitpos.app",
  appName: "Liitpos",
  webDir: "mobile/www",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
    hostname: "localhost",
  },
  plugins: {
    SystemBars: {
      // Edge-to-edge WebView. viewport-fit=cover is already in the document,
      // and this hint applies the same insets before that meta tag is read.
      // css also publishes --safe-area-inset-* for older WebViews.
      insetsHandling: "css",
      initialViewportFitValueHint: "cover",
      // Cream UI: dark status and gesture icons. The bars stay visible.
      style: "LIGHT",
    },
  },
};

export default config;
