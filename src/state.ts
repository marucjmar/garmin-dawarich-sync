import fs from "node:fs";
import { CONFIG_FILE, STATE_FILE } from "./config.js";

export interface DawarichConfig {
  dawarichUrl: string;
  dawarichApiKey: string;
}

export interface SyncState {
  initialSyncDone: boolean;
  importedActivityIds: string[];
  lastSyncAt?: string;
  lastError?: string;
  syncRunning: boolean;
  progress?: {
    mode: "initial" | "incremental";
    processed: number;
    total?: number;
    currentActivityId?: string;
  };
}

const defaultState: SyncState = {
  initialSyncDone: false,
  importedActivityIds: [],
  syncRunning: false
};

export function loadState(): SyncState {
  try {
    if (!fs.existsSync(STATE_FILE)) return structuredClone(defaultState);
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return structuredClone(defaultState);
  }
}

export function saveState(state: SyncState) {
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STATE_FILE);
}

export function loadConfig(): DawarichConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

export function saveConfig(config: DawarichConfig) {
  const tmp = CONFIG_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CONFIG_FILE);
}

export function clearError() {
  const state = loadState();
  state.lastError = undefined;
  saveState(state);
}
