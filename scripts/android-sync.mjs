#!/usr/bin/env node
/**
 * Copy the static Android shell into `android/www` and sync the native project.
 * The website build is left alone. Run after `vite build --config vite.android.config.ts`.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const client = join(root, "dist", "client");
const www = join(root, "mobile", "www");
const index = join(client, "index.html");

if (!existsSync(index)) {
  console.error("android-sync: dist/client/index.html is missing. Build with vite.android.config.ts first.");
  process.exit(1);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
cpSync(client, www, { recursive: true });

const versionCode = process.env.LIITPOS_VERSION_CODE?.trim() || "1";
const versionName = process.env.LIITPOS_VERSION_NAME?.trim() || `1.0.${versionCode}`;
writeFileSync(join(www, "version.json"), JSON.stringify({ versionCode: Number(versionCode), versionName }, null, 2));

if (existsSync(join(root, "android", "app"))) {
  writeFileSync(
    join(root, "android", "version.properties"),
    `VERSION_CODE=${versionCode}\nVERSION_NAME=${versionName}\n`,
  );
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || "";
  if (sdk) writeFileSync(join(root, "android", "local.properties"), `sdk.dir=${sdk.replaceAll("\\", "\\\\")}\n`);
}

if (!existsSync(join(root, "android", "app"))) {
  console.log("android-sync: web assets are in android/www. The native project is not created yet.");
  process.exit(0);
}

const sync = spawnSync("npx", ["cap", "sync", "android"], { cwd: root, stdio: "inherit" });
process.exit(sync.status ?? 1);
