import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";

/**
 * Static shell for the Android app. The website build in `vite.config.ts`
 * stays a Vercel server. This one prerenders a client shell so the APK can
 * open the register with no network. Cloud calls go to the saved server URL.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    grokPwaPlugin(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { outputPath: "/index", crawlLinks: false },
      },
    }),
    viteReact(),
  ],
});
