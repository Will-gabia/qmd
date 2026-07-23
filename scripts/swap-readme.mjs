#!/usr/bin/env node
/**
 * Swap the GitHub README for the npm README around an `npm publish`.
 *
 *   node scripts/swap-readme.mjs to-npm     → copy README.npm.md → README.md
 *   node scripts/swap-readme.mjs restore    → restore the original README.md
 *                                             from the `.README.github.md.bak`
 *                                             backup created by `to-npm`.
 *
 * Why: npm always packs the root `README.md` into the published tarball and
 * offers no way to point it at a different file. To ship a trim, install-focused
 * README on npm while keeping the long GitHub README in the repo, we briefly
 * overwrite `README.md` for `npm pack`/`publish` and restore it right after.
 *
 * Wired via `package.json`:
 *   "prepublishOnly": "node scripts/swap-readme.mjs to-npm"
 *   "postpublish":    "node scripts/swap-readme.mjs restore"
 *
 * The backup file (`.README.github.md.bak`) is gitignored so it never leaks
 * into the repo. If `restore` finds no backup (e.g. the swap was interrupted),
 * it exits with an error so you don't accidentally publish the wrong README.
 */
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmReadme = join(root, "README.npm.md");
const readme = join(root, "README.md");
const backup = join(root, ".README.github.md.bak");

const mode = process.argv[2];

if (mode === "to-npm") {
  if (!existsSync(npmReadme)) {
    process.stderr.write(`swap-readme: ${npmReadme} not found; nothing to swap.\n`);
    process.exit(0); // no-op, don't block publish if user removed the npm readme
  }
  if (existsSync(backup)) {
    // Stale backup from an interrupted run — keep using the current README.md
    // as the GitHub source of truth by not overwriting the backup.
    process.stderr.write(
      `swap-readme: stale backup already at ${backup}; leaving it in place.\n`,
    );
  } else {
    copyFileSync(readme, backup);
  }
  copyFileSync(npmReadme, readme);
  process.stdout.write("swap-readme: README.md → npm version (GitHub backed up)\n");
  process.exit(0);
}

if (mode === "restore") {
  if (!existsSync(backup)) {
    process.stderr.write(
      `swap-readme: no backup at ${backup} — was 'to-npm' run? Refusing to touch README.md.\n`,
    );
    process.exit(0); // don't fail publish cleanup if already restored
  }
  copyFileSync(backup, readme);
  rmSync(backup, { force: true });
  process.stdout.write("swap-readme: README.md ← restored from backup\n");
  process.exit(0);
}

process.stderr.write(`swap-readme: unknown mode "${mode}". Use "to-npm" or "restore".\n`);
process.exit(1);