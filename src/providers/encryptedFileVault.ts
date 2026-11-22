export interface EncryptedFilePayload {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: Uint8Array;
}

const MAGIC = new Uint8Array([0x43, 0x56, 0x53, 0x31]); // CVS1
const ITERATIONS = 310_000;
const encoder = new TextEncoder();

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function deriveFileKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  if (passphrase.length < 12) throw new Error("Use an encryption passphrase with at least 12 characters.");
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: asArrayBuffer(salt), iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Binary file format: 4-byte magic, 16-byte salt, 12-byte IV, AES-GCM ciphertext. */
export class EncryptedFileVault {
  async encrypt(plaintext: Uint8Array, passphrase: string): Promise<Uint8Array> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveFileKey(passphrase, salt);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) }, key, asArrayBuffer(plaintext),
    ));
    const output = new Uint8Array(MAGIC.length + salt.length + iv.length + ciphertext.length);
    output.set(MAGIC, 0);
    output.set(salt, MAGIC.length);
    output.set(iv, MAGIC.length + salt.length);
    output.set(ciphertext, MAGIC.length + salt.length + iv.length);
    return output;
  }

  async decrypt(payload: Uint8Array, passphrase: string): Promise<Uint8Array> {
    const headerLength = MAGIC.length + 16 + 12;
    if (payload.length <= headerLength || !MAGIC.every((value, index) => payload[index] === value)) {
      throw new Error("File is not a supported CloudVault encrypted file.");
    }
    const salt = payload.slice(MAGIC.length, MAGIC.length + 16);
    const iv = payload.slice(MAGIC.length + 16, headerLength);
    const ciphertext = payload.slice(headerLength);
    const key = await deriveFileKey(passphrase, salt);
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asArrayBuffer(iv) }, key, asArrayBuffer(ciphertext),
      );
      return new Uint8Array(plaintext);
    } catch {
      throw new Error("Could not decrypt file. Check the passphrase or file integrity.");
    }
  }
}
