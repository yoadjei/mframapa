/**
 * Real Web Push (VAPID) subscription for the installed / browser PWA.
 * Registers the PushSubscription JSON with POST /api/v1/register-push-token.
 */

import { httpClient } from "./httpClient.js";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export async function fetchVapidPublicKey() {
  try {
    const { data } = await httpClient.get("/api/v1/vapid-public-key");
    return data?.publicKey || null;
  } catch {
    return null;
  }
}

export async function subscribeWebPush({ lat, lon, thresholdOffset } = {}) {
  if (typeof window === "undefined") return { ok: false, reason: "ssr" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!("Notification" in window)) return { ok: false, reason: "unsupported" };

  const permission =
    Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, reason: "no_vapid" };

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const token = JSON.stringify(sub.toJSON());
  await httpClient.post("/api/v1/register-push-token", {
    token,
    platform: "web",
    lat: lat ?? null,
    lon: lon ?? null,
    threshold_offset: thresholdOffset ?? null,
  });

  return { ok: true, subscription: sub };
}
