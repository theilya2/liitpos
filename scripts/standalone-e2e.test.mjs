import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { preflight } from "./standalone-host.mjs";

const root = join(import.meta.dirname, "..");
const serverEntry = join(root, ".output/server/index.mjs");
const pgBin = ["/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/17/bin"].find((dir) => existsSync(join(dir, "initdb"))) ?? "";
const initdb = pgBin ? join(pgBin, "initdb") : "";

function redact(text) {
  return text.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, "postgres://***@");
}

test("standalone server keeps data across restart and rejects anonymous admin calls", async (t) => {
  if (!existsSync(serverEntry) || !initdb) {
    if (process.env.LIITPOS_REQUIRE_E2E === "1") {
      assert.fail("standalone build and initdb are required");
    }
    t.skip("standalone server build or initdb is not present");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "liitpos-e2e-"));
  const password = randomBytes(24).toString("hex");
  const adminPassword = `isolated-${randomBytes(18).toString("hex")}`;
  const username = "register-owner";
  const port = 18081;
  const pgPort = 55432;
  const pwfile = join(dir, "pw");
  writeFileSync(pwfile, password, { mode: 0o600 });
  const data = join(dir, "pg");
  const init = spawnSync(
    initdb,
    ["-D", data, "--username=liitpos_app", `--pwfile=${pwfile}`, "--auth-local=trust", "--auth-host=scram-sha-256"],
    { encoding: "utf8" },
  );
  assert.equal(init.status, 0, redact(init.stderr || init.stdout || "initdb failed"));

  const postgres = join(pgBin, "postgres");
  const psql = join(pgBin, "psql");
  const pg = spawn(postgres, ["-D", data, "-h", "127.0.0.1", "-p", String(pgPort), "-k", dir], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let pgLog = "";
  pg.stderr.on("data", (chunk) => {
    pgLog += chunk.toString();
  });

  const databaseUrl = `postgres://liitpos_app:${encodeURIComponent(password)}@127.0.0.1:${pgPort}/liitpos`;
  const env = {
    ...process.env,
    NODE_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(port),
    NITRO_HOST: "127.0.0.1",
    NITRO_PORT: String(port),
    ADMIN_USERNAME: username,
    ADMIN_PASSWORD: adminPassword,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: "https://liitpos.185-250-36-27.sslip.io",
  };
  delete env.LIITPOS_STANDALONE;
  preflight(env);

  const readyDeadline = Date.now() + 15000;
  let ready = false;
  while (Date.now() < readyDeadline) {
    const probe = spawnSync(psql, ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "liitpos_app", "-d", "postgres", "-c", "select 1"], {
      encoding: "utf8",
      env: { ...env, PGPASSWORD: password },
    });
    if (probe.status === 0) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(ready, true, redact(pgLog || "postgres did not accept connections"));

  const created = spawnSync(
    psql,
    ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "liitpos_app", "-d", "postgres", "-c", "create database liitpos"],
    { encoding: "utf8", env: { ...env, PGPASSWORD: password } },
  );
  assert.equal(created.status, 0, redact(created.stderr || created.stdout || "create database failed"));

  const logs = [];
  function startApp() {
    const child = spawn(process.execPath, [".output/server/index.mjs"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const record = (chunk) => {
      logs.push(redact(chunk.toString()));
      if (logs.length > 40) logs.shift();
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    return child;
  }

  async function waitHealth() {
    const deadline = Date.now() + 30000;
    let last = "";
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) return;
        last = String(response.status);
      } catch (error) {
        last = error instanceof Error ? error.message : "unreachable";
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    assert.fail(`health did not become ready (${last})\n${logs.join("")}\n${redact(pgLog)}`);
  }

  const migrated = spawnSync(process.execPath, ["scripts/migrate.mjs"], { cwd: root, env, encoding: "utf8" });
  assert.equal(migrated.status, 0, redact(`${migrated.stdout}\n${migrated.stderr}`));

  let app = startApp();
  try {
    await waitHealth();
    const anonymous = await fetch(`http://127.0.0.1:${port}/api/admin/session`);
    assert.equal(anonymous.status, 401);
    const sync = await fetch(`http://127.0.0.1:${port}/api/pos/sync`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: "{}",
    });
    assert.equal(sync.status, 401);
    const oldToken = await fetch(`http://127.0.0.1:${port}/api/pos/sync`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://localhost",
        authorization: "Bearer old-vercel-device-token",
      },
      body: JSON.stringify({ op: "pull", since: null }),
    });
    assert.equal(oldToken.status, 401);
    const deviceId = "ab".repeat(32);
    const activation = await fetch(`http://127.0.0.1:${port}/api/pos/activation/request`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://localhost" },
      body: JSON.stringify({
        deviceId,
        sources: [{ source: "random", deviceId }],
        model: "isolated",
        appVersion: "1.0.1025",
      }),
    });
    const activationBody = await activation.json();
    assert.equal(activation.status, 200, activationBody.error ?? "activation failed");
    assert.equal(typeof activationBody.code, "string");
    assert.ok((activationBody.code ?? "").length >= 6);
    const sales = spawnSync(
      psql,
      ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "liitpos_app", "-d", "liitpos", "-tAc", "select count(*) from pos_docs where kind = 'sale'"],
      { encoding: "utf8", env: { ...env, PGPASSWORD: password } },
    );
    assert.equal(sales.status, 0, redact(sales.stderr || sales.stdout || "sale count failed"));
    assert.equal(sales.stdout.trim(), "0");
    const wrong = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "not-the-password" }),
    });
    assert.equal(wrong.status, 401);

    const login = await fetch(`http://127.0.0.1:${port}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: adminPassword }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie") ?? "";
    assert.match(cookie, /liitpos_admin=/);
    const session = await fetch(`http://127.0.0.1:${port}/api/admin/session`, { headers: { cookie } });
    assert.equal(session.status, 200);

    app.kill("SIGTERM");
    await new Promise((resolve) => app.on("exit", resolve));
    app = startApp();
    await waitHealth();
    const again = await fetch(`http://127.0.0.1:${port}/api/admin/session`, { headers: { cookie } });
    assert.equal(again.status, 200);
    const stillAnonymous = await fetch(`http://127.0.0.1:${port}/api/admin/session`);
    assert.equal(stillAnonymous.status, 401);
  } finally {
    app.kill("SIGTERM");
    await new Promise((resolve) => app.on("exit", resolve));
    pg.kill("SIGTERM");
    await new Promise((resolve) => pg.on("exit", resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
