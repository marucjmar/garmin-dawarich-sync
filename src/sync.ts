import fs from "node:fs/promises";
import path from "node:path";
import { getClient } from "./garmin.js";
import { uploadGpx } from "./dawarich.js";
import { BATCH_SIZE, DAWARICH_DELAY_MS, REQUEST_DELAY_MS, TMP_DIR } from "./config.js";
import { loadState, saveState } from "./state.js";

let running = false;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let syncPromise: Promise<void> | null = null;

export function startSync() {
  if (syncPromise) throw new Error("Sync in progress");
  syncPromise = syncAll().catch(err => {
    console.error("Sync failed:", err);
  }).finally(() => { syncPromise = null; });
  return syncPromise;
}

async function downloadGpx(client: any, activity: any): Promise<string> {
  const id = String(activity.activityId);
  const dir = path.join(TMP_DIR, id);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });

  await client.downloadOriginalActivityData(activity, dir, "gpx");

  const files = await fs.readdir(dir);
  const gpx = files.find((f: string) => f.toLowerCase().endsWith(".gpx"));
  if (!gpx) throw new Error(`Garmin nie zwrócił GPX dla aktywności ${id}`);

  return path.join(dir, gpx);
}

async function uploadActivity(client: any, activity: any, state: any) {
  const id = String(activity.activityId);
  state.progress.currentActivityId = id;
  saveState(state);

  const gpx = await downloadGpx(client, activity);

  try {
    await uploadGpx(gpx);
  } finally {
    await fs.rm(path.dirname(gpx), { recursive: true, force: true });
  }

  state.importedActivityIds.push(id);
  state.progress.processed += 1;
  saveState(state);

  await sleep(DAWARICH_DELAY_MS);
}

export async function syncAll() {
  if (running) throw new Error("Sync in progress");
  running = true;

  const state = loadState();
  state.syncRunning = true;
  state.lastError = undefined;
  state.progress = {
    mode: state.initialSyncDone ? "incremental" : "initial",
    processed: 0
  };
  saveState(state);

  try {
    const client = getClient();

    if (state.initialSyncDone) {
      const activities = await client.getActivities(0, BATCH_SIZE);
      for (const activity of activities) {
        const id = String(activity.activityId);
        if (state.importedActivityIds.includes(id)) continue;
        await uploadActivity(client, activity, state);
        await sleep(REQUEST_DELAY_MS);
      }
    } else {
      let start = 0;

      while (true) {
        const activities = await client.getActivities(start, BATCH_SIZE);
        if (!activities.length) break;

        state.progress.total = undefined;
        saveState(state);

        for (const activity of activities) {
          const id = String(activity.activityId);
          if (state.importedActivityIds.includes(id)) continue;
          await uploadActivity(client, activity, state);
          await sleep(REQUEST_DELAY_MS);
        }

        start += activities.length;
        await sleep(REQUEST_DELAY_MS);
      }

      state.initialSyncDone = true;
    }

    state.lastSyncAt = new Date().toISOString();
    state.lastError = undefined;
    state.progress.currentActivityId = undefined;
  } catch (err: any) {
    state.lastError = err?.message || String(err);
    throw err;
  } finally {
    state.syncRunning = false;
    saveState(state);
    running = false;
  }
}
