#!/usr/bin/env node
/**
 * Build `dist/` when it is missing — used by the `prepare` lifecycle hook so
 * that installing qmdx directly from a git URL works out of the box.
 *
 * Why this exists: `dist/` is gitignored (it's a build artifact), so a fresh
 * `git clone` (or `npm install <git-url>`) has no compiled JS. The `bin/qmdx`
 * launcher resolves to `dist/cli/qmdx.js`, so without this build step the
 * installed CLI would fail immediately. The `files[]` in package.json ships
 * `dist/` for registry installs, so this is a no-op for `npm install qmdx`
 * from npm (the dist already exists in the packed tarball).
 *
 * Guards:
 *  - Skip if `dist/cli/qmdx.js` already exists (no forced rebuild; run
 *    `npm run build` explicitly to refresh).
 *  - Skip gracefully (exit 0) if the TypeScript compiler isn't available, so
 *    installs with `--omit=dev` don't hard-fail — the user can run
 *    `npm run build` later when devDependencies are present.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distEntry = join(root, "dist", "cli", "qmdx.js");

if (existsSync(distEntry)) {
  process.exit(0);
}

const tsc = join(root, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tsc)) {
  process.stderr.write(
    "qmdx prepare: dist/ is missing and TypeScript is not installed " +
      "(likely an install with --omit=dev). The CLI will not work until you " +
      "install devDependencies and run `npm run build` inside the package.\n",
  );
  process.exit(0);
}

console.log("qmdx prepare: building dist/ (missing after git/clone install)...");
const result = spawnSync(
  process.execPath,
  [tsc, "-p", "tsconfig.build.json"],
  { cwd: root, stdio: "inherit" },
);
if (result.status !== 0) {
  console.error("qmdx prepare: build failed. Run `npm run build` manually to retry.");
  process.exit(result.status ?? 1);
}