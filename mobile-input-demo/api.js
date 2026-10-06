// api.js — talks to the ChildSafeLens demo backend.
//
// IMPORTANT: replace API_BASE_URL below with the real deployed URL C gives
// you (e.g. from Render). While testing against a laptop running the
// backend locally on the same wifi network, use your laptop's LAN IP
// instead of localhost — e.g. "http://192.168.1.23:8000" — because
// "localhost" on a phone points to the phone itself, not your laptop.

// Set EXPO_PUBLIC_API_BASE_URL to the local backend for child-chat development.
import { Platform } from "react-native";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const localBackendUrl = Platform.OS === "web" && typeof window !== "undefined"
  ? `http://${window.location.hostname}:8000`
  : "http://10.0.2.2:8000";
export const API_BASE_URL = (
  configuredApiBaseUrl || localBackendUrl
).replace(/\/$/, "");

export async function predict(text) {
  const res = await fetch(`${API_BASE_URL}/predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`predict failed: ${res.status}`);
  }

  return res.json();
}

export async function logEvent(riskLevel, classificationMetadata = {}) {
  const res = await fetch(`${API_BASE_URL}/log-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      risk_level: riskLevel,
      timestamp: new Date().toISOString(),
      ...classificationMetadata,
    }),
  });

  if (!res.ok) {
    throw new Error(`log-event failed: ${res.status}`);
  }

  return res.json(); // { status, event_id }
}
