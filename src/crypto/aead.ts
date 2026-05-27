// AEAD = Authenticated Encryption with Associated Data. AES-GCM rejects any
// ciphertext that was tampered with, so we don't need a separate MAC.

const ALGO = "AES-GCM";
const IV_BYTES = 12;

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

export type Sealed = { ciphertext: string; iv: string };

export async function encryptJSON(
  key: CryptoKey,
  value: unknown,
): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const buf = await crypto.subtle.encrypt(
    { name: ALGO, iv: iv as BufferSource },
    key,
    data as BufferSource,
  );
  return {
    ciphertext: toB64Url(new Uint8Array(buf)),
    iv: toB64Url(iv),
  };
}

export async function decryptJSON<T = unknown>(
  key: CryptoKey,
  sealed: Sealed,
): Promise<T> {
  const ct = fromB64Url(sealed.ciphertext);
  const iv = fromB64Url(sealed.iv);
  const buf = await crypto.subtle.decrypt(
    { name: ALGO, iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(buf)) as T;
}
