#!/usr/bin/env node
/**
 * Deploy dist/ to the web host with rsync over SSH.
 *
 * Used by BOTH deployment methods so they produce identical results:
 *   Method A (your computer):  npm run deploy:dry   /   npm run deploy
 *   Method B (GitHub Actions): node scripts/deploy.mjs --ci
 *
 * Safety rules baked in:
 *   - Never deletes outside DEPLOY_REMOTE_PATH (rsync only touches the
 *     destination folder), and refuses suspiciously short remote paths.
 *   - Items listed in deploy/excludes.txt (.well-known/, cgi-bin/, ...) are
 *     never uploaded over or deleted.
 *   - Refuses to run if dist/ is missing or empty, so a failed build can't
 *     wipe the live site.
 *   - First use against a given server is a dry run only. After that, a real
 *     deploy needs you to type "deploy" (or pass --yes).
 *
 * Options:
 *   --dry-run     Show what would change; change nothing.
 *   --yes         Skip the typed confirmation on a real deploy.
 *   --no-delete   Upload and update only; never delete files on the server.
 *   --no-build    Don't run `npm run build` first (the workflow builds separately).
 *   --ci          Non-interactive: no prompts, no first-use dry-run gate,
 *                 strict host-key checking if DEPLOY_KNOWN_HOSTS_FILE is set.
 *   --help        Show this help.
 *
 * Configuration (from .env, or real environment variables, which win):
 *   DEPLOY_HOST, DEPLOY_PORT, DEPLOY_USER, DEPLOY_SSH_KEY, DEPLOY_REMOTE_PATH
 *   Optional: DEPLOY_KNOWN_HOSTS_FILE (pin the server's host key; used by CI)
 *   Debug:    DEPLOY_PRINT_ONLY=1 prints the rsync command and exits.
 */

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const EXCLUDES = path.join(ROOT, "deploy", "excludes.txt");
const STATE_FILE = path.join(ROOT, ".deploy-state.json");

const KNOWN_FLAGS = new Set(["--dry-run", "--yes", "--no-delete", "--no-build", "--ci", "--help"]);
const argv = process.argv.slice(2);
for (const a of argv) {
  if (!KNOWN_FLAGS.has(a)) fail(`Unknown option "${a}". Run with --help.`);
}
const flag = (name) => argv.includes(name);

function fail(message, code = 1) {
  console.error(`\n✖ ${message}\n`);
  process.exit(code);
}

if (flag("--help")) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
  console.log(src.match(/\/\*\*([\s\S]*?)\*\//)[1].replace(/^ \* ?/gm, "").trim());
  process.exit(0);
}

const CI = flag("--ci");
const DRY = flag("--dry-run");

// ---- Configuration ----------------------------------------------------------

const envFile = path.join(ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile); // real env vars take precedence

const expandHome = (p) => (p === "~" ? os.homedir() : p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p);

function loadConfig() {
  const env = process.env;
  const missing = ["DEPLOY_HOST", "DEPLOY_USER", "DEPLOY_SSH_KEY", "DEPLOY_REMOTE_PATH"].filter((k) => !env[k]?.trim());
  if (missing.length) {
    fail(
      `Missing setting${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.\n` +
        `  Copy .env.example to .env and fill it in (CI: set repository Secrets/Variables).`,
    );
  }

  const host = env.DEPLOY_HOST.trim();
  if (!/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(host)) fail(`DEPLOY_HOST "${host}" doesn't look like a host name or IP address.`);

  const portText = (env.DEPLOY_PORT ?? "22").trim() || "22";
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`DEPLOY_PORT "${portText}" must be a number from 1 to 65535.`);

  const user = env.DEPLOY_USER.trim();
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(user)) fail(`DEPLOY_USER "${user}" contains unexpected characters.`);

  const key = expandHome(env.DEPLOY_SSH_KEY.trim());
  if (/["\n]/.test(key)) fail("DEPLOY_SSH_KEY must not contain quotes or line breaks.");
  if (!fs.existsSync(key)) fail(`SSH key not found at ${key}. Check DEPLOY_SSH_KEY.`);

  let knownHosts = env.DEPLOY_KNOWN_HOSTS_FILE?.trim() ? expandHome(env.DEPLOY_KNOWN_HOSTS_FILE.trim()) : "";
  if (knownHosts) {
    if (/["\n]/.test(knownHosts)) fail("DEPLOY_KNOWN_HOSTS_FILE must not contain quotes or line breaks.");
    if (!fs.existsSync(knownHosts) || fs.statSync(knownHosts).size === 0) {
      fail(`DEPLOY_KNOWN_HOSTS_FILE (${knownHosts}) is missing or empty. Refusing to connect without a pinned host key.`);
    }
  } else if (CI) {
    fail("CI deploys require DEPLOY_KNOWN_HOSTS_FILE so the server's host key is verified (strict checking stays on).");
  }

  // Remote path: strict allow-list, normalized, and never something broad.
  let remote = env.DEPLOY_REMOTE_PATH.trim();
  if (!/^[A-Za-z0-9._/~-]+$/.test(remote)) fail(`DEPLOY_REMOTE_PATH "${remote}" has unexpected characters (allowed: letters, digits, . _ - / ~).`);
  const wasRoot = /^\/+$/.test(remote);
  remote = remote.replace(/\/+$/, "");
  if (wasRoot) fail("DEPLOY_REMOTE_PATH is the server root (/). Refusing: it must be your web root, e.g. /home/<user>/public_html.");
  const segments = remote.split("/").filter(Boolean);
  if (segments.includes("..") || segments.includes(".")) fail('DEPLOY_REMOTE_PATH must not contain "." or ".." segments.');
  if (remote.startsWith("/")) {
    if (segments.length < 3) {
      fail(`DEPLOY_REMOTE_PATH "${remote}" is too short to be a safe web root. Expected something like /home/<user>/public_html.`);
    }
  } else if (remote.startsWith("~") || segments.length < 1) {
    fail('DEPLOY_REMOTE_PATH must be an absolute path (e.g. /home/<user>/public_html) or a folder name relative to your home, such as "public_html".');
  }

  return { host, port, user, key, knownHosts, remote };
}

// ---- Helpers ----------------------------------------------------------------

function runBuild() {
  console.log("▶ Building the site (npm run build)…");
  const r = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) fail("Build failed. Nothing was uploaded.");
}

function ensureDist() {
  const index = path.join(DIST, "index.html");
  if (!fs.existsSync(index)) fail("dist/index.html not found. Build first (npm run build). Nothing was uploaded.");
  if (!fs.existsSync(path.join(DIST, ".htaccess"))) fail("dist/.htaccess not found. The build looks incomplete. Nothing was uploaded.");
}

function sshCommand(cfg) {
  const parts = ["ssh", "-p", String(cfg.port), "-i", `"${cfg.key}"`, "-o", "IdentitiesOnly=yes"];
  if (CI) parts.push("-o", "BatchMode=yes");
  if (cfg.knownHosts) parts.push("-o", `"UserKnownHostsFile=${cfg.knownHosts}"`, "-o", "StrictHostKeyChecking=yes");
  return parts.join(" ");
}

function rsyncArgs(cfg, { dry }) {
  const args = [
    "-rpz", // recursive, set permissions, compress
    "--checksum", // compare content, not timestamps (CI and local builds differ in mtimes)
    "--chmod=D755,F644", // same permissions regardless of who/where built it
    "--omit-dir-times",
    "--itemize-changes",
    "--human-readable",
    "--stats",
    `--exclude-from=${EXCLUDES}`,
  ];
  if (!flag("--no-delete")) args.push("--delete"); // never --delete-excluded: protected items stay protected
  if (dry) args.push("--dry-run");
  args.push("-e", sshCommand(cfg), `${DIST}/`, `${cfg.user}@${cfg.host}:${cfg.remote}/`);
  return args;
}

function checkRsync() {
  const r = spawnSync("rsync", ["--version"], { encoding: "utf8" });
  if (r.error || r.status !== 0) {
    fail(
      "rsync was not found on this computer.\n" +
        "  macOS/Linux: install it with your package manager (macOS ships one; Homebrew has a newer rsync).\n" +
        "  Windows: use WSL or Git Bash with rsync, or use the SFTP fallback in the README.",
    );
  }
}

function runRsync(args, { quiet = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn("rsync", args, { stdio: ["inherit", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => {
      out += d;
      if (!quiet) process.stdout.write(d);
    });
    child.on("error", (e) => fail(`Could not start rsync: ${e.message}`));
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

function summarize(out) {
  const lines = out.split("\n");
  return {
    uploads: lines.filter((l) => /^[<>]f/.test(l)).length,
    deletions: lines.filter((l) => l.startsWith("*deleting")).map((l) => l.replace(/^\*deleting\s+/, "")),
  };
}

const targetKey = (cfg) =>
  crypto.createHash("sha256").update(`${cfg.user}@${cfg.host}:${cfg.port}:${cfg.remote}`).digest("hex").slice(0, 16);

const readState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
};
function markDryRunDone(cfg) {
  const state = readState();
  state[targetKey(cfg)] = { target: `${cfg.user}@${cfg.host}:${cfg.remote}`, dryRunAt: new Date().toISOString() };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

// ---- Main -------------------------------------------------------------------

const cfg = loadConfig();
const where = `${cfg.user}@${cfg.host}:${cfg.port} → ${cfg.remote}/`;

if (!CI && !flag("--no-build")) runBuild();
ensureDist();

if (process.env.DEPLOY_PRINT_ONLY === "1") {
  console.log(["rsync", ...rsyncArgs(cfg, { dry: DRY })].map((a) => (/\s/.test(a) ? `'${a}'` : a)).join(" "));
  process.exit(0);
}

checkRsync();

if (DRY) {
  console.log(`▶ DRY RUN (nothing will change): ${where}\n`);
  const { code } = await runRsync(rsyncArgs(cfg, { dry: true }));
  if (code !== 0) fail(`rsync exited with code ${code}. See the messages above.`, code);
  if (!CI) markDryRunDone(cfg);
  console.log("\n✔ Dry run finished. Nothing was changed on the server.");
  if (!CI) console.log("  Looks right? Run: npm run deploy");
  process.exit(0);
}

if (CI) {
  console.log(`▶ Deploying: ${where}\n`);
  const { code } = await runRsync(rsyncArgs(cfg, { dry: false }));
  if (code !== 0) fail(`rsync exited with code ${code}.`, code);
  console.log("\n✔ Deployed.");
  process.exit(0);
}

// Local real deploy: first use of a target is a dry run only.
if (!readState()[targetKey(cfg)]) {
  console.log(`▶ First deploy to this server (${where}): running a DRY RUN only.\n`);
  const { code } = await runRsync(rsyncArgs(cfg, { dry: true }));
  if (code !== 0) fail(`rsync exited with code ${code}. See the messages above.`, code);
  markDryRunDone(cfg);
  console.log("\n✔ Dry run finished. Nothing was changed on the server.");
  console.log("  Review the list above. If it looks right, run `npm run deploy` again to upload for real.");
  process.exit(0);
}

// Preview, then confirm.
console.log(`▶ Checking what would change: ${where}`);
const preview = await runRsync(rsyncArgs(cfg, { dry: true }), { quiet: true });
if (preview.code !== 0) fail(`rsync exited with code ${preview.code} during the preview. Nothing was changed.`, preview.code);
const { uploads, deletions } = summarize(preview.out);
console.log(`  ${uploads} file(s) to upload or update, ${deletions.length} file(s) to delete.`);
if (deletions.length) {
  for (const d of deletions.slice(0, 40)) console.log(`    delete: ${d}`);
  if (deletions.length > 40) console.log(`    …and ${deletions.length - 40} more`);
}

if (!flag("--yes")) {
  if (!process.stdin.isTTY) fail("Not an interactive terminal. Re-run with --yes to deploy without a prompt.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`\nType "deploy" to upload to ${where}  `)).trim();
  rl.close();
  if (answer !== "deploy") fail("Cancelled. Nothing was changed.", 0);
}

console.log("\n▶ Uploading…\n");
const real = await runRsync(rsyncArgs(cfg, { dry: false }));
if (real.code !== 0) fail(`rsync exited with code ${real.code}.`, real.code);
console.log("\n✔ Deployed.");
