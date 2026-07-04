/**
 * Shareable-URL persistence: the whole plan is serialized as UTF-8 JSON,
 * base64url-encoded, and carried in the `p` query parameter.
 */

import { sanitizeState } from "./model";
import type { PlanState } from "./model";

const PARAM = "p";

/** UTF-8 → base64url (handles non-ASCII scenario names). */
export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

/** base64url → UTF-8; null on malformed input. */
export function fromBase64Url(encoded: string): string | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Plan → URL-safe token. */
export function encodeState(state: PlanState): string {
  return toBase64Url(JSON.stringify(state));
}

/** URL-safe token → validated plan, or null when malformed/tampered. */
export function decodeState(encoded: string): PlanState | null {
  const json = fromBase64Url(encoded);
  if (json === null) return null;
  try {
    return sanitizeState(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Read the plan from the current URL, if present and valid. */
export function readStateFromUrl(): PlanState | null {
  const encoded = new URLSearchParams(window.location.search).get(PARAM);
  return encoded ? decodeState(encoded) : null;
}

/** Reflect the plan into the URL without adding history entries. */
export function writeStateToUrl(state: PlanState): void {
  const url = new URL(window.location.href);
  url.searchParams.set(PARAM, encodeState(state));
  window.history.replaceState(null, "", url);
}
