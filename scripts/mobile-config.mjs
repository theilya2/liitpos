/**
 * Write capacitor.config.json from mobile/app.json.
 *
 * Capacitor reads the JSON directly. Keeping the editable values in
 * mobile/app.json means the app name, id, and site address live in one place.
 * `CAPACITOR_SERVER_URL` overrides the site for a single sync (do not commit
 * that override).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const app = JSON.parse(readFileSync(join(root, "mobile", "app.json"), "utf8"));
const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || app.serverUrl;

if (!/^https:\/\/[^\s/]+/i.test(serverUrl)) {
  console.error(`Liitpos mobile shell only loads an https site (got ${serverUrl}).`);
  process.exit(1);
}

if (!/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_-]*)+$/.test(app.appId)) {
  console.error(`App id "${app.appId}" is not a valid bundle id. Edit mobile/app.json.`);
  process.exit(1);
}

const config = {
  appId: app.appId,
  appName: app.appName,
  webDir: "mobile/www",
  server: {
    url: serverUrl,
    cleartext: false,
    androidScheme: "https",
    allowNavigation: app.allowNavigation,
    errorPath: "index.html",
  },
  android: {
    allowMixedContent: false,
    backgroundColor: app.backgroundColor,
  },
  ios: {
    backgroundColor: "#F3EEE6",
    contentInset: "never",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1200,
      backgroundColor: app.backgroundColor,
      androidScaleType: "CENTER",
      showSpinner: false,
      splashFullScreen: false,
      splashImmersive: false,
    },
    StatusBar: {
      style: "LIGHT",
      overlaysWebView: true,
    },
  },
};

writeFileSync(join(root, "capacitor.config.json"), `${JSON.stringify(config, null, 2)}\n`);
console.log(`[mobile-config] ${app.appName} (${app.appId}) → ${serverUrl}`);
