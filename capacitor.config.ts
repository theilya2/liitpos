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
};

export default config;
