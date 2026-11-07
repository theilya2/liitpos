import { spawn } from "node:child_process";
import { loadSecretFiles, preflight } from "./scripts/standalone-host.mjs";

loadSecretFiles(process.env);
try {
  preflight(process.env);
} catch (error) {
  console.error(`[liitpos] ${error instanceof Error ? error.message : "startup refused"}`);
  process.exit(1);
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    const stop = (signal) => child.kill(signal);
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    child.on("exit", (code, signal) => {
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
      if (signal) process.kill(process.pid, signal);
      resolve(code ?? 1);
    });
  });
}

const migrated = await run(["scripts/migrate.mjs"]);
if (migrated !== 0) process.exit(migrated);
process.exit(await run([".output/server/index.mjs"]));
