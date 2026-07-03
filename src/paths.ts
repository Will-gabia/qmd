import { homedir as osHomedir } from "node:os";
import { join } from "node:path";

/**
 * Directory name used under ~/.config and ~/.cache (and their XDG overrides).
 * qmdx keeps fork state fully separate from any upstream `qmd` install so the
 * two can coexist without clobbering each other's SQLite index, collection
 * config, or MCP daemon PID file.
 */
export const APP_DIR_NAME = "qmdx";

export function qmdHomedir(): string {
  return process.env.HOME || process.env.USERPROFILE || osHomedir() || "/tmp";
}

/** Resolved config directory (~/.config/qmdx by default). Honors QMD_CONFIG_DIR
 *  and XDG_CONFIG_HOME overrides, matching upstream precedence. */
export function appConfigDir(): string {
  if (process.env.QMD_CONFIG_DIR) {
    return process.env.QMD_CONFIG_DIR;
  }
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, APP_DIR_NAME);
  }
  return join(qmdHomedir(), ".config", APP_DIR_NAME);
}

/** Resolved cache directory (~/.cache/qmdx by default). Honors XDG_CACHE_HOME. */
export function appCacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(qmdHomedir(), ".cache");
  return join(base, APP_DIR_NAME);
}
