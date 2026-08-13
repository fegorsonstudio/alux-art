#!/usr/bin/env node
/**
 * verify-deploy.mjs — prove the server is running the code this repo says it is.
 *
 *   node scripts/verify-deploy.mjs            # source files that matter at runtime
 *   node scripts/verify-deploy.mjs --all      # every tracked file
 *   node scripts/verify-deploy.mjs --fix      # scp anything missing or stale
 *
 * WHY THIS EXISTS. Deploys here are file-by-file scp, so a file that is simply
 * never copied ships a feature that looks complete and does nothing. That is not
 * hypothetical: app/api/creator-dashboard/import-lighting/route.ts was the one
 * file of 84 in the resale commit that never reached the VPS. The panel fetched
 * it, got Next's 404 HTML, and rendered nothing at all — so for weeks every
 * creator saw blank space where "sell our lighting looks" should have been, with
 * no error anywhere. Nobody noticed until someone went looking for the button.
 *
 * It compares SHA-256 of each local file against the same path on the server, so
 * it catches three things a glance cannot: files never copied, files copied then
 * edited locally without redeploying, and files edited directly on the server.
 *
 * Read-only unless --fix is passed.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const HOST = process.env.DEPLOY_HOST || "root@178.104.133.89";
const REMOTE = process.env.DEPLOY_PATH || "/home/aluxart/app";
const ALL = process.argv.includes("--all");
const FIX = process.argv.includes("--fix");

// Files that change what the running app does. Everything else (carousel specs,
// one-off scripts, images) is noise in this check unless --all is asked for.
const RUNTIME = /^(app|lib|middleware\.ts|next\.config|package\.json)/;

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

const tracked = sh("git", ["ls-files"]).split("\n").filter(Boolean);
const files = ALL ? tracked : tracked.filter(f => RUNTIME.test(f));
if (!files.length) { console.error("no files matched"); process.exit(2); }

console.log(`checking ${files.length} file(s) against ${HOST}:${REMOTE}\n`);

// One ssh round trip, with the file list on STDIN rather than in argv: a few
// hundred paths inlined into the command blew past the OS argument limit
// (ENAMETOOLONG) and the check could not run at all.
const script =
  `while IFS= read -r f; do ` +
  `  if [ -f "${REMOTE}/$f" ]; then printf '%s %s\\n' "$(sha256sum "${REMOTE}/$f" | cut -d' ' -f1)" "$f"; ` +
  `  else printf 'MISSING %s\\n' "$f"; fi; ` +
  `done`;
const remote = execFileSync("ssh", [HOST, script], {
  // Trailing newline is required: `while read` discards a final line that has
  // none, which silently reported the alphabetically-last file (package.json)
  // as never deployed when it was sitting there the whole time.
  input: files.join("\n") + "\n", encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
});

const remoteHash = new Map();
for (const line of remote.split("\n")) {
  const i = line.indexOf(" ");
  if (i > 0) remoteHash.set(line.slice(i + 1).trim(), line.slice(0, i).trim());
}

const missing = [], stale = [];
for (const f of files) {
  const rh = remoteHash.get(f);
  if (!rh) { missing.push(f); continue; }
  if (rh === "MISSING") { missing.push(f); continue; }
  // Git stores LF; Windows checkouts may hold CRLF. Compare both so a line-ending
  // difference is not reported as a real drift.
  const local = readFileSync(f);
  if (sha(local) === rh) continue;
  if (sha(Buffer.from(local.toString("utf8").replace(/\r\n/g, "\n"), "utf8")) === rh) continue;
  stale.push(f);
}

if (missing.length) {
  console.log(`NEVER DEPLOYED (${missing.length}) — the failure mode this script exists for:`);
  for (const f of missing) console.log("   " + f);
  console.log();
}
if (stale.length) {
  console.log(`DIFFERENT ON THE SERVER (${stale.length}) — local edit not deployed, or edited on the box:`);
  for (const f of stale) console.log("   " + f);
  console.log();
}
if (!missing.length && !stale.length) console.log("in sync — every checked file matches.\n");

if (FIX && (missing.length || stale.length)) {
  for (const f of [...missing, ...stale]) {
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    if (dir) sh("ssh", [HOST, `mkdir -p '${REMOTE}/${dir}'`]);
    sh("scp", ["-q", f, `${HOST}:${REMOTE}/${f}`]);
    console.log("copied " + f);
  }
  console.log("\ncopied. A rebuild is still required for app/ or lib/ changes:");
  console.log(`  ssh ${HOST} "cd ${REMOTE} && NEXT_DIST_DIR=.next-fresh npm run build && rm -rf .next-old && mv .next .next-old && mv .next-fresh .next && pm2 reload aluxart"`);
} else if (missing.length || stale.length) {
  console.log("re-run with --fix to copy these up.");
  process.exitCode = 1;
}
