import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PosFrame } from "@/components/pos/shell";
import appCss from "../styles.css?url";

const APP_NAME = "קופהקל";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover lets the Android WebView report safe-area insets.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "description", content: "קופה רושמת בעברית לחנויות, קיוסקים ובתי קפה בישראל" },
      { name: "color-scheme", content: "light" },
      { name: "theme-color", content: "#fbf9ff" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: () => (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <PosFrame>
            <Outlet />
          </PosFrame>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
