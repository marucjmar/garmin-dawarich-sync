import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || "/data";
export const TMP_DIR = process.env.TMP_DIR || "/tmp/garmin-dawarich";
export const PORT = Number(process.env.SERVER_PORT || 8080);
export const SERVER_ENABLED = process.env.SERVER_ENABLED !== "false";

export const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || 10));
export const REQUEST_DELAY_MS = Math.max(0, Number(process.env.REQUEST_DELAY_MS || 5000));
export const DAWARICH_DELAY_MS = Math.max(0, Number(process.env.DAWARICH_DELAY_MS || 3000));
export const SYNC_CRON = String(process.env.SYNC_CRON || '0 3 * * *');

export const STATE_FILE = path.join(DATA_DIR, "state.json");
export const CONFIG_FILE = path.join(DATA_DIR, "config.json");
export const TOKEN_DIR = path.join(DATA_DIR, "garmin-tokens");

export function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
}
