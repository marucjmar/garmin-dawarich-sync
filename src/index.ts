import cron from "node-cron";
import { loadState } from "./state.js";
import { hasTokenFiles } from "./garmin.js";
import { startSync } from "./sync.js";
import { SERVER_ENABLED, SYNC_CRON } from "./config.js";
import { serve } from "./server.js";

const state = loadState();

if (state && hasTokenFiles()) {
  startSync();
}

if (SERVER_ENABLED) {
  serve();
}

cron.schedule(SYNC_CRON, () => {
  const state = loadState();
  if (!state.syncRunning && hasTokenFiles()) {
    startSync();
  }
});
