import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

import { ensureDirs, PORT, REQUEST_DELAY_MS, SERVER_ENABLED, SYNC_CRON } from "./config.js";
import { loadConfig, saveConfig, loadState, saveState, clearError } from "./state.js";
import { login, submitMfa, garminStatus, garminError, hasTokenFiles, loginPromise } from "./garmin.js";
import { testDawarich } from "./dawarich.js";
import { startSync } from "./sync.js";

ensureDirs();

function send(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

async function readJson(req: http.IncomingMessage): Promise<any> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body ? JSON.parse(body) : {};
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const delayBetweenRequests = () => delay(REQUEST_DELAY_MS);

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

    const dawStatus = cfg
      ? "configured"
      : "not_configured";

    send(res, 200, {
      garminStatus:
        garminStatus === "not_configured" && hasTokenFiles()
          ? "connected"
          : garminStatus,

      dawarichStatus: dawStatus,

      error: garminError || state.lastError,

      config: cfg
        ? {
          dawarichUrl: cfg.dawarichUrl
        }
        : null,

      sync: state
    });

    return;
  }

  if (req.method === "POST" && url.pathname === "/api/dawarich-config") {
    const data = await readJson(req);

    if (!data.dawarichUrl || !data.dawarichApiKey) {
      send(res, 400, {
        error: "Dawarich URL and API key are required"
      });
      return;
    }

    try {
      await testDawarich({
        dawarichUrl: String(data.dawarichUrl),
        dawarichApiKey: String(data.dawarichApiKey)
      });
    } catch (err: any) {
      send(res, 502, {
        error: err?.message || String(err)
      });
      return;
    }

    saveConfig({
      dawarichUrl: String(data.dawarichUrl),
      dawarichApiKey: String(data.dawarichApiKey)
    });

    clearError();

    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/garmin-login") {
    try {
      const data = await readJson(req);

      if (!data.garminUsername || !data.garminPassword) {
        send(res, 400, {
          error: "Garmin e-mail and password are required"
        });
        return;
      }

      await login(
        String(data.garminUsername),
        String(data.garminPassword)
      );

      clearError();

      await delayBetweenRequests(); // Small delay to ensure login state is settled
      startSync().catch(() => {});

      send(res, 200, {
        ok: true
      });

    } catch (err: any) {
      if (garminStatus === "mfa") {
        send(res, 200, {
          ok: true,
          mfaRequired: true
        });
      } else {
        send(res, 500, {
          error: err?.message || String(err)
        });
      }
    }

    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mfa") {
    try {
      const data = await readJson(req);
      submitMfa(String(data.code || ""));
      await loginPromise;
      clearError();
      await delayBetweenRequests(); // Small delay to ensure login state is settled
      startSync().catch(() => {});

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
      clearError();
      startSync();

      send(res, 202, { ok: true, started: true });
    } catch (err: any) {
      send(res, 409, { error: err?.message || String(err) });
    }
    return;
  }

  send(res, 404, { error: "Not found" });
}

export const serve = () => {
  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      console.error(err);
      send(res, 500, { error: err?.message || String(err) });
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Garmin → Dawarich listening on :${PORT}`);
    console.log(`Daily sync cron: ${SYNC_CRON}`);
  });
}
