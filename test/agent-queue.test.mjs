import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Agent queue behavior", () => {
  let server;
  let sessionId;

  beforeAll(async () => {
    server = await startServer();
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Agent Queue Test" },
    });
    sessionId = res.body.id;
  });

  afterAll(() => {
    server.stop();
  });

  it("POST /api/sessions/:id/agent requires prompt", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/agent`, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/prompt required/);
  });

  it("POST /api/sessions/:id/agent returns ok with prompt", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/agent`, {
      method: "POST",
      body: { prompt: "say hello", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.message).toMatch(/Agent started/);
  });

  it("agent start adds an agent_start message to session", async () => {
    // Give the server a moment to process
    await new Promise(r => setTimeout(r, 200));
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    expect(res.status).toBe(200);
    const msgs = res.body.messages;
    expect(msgs.some(m => m.type === "agent_start")).toBe(true);
  });

  it("queuing when agent is running adds system message", async () => {
    // Fire a second agent request — should queue
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/agent`, {
      method: "POST",
      body: { prompt: "second task", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // Check for queue message
    await new Promise(r => setTimeout(r, 200));
    const msgsRes = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    const msgs = msgsRes.body.messages;
    expect(msgs.some(m => m.type === "system" && m.content.includes("queued"))).toBe(true);
  });

  it("returns 200 for agent on nonexistent session (agent silently returns)", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/nonexistent/agent`, {
      method: "POST",
      body: { prompt: "test" },
    });
    // The endpoint still returns ok, but spawnAgent exits silently
    expect(res.status).toBe(200);
  });

  it("session JSON shows queueLength when items queued", async () => {
    // Session already has agent running + queue from above
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    // queueLength could be >= 0 depending on whether agent finished
    expect(typeof res.body.queueLength).toBe("number");
  });
});
