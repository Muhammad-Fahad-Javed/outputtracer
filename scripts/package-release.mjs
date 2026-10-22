#!/usr/bin/env node
/**
 * package-release.mjs
 *
 * Build a production release on a development machine and package it as a
 * single tarball that can be copied to the production host and promoted.
 *
 * The production instance cannot build the application: a `next build` of
 * this codebase needs about 1.9 GB of resident memory (measured: ~1.4 GB
 * held by the Turbopack compiler in the parent process plus ~0.5 GB in the
 * TypeScript type-check worker) and the host has 913 MiB of RAM. Building
 * elsewhere and transferring the finished artefact removes the memory
 * requirement from the production host entirely.
 *
 * The archive contains the contents of the .next directory, so it extracts
 * directly into a distDir:
 *
 *   tar -xzf outputtracer-release-<sha>.tar.gz -C .next-candidate
 *
 * Usage:
 *   node scripts/package-release.mjs                 # build, then package
 *   node scripts/package-release.mjs --skip-build    # package an existing build
 *   node scripts/package-release.mjs --out release   # output directory
 *
 * The tarball and its .sha256 sidecar are written to the output directory.
 */

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, ".next");

function fail(msg) {
  console.error(`\nERROR: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { skipBuild: false, out: path.join(ROOT, "release") };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--skip-build") opts.skipBuild = true;
    else if (argv[i] === "--out") opts.out = path.resolve(argv[++i] || "");
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("usage: node scripts/package-release.mjs [--skip-build] [--out DIR]");
      process.exit(0);
    } else fail(`unknown argument: ${argv[i]}`);
  }
  return opts;
}

function run(cmd, args, opts = {}) {
  // On Windows npm is npm.cmd, which can only be started through the command
  // interpreter. Every other command here (tar.exe, node.exe) is a native
  // executable and must NOT be run through a shell: the arguments would then
  // be concatenated without escaping, and passing arguments to a shelled
  // child process is deprecated (DEP0190).
  const needsShell = process.platform === "win32" && /^npm(\.cmd)?$/i.test(cmd);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: ROOT,
    shell: needsShell,
    ...opts,
  });
  if (r.error) fail(`failed to run ${cmd}: ${r.error.message}`);
  if (r.status !== 0) fail(`${cmd} ${args.join(" ")} exited with ${r.status}`);
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

// Is npm usable on this machine?
//
// npm is the documented way to build, but it is a separate install from
// node and is not present on every machine that has to produce a release.
// The build itself is only the "next build" script, so the local Next.js
// CLI can be used directly instead. Both paths produce the same build.
function hasNpm() {
  // On Windows npm is npm.cmd, which can only be started through the
  // command interpreter. cmd.exe is called directly rather than through
  // the "shell" option, because passing arguments to a shelled child
  // process is deprecated (DEP0190).
  const probe =
    process.platform === "win32"
      ? spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --version"], {
          stdio: "ignore",
        })
      : spawnSync("npm", ["--version"], { stdio: "ignore" });
  return !probe.error && probe.status === 0;
}

// ---------------------------------------------------------------- preflight
const opts = parseArgs(process.argv.slice(2));

console.log("=== OutputTracer release packaging ===");

// tar is required. It ships with Windows 10+ (bsdtar) and with Amazon Linux.
// tar.exe is a native executable, so it does not need a shell.
const tarProbe = spawnSync("tar", ["--version"], { stdio: "ignore" });
if (tarProbe.error || tarProbe.status !== 0) {
  fail("tar was not found on PATH. It is required to create the release archive.");
}

const commit = git("rev-parse", "HEAD");
const short = git("rev-parse", "--short", "HEAD");
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`commit : ${commit}`);
console.log(`branch : ${branch}`);

if (git("status", "--porcelain")) {
  console.log("\nWARNING: the working tree has uncommitted changes.");
  console.log("         The artefact is built from the working tree, not from the commit.");
  console.log("         Commit or stash them so the release matches a known commit.");
}

// ------------------------------------------------------------------- build
//
// The deployment id identifies the release on the live site through the
// data-dpl-id attribute. Next.js bakes it into the rendered HTML, so it
// has to be in the environment WHILE the build runs - reading it afterwards
// is too late. It defaults to the short commit, which is what the deploy
// script expects, and it must be the same value that ends up in the
// manifest below.
const deploymentId = process.env.NEXT_DEPLOYMENT_ID || short;

if (!opts.skipBuild) {
  console.log("\n--- building ---");
  console.log(`release id : ${deploymentId}`);
  const env = { ...process.env, NEXT_DEPLOYMENT_ID: deploymentId };
  if (hasNpm()) {
    run("npm", ["run", "build"], { env });
  } else {
    const cli = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    if (!fs.existsSync(cli)) {
      fail("neither npm nor the local Next.js CLI was found; run 'npm install' first.");
    }
    console.log("npm was not found on PATH; running the Next.js CLI directly.");
    run(process.execPath, [cli, "build"], { env });
  }
} else {
  console.log("\n--- skipping build (using the existing .next) ---");
}

// --------------------------------------------------------------- verify
console.log("\n--- verifying build artefacts ---");
const required = [
  "BUILD_ID",
  "routes-manifest.json",
  "prerender-manifest.json",
  "required-server-files.json",
  "server",
  "static",
];
for (const rel of required) {
  if (!fs.existsSync(path.join(DIST_DIR, rel))) fail(`the build is missing ${rel}`);
}
const buildId = fs.readFileSync(path.join(DIST_DIR, "BUILD_ID"), "utf8").trim();
console.log(`BUILD_ID : ${buildId}`);

// The deployment id identifies the release on the live site through the
// data-dpl-id attribute. It must match the commit that is being released.
const homepage = path.join(DIST_DIR, "server", "app", "index.html");
if (fs.existsSync(homepage)) {
  const html = fs.readFileSync(homepage, "utf8");
  if (!html.includes(`data-dpl-id="${deploymentId}"`)) {
    fail(
      `the built homepage does not carry data-dpl-id="${deploymentId}".\n` +
        `       The build has to run with NEXT_DEPLOYMENT_ID=${deploymentId} in the environment, ` +
        `because Next.js bakes the attribute into the rendered HTML.`
    );
  }
  console.log(`release id : ${deploymentId} (data-dpl-id present)`);
}

// A build that embeds the absolute path of the machine that produced it
// cannot be deployed to a different host. Scan for it.
const absoluteBuildPath = path.resolve(ROOT);
const offenders = [];
(function scan(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith(".js")) {
      const text = fs.readFileSync(p, "utf8");
      if (text.includes(absoluteBuildPath)) offenders.push(path.relative(DIST_DIR, p));
    }
  }
})(DIST_DIR);
if (offenders.length > 0) {
  console.log(`\nWARNING: ${offenders.length} file(s) embed the absolute build path:`);
  offenders.slice(0, 5).forEach((f) => console.log(`         ${f}`));
  console.log("         These paths do not exist on the production host.");
}

// ------------------------------------------------------------------ manifest
const manifest = {
  commit,
  shortCommit: short,
  branch,
  buildId,
  deploymentId,
  builtAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
};
fs.writeFileSync(path.join(DIST_DIR, "RELEASE"), JSON.stringify(manifest, null, 2) + "\n");
console.log("\n--- wrote .next/RELEASE ---");

// ------------------------------------------------------------------ package
fs.mkdirSync(opts.out, { recursive: true });
const tarName = `outputtracer-release-${short}.tar.gz`;
const tarPath = path.join(opts.out, tarName);

console.log(`\n--- packaging -> ${tarPath} ---`);
// The build cache is NOT part of a release.
//
// .next/cache is Next.js' build cache (cacheDir = <distDir>/cache). It holds
// prerendered pages and compiled modules from EARLIER builds, and Next does
// not invalidate it when the deployment id changes. A server that finds those
// cached pages serves them instead of the freshly built ones, so the live
// site would answer with a stale data-dpl-id and stale ?dpl= asset urls
// while the release claims a different id - and the deploy script's
// release-id check fails, so the release can never be promoted.
//
// The cache is also three quarters of the archive and is specific to the
// machine that produced it. It is excluded; the server rebuilds what it
// needs on the host.
run("tar", ["-czf", tarPath, "--exclude=./cache", "-C", DIST_DIR, "."]);

const hash = crypto.createHash("sha256").update(fs.readFileSync(tarPath)).digest("hex");
fs.writeFileSync(`${tarPath}.sha256`, `${hash}  ${tarName}\n`);
const sizeMb = (fs.statSync(tarPath).size / 1048576).toFixed(1);

console.log("\n==================================================");
console.log(`archive : ${tarPath}`);
console.log(`size    : ${sizeMb} MB`);
console.log(`sha256  : ${hash}`);
console.log(`commit  : ${commit}`);
console.log(`release : ${deploymentId}`);
console.log("==================================================");
console.log("\nCopy the archive and its .sha256 sidecar to the host, then run:");
console.log(`  scripts/deploy-production.sh --artifact release/${tarName}`);
console.log("(the archive has to keep the name it was built with, because the");
console.log(" deploy script matches it against the commit in the manifest)");
