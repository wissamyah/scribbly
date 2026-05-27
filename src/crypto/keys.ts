const ALGO = "AES-GCM";
const KEY_BITS = 256;

function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(b64: string): Uint8Array {
  const pad = (4 - (b64.length % 4)) % 4;
  const norm = b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(norm);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateRoomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGO, length: KEY_BITS },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function exportKeyB64(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toB64Url(new Uint8Array(raw));
}

export async function importKeyB64(b64: string): Promise<CryptoKey> {
  const raw = fromB64Url(b64);
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: ALGO },
    false,
    ["encrypt", "decrypt"],
  );
}
