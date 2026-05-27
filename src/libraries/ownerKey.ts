import { useSyncExternalStore } from "react";
import { nanoid } from "nanoid";

const STORAGE_KEY = "scribbly:libraryKey";
const KEY_LENGTH = 24;

function generateOwnerKey(): string {
  return nanoid(KEY_LENGTH);
}

function readFromStorage(): string {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing && existing.length > 0) return existing;
  const fresh = generateOwnerKey();
  window.localStorage.setItem(STORAGE_KEY, fresh);
  return fresh;
}

// In-process listeners. localStorage's `storage` event only fires
// across tabs, so a same-tab paste needs a manual fan-out.
const listeners = new Set<() => void>();
let cached: string | null = null;

function notify(): void {
  cached = null;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): string {
  if (cached === null) cached = readFromStorage();
  return cached;
}

export function getOwnerKey(): string {
  return getSnapshot();
}

export function setOwnerKey(next: string): void {
  const trimmed = next.trim();
  if (trimmed.length === 0) return;
  window.localStorage.setItem(STORAGE_KEY, trimmed);
  notify();
}

export function useOwnerKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
