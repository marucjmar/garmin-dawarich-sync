import fs from "node:fs/promises";
import { loadConfig } from "./state.js";

function normalizeUrl(url: string) {
  return url.replace(/\/+$/, "");
}

export async function uploadGpx(filePath: string) {
  const cfg = loadConfig();
  if (!cfg) throw new Error("Brak konfiguracji");

  const base = normalizeUrl(cfg.dawarichUrl);
  const url = `${base}/api/v1/imports`;

  const file = await fs.readFile(filePath);
  const blob = new Blob([file], { type: "application/gpx+xml" });

  const form = new FormData();
  form.append("file", blob, filePath.split("/").pop() || "activity.gpx");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.dawarichApiKey}`
    },
    body: form,
    signal: AbortSignal.timeout(120000)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Dawarich ${response.status}: ${text.slice(0, 500)}`);
  }

  let data: unknown = text;
  try { data = JSON.parse(text); } catch {}

  return data;
}

export async function testDawarich(cfg = {} as any) {
  cfg = cfg ?? loadConfig();
  if (!cfg) throw new Error("No configuration");

  const base = normalizeUrl(cfg.dawarichUrl);

  try {
    const response = await fetch(`${base}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${cfg.dawarichApiKey}` },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }

    return true;
  } catch (err: any) {
    console.error(err);
    throw new Error(`Unable to connect to Dawarich: ${err?.message || String(err)}`);
  }
}
