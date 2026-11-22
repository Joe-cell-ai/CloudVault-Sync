import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EncryptedFileVault } from "./encryptedFileVault";

describe("EncryptedFileVault", () => {
  it("round-trips binary data without exposing plaintext", async () => {
    const vault = new EncryptedFileVault();
    const input = new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]);
    const encrypted = await vault.encrypt(input, "correct horse battery staple");
    assert.notDeepEqual(encrypted, input);
    assert.deepEqual(await vault.decrypt(encrypted, "correct horse battery staple"), input);
  });

  it("rejects a wrong passphrase and malformed payload", async () => {
    const vault = new EncryptedFileVault();
    const encrypted = await vault.encrypt(new Uint8Array([1, 2, 3]), "correct horse battery staple");
    await assert.rejects(() => vault.decrypt(encrypted, "incorrect horse battery staple"), /Could not decrypt/);
    await assert.rejects(() => vault.decrypt(new Uint8Array([1, 2, 3]), "correct horse battery staple"), /not a supported/);
  });
});
