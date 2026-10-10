import test from "node:test";
import assert from "node:assert/strict";
import { InferenceClient } from "../public/js/inference.js";

test("InferenceClient: lỗi Worker sau khi ready giải phóng trạng thái và báo fallback", async () => {
  const PreviousWorker = globalThis.Worker;
  class FakeWorker {
    terminated = false;
    postMessage(message) {
      if (message.type === "init") queueMicrotask(() => this.onmessage({ data: { type: "ready", delegate: "CPU", conn: { handConn: [] } } }));
    }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = FakeWorker;
  try {
    const client = new InferenceClient(); let failure = null;
    await client.init({ root: "https://example.invalid" });
    client.onFailure = (error) => { failure = error; };
    const worker = client.w;
    worker.onerror({ message: "simulated worker crash" });
    assert.equal(client.ready, false);
    assert.equal(client.busy, false);
    assert.equal(worker.terminated, true);
    assert.match(failure?.message || "", /simulated worker crash/);
  } finally {
    globalThis.Worker = PreviousWorker;
  }
});
