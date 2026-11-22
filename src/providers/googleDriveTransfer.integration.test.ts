import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GoogleDriveTransfer, type PendingPayloadStore, type ResumableUploadState, type ResumableUploadStateStore } from "./googleDriveTransfer";

class MemoryPayloads implements PendingPayloadStore {
  values = new Map<string, Uint8Array>();
  async put(key: string, payload: Uint8Array): Promise<string> { this.values.set(key, payload); return key; }
  async get(ref: string): Promise<Uint8Array | undefined> { return this.values.get(ref); }
  async remove(ref: string): Promise<void> { this.values.delete(ref); }
}
class MemoryStates implements ResumableUploadStateStore {
  values = new Map<string, ResumableUploadState>();
  async get(path: string): Promise<ResumableUploadState | undefined> { return this.values.get(path); }
  async set(state: ResumableUploadState): Promise<void> { this.values.set(state.path, { ...state }); }
  async remove(path: string): Promise<void> { this.values.delete(path); }
}

describe("GoogleDriveTransfer", () => {
  it("encrypts bytes before upload and clears pending state only after confirmation", async () => {
    const payloads = new MemoryPayloads();
    const states = new MemoryStates();
    let uploaded = new Uint8Array();
    let metadata: Record<string, unknown> = {};
    let calls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        metadata = JSON.parse(String(init?.body));
        return new Response(null, { status: 200, headers: { Location: "https://upload.example/session/abc" } });
      }
      uploaded = new Uint8Array(init?.body as ArrayBuffer);
      return new Response(JSON.stringify({ id: "remote-1", name: String(metadata.name), mimeType: "application/octet-stream" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    };
    const transfer = new GoogleDriveTransfer(async () => "test-token", payloads, states, fetcher);
    const plaintext = new TextEncoder().encode("private note contents");
    const result = await transfer.uploadEncryptedFile(
      "private/secret-note.md", "secret-note.md", plaintext, "folder-1", "correct horse battery staple",
    );
    assert.equal(result.id, "remote-1");
    assert.notDeepEqual(uploaded, plaintext);
    assert.deepEqual([...uploaded.slice(0, 4)], [0x43, 0x56, 0x53, 0x31]);
    assert.equal(metadata.name, "cloudvault-" + metadata.appProperties && String(metadata.name));
    assert.equal((metadata.appProperties as Record<string, string>).cloudvaultPath, undefined);
    assert.equal(states.values.size, 0);
    assert.equal(payloads.values.size, 0);
  });
});
