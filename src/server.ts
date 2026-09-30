import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDirs, PORT, SERVER_ENABLED, SYNC_HOUR, SYNC_MINUTE } from "./config.js";
import { loadConfig, saveConfig, loadState, saveState, clearError } from "./state.js";
import { login, submitMfa, garminStatus, garminError, hasTokenFiles } from "./garmin.js";
import { syncAll } from "./sync.js";
import { testDawarich } from "./dawarich.js";

ensureDirs();

let syncPromise: Promise<void> | null = null;

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

function startSync() {
  if (syncPromise) throw new Error("Synchronizacja już trwa");
  syncPromise = syncAll().catch(err => {
    console.error("Sync failed:", err);
  }).finally(() => { syncPromise = null; });
  return syncPromise;
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/") {
    const html = await fs.readFile(path.join(process.cwd(), "public/index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    const cfg = loadConfig();
    const state = loadState();
    let dawStatus = cfg ? "configured" : "not_configured";
    send(res, 200, {
      garminStatus: garminStatus === "not_configured" && hasTokenFiles() ? "connected" : garminStatus,
      dawarichStatus: dawStatus,
      error: garminError || state.lastError,
      config: cfg ? { dawarichUrl: cfg.dawarichUrl, garminUsername: cfg.garminUsername } : null,
      sync: state
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/config") {
    const data = await readJson(req);
    if (!data.garminUsername || !data.garminPassword || !data.dawarichUrl || !data.dawarichApiKey) {
      send(res, 400, { error: "All fields are required" });
      return;
    }
    
    try {
      await testDawarich(data);
    } catch (err: any) {
      send(res, 502, { error: err?.message || String(err) });
      return;
    }

    saveConfig({
      garminUsername: String(data.garminUsername),
      garminPassword: String(data.garminPassword),
      dawarichUrl: String(data.dawarichUrl),
      dawarichApiKey: String(data.dawarichApiKey)
    });

    clearError();

    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    try {
      await login();
      clearError();
      startSync();

      send(res, 200, { ok: true });
    } catch (err: any) {
      // MFA intentionally keeps the login flow alive; don't return an error for it.
      if (garminStatus === "mfa") send(res, 200, { ok: true, mfaRequired: true });
      else send(res, 500, { error: err?.message || String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mfa") {
    try {
      const data = await readJson(req);
      submitMfa(String(data.code || ""));
      clearError();
      startSync();

      send(res, 200, { ok: true });
    } catch (err: any) {
      send(res, 400, { error: err?.message || String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/test-dawarich") {
    try {
      await testDawarich();
      clearError();
      send(res, 200, { ok: true });
    } catch (err: any) {
      send(res, 502, { error: err?.message || String(err) });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/sync") {
    try {
      startSync();
      clearError();

      send(res, 202, { ok: true, started: true });
    } catch (err: any) {
      send(res, 409, { error: err?.message || String(err) });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
}

const state = loadState();

if (SERVER_ENABLED) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      console.error(err);
      send(res, 500, { error: err?.message || String(err) });
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Garmin → Dawarich listening on :${PORT}`);
    console.log(`Daily sync: ${String(SYNC_HOUR).padStart(2,"0")}:${String(SYNC_MINUTE).padStart(2,"0")}`);
  });
} 

if (state && hasTokenFiles()) {
  startSync();
}

// Simple daily scheduler. It avoids an additional cron daemon inside the container.
setInterval(() => {
  const now = new Date();
  if (now.getHours() === SYNC_HOUR && now.getMinutes() === SYNC_MINUTE) {
    const state = loadState();
    if (!state.syncRunning && hasTokenFiles()) {
      startSync();
    }
  }
}, 30_000);
