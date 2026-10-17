import { createFileRoute } from "@tanstack/react-router";
import { withCors } from "@/lib/pos/http.server";
import { versionFromTag } from "@/lib/pos/release-version";

const REPO = "theilya2/Liitpos";

type ReleaseAsset = { name?: string; url?: string; browser_download_url?: string };
type Release = { tag_name?: string; body?: string; assets?: ReleaseAsset[] };

function json(request: Request, body: unknown, status = 200) {
  return withCors(
    request,
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
  );
}

function githubHeaders(accept: string) {
  const token = process.env.LIITPOS_GITHUB_TOKEN?.trim();
  const headers: Record<string, string> = { Accept: accept, "user-agent": "liitpos-update" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function latestRelease(): Promise<Release | null> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: githubHeaders("application/vnd.github+json"),
  });
  if (!response.ok) return null;
  return (await response.json()) as Release;
}

function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

async function redirectToApk(request: Request, release: Release) {
  const apk = release.assets?.find((asset) => asset.name === "liitpos-release.apk");
  if (!apk) return json(request, { error: "no apk" }, 404);
  if (apk.url && process.env.LIITPOS_GITHUB_TOKEN?.trim()) {
    const asset = await fetch(apk.url, {
      headers: githubHeaders("application/octet-stream"),
      redirect: "manual",
    });
    const location = asset.headers.get("location");
    if (location?.startsWith("https://")) return withCors(request, Response.redirect(location, 302));
  }
  if (apk.browser_download_url?.startsWith("https://")) {
    return withCors(request, Response.redirect(apk.browser_download_url, 302));
  }
  return json(request, { error: "no apk" }, 404);
}

export const Route = createFileRoute("/api/pos/update")({
  server: {
    handlers: {
      OPTIONS: ({ request }) => withCors(request, new Response(null, { status: 204 })),
      GET: async ({ request }) => {
        try {
          const release = await latestRelease();
          if (!release) return json(request, { error: "no release" }, 404);
          const download = new URL(request.url).searchParams.get("download") === "1";
          if (download) return redirectToApk(request, release);
          const version = versionFromTag(release.tag_name ?? "");
          if (!version) return json(request, { error: "release incomplete" }, 404);
          return json(request, {
            versionCode: version.versionCode,
            versionName: version.versionName,
            apkUrl: `${publicOrigin(request)}/api/pos/update?download=1`,
            notes: (release.body ?? "").slice(0, 280),
          });
        } catch (error) {
          console.error("[pos-update]", error);
          return json(request, { error: "update lookup failed" }, 502);
        }
      },
    },
  },
});
