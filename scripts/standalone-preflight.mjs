import { loadSecretFiles, preflight } from "./standalone-host.mjs";

loadSecretFiles(process.env);
try {
  preflight(process.env);
} catch (error) {
  console.error(`[liitpos] ${error instanceof Error ? error.message : "startup refused"}`);
  process.exit(1);
}
