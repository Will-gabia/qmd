#!/usr/bin/env node
/**
 * Combined `prepare` lifecycle hook:
 *   1. Best-effort install of the pre-push git hook (skipped outside a git
 *      checkout, or where bash/the hook script isn't available).
 *   2. Build `dist/` if it's missing — so installing qmdx directly from a git
 *      URL produces a working CLI without an extra manual step. (See
 *      scripts/build-if-missing.mjs for the rationale.)
 *
 * Centralizing both in a Node script keeps `prepare` cross-platform: a plain
 * `npm install <git-url>` runs this via `node`, which works on every OS,
 * whereas the previous shell-only `prepare` only installed hooks and required
 * a POSIX shell.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 1. Git hooks (best-effort). Only meaningful inside a git checkout; never
//    hard-fail the install over hook setup.
const gitDir = join(root, ".git");
if (existsSync(gitDir)) {
  const hookScript = join(root, "scripts", "install-hooks.sh");
  if (existsSync(hookScript)) {
    const r = spawnSync("bash", [hookScript], { cwd: root, stdio: "pipe" });
    if (r.status === 0) {
      process.stdout.write("Installed git hooks: pre-push\n");
    }
    // Non-zero / missing bash → silently skip hooks (not all installs need them).
  }
}

// 2. Build dist/ if missing (no-op when already built or when tsc is absent).
const build = join(root, "scripts", "build-if-missing.mjs");
const r = spawnSync(process.execPath, [build], { cwd: root, stdio: "inherit" });
process.exit(r.status ?? 0);