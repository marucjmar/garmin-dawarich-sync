import fs from "node:fs";
import { GarminConnect } from "garmin-connect-nexxt";
import { TOKEN_DIR, REQUEST_DELAY_MS } from "./config.js";
import { loadConfig } from "./state.js";

let client: any = null;
let mfaResolver: ((code: string) => void) | null = null;
let mfaRejecter: ((err: Error) => void) | null = null;

export type GarminStatus = "not_configured" | "idle" | "logging_in" | "mfa" | "connected" | "error";

export let loginPromise: Promise<void> | null = null;
export let garminStatus: GarminStatus = "not_configured";
export let garminError: string | undefined;

export function hasTokenFiles() {
  if (!fs.existsSync(TOKEN_DIR)) return false;
  const files = fs.readdirSync(TOKEN_DIR);
  return files.some(f => f.includes("oauth"));
}

function waitForMfa(): Promise<string> {
  return new Promise((resolve, reject) => {
    mfaResolver = resolve;
    mfaRejecter = reject;
    garminStatus = "mfa";
  });
}

export function submitMfa(code: string) {
  if (!mfaResolver) throw new Error("MFA is not currently requested");
  const resolve = mfaResolver;
  mfaResolver = null;
  mfaRejecter = null;
  resolve(code.trim());
}

export async function login(garminUsername: string, garminPassword: string) {
  if (loginPromise) throw new Error("Login already in progress");

  garminStatus = "logging_in";
  garminError = undefined;

  client = new GarminConnect({
    username: garminUsername,
    password: garminPassword
  });

  client.httpClient.setNextRequestsDelay(REQUEST_DELAY_MS);

  loginPromise = client.login(
    garminUsername,
    garminPassword,
    { mfaHandler: async () => waitForMfa() }
  ).then(() => {
    client.exportTokenToFile(TOKEN_DIR);
    garminStatus = "connected";
  }).catch((err: any) => {
    garminStatus = "error";
    garminError = err?.message || String(err);
    throw err;
  }).finally(() => {
    loginPromise = null;
  });

  await loginPromise;
}

export function getClient(): any {
  if (client) return client;

  client = new GarminConnect({
    username: "",
    password: ""
  });

  client.httpClient.setNextRequestsDelay(REQUEST_DELAY_MS);

  if (hasTokenFiles()) {
    client.loadTokenByFile(TOKEN_DIR);
    garminStatus = "connected";
    return client;
  }

  throw new Error("No saved Garmin session. Log in through the UI.");
}
