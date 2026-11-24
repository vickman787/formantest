import { readFileSync } from "node:fs";
import path from "node:path";
import { runNext } from "./lib/worker";

/** Load .env.local for the standalone worker (Next.js does this itself
 *  for the web server; tsx does not). */
try {
  const envFile = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of envFile.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env.local — env must come from the environment */
}

/** Long-lived worker process: `pnpm worker`. Leases one queued order at a
 *  time from Postgres. Run it separately from the web server so a slow
 *  render never blocks a web request. */
async function main() {
  console.log("[forma worker] started");
  for (;;) {
    try {
      const id = await runNext();
      if (id) console.log(`[forma worker] finished ${id}`);
    } catch (e) {
      console.error("[forma worker] tick failed:", e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main();
