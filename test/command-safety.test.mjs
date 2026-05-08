import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Command safety - dangerous command blocking", () => {
  let server;
  let sessionId;

  beforeAll(async () => {
    server = await startServer();
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Command Safety Test" },
    });
    sessionId = res.body.id;
  });

  afterAll(() => {
    server.stop();
  });

  it("POST /api/sessions/:id/exec requires command", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/command required/);
  });

  it("blocks rm -rf /", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "rm -rf /", userId: "tester" },
    });
    // The endpoint returns 200, but adds a "blocked" message
    expect(res.status).toBe(200);
    // Verify the blocked message was added
    await new Promise(r => setTimeout(r, 200));
    const msgs = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    const blocked = msgs.body.messages.find(m =>
      m.type === "terminal" && m.content.includes("blocked")
    );
    expect(blocked).toBeTruthy();
    expect(blocked.content).toMatch(/rm -rf \//);
  });

  it("blocks sudo commands", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "sudo apt install something", userId: "tester" },
    });
    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 200));
    const msgs = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    const blocked = msgs.body.messages.find(m =>
      m.type === "terminal" && m.content.includes("sudo") && m.content.includes("blocked")
    );
    expect(blocked).toBeTruthy();
  });

  it("blocks dd if= commands", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "dd if=/dev/zero of=/dev/sda", userId: "tester" },
    });
    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 200));
    const msgs = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    const blocked = msgs.body.messages.find(m =>
      m.type === "terminal" && m.content.includes("dd") && m.content.includes("blocked")
    );
    expect(blocked).toBeTruthy();
  });

  it("blocks >/dev/ redirects", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "echo data > /dev/sda", userId: "tester" },
    });
    expect(res.status).toBe(200);
    await new Promise(r => setTimeout(r, 200));
    const msgs = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/messages`);
    const blocked = msgs.body.messages.find(m =>
      m.type === "terminal" && m.content.includes("> /dev/") && m.content.includes("blocked")
    );
    expect(blocked).toBeTruthy();
  });

  it("allows safe commands (echo hello)", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "echo hello-safe-command", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows ls -la", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "ls -la", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("allows git status", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec`, {
      method: "POST",
      body: { command: "git status", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 200 for exec on nonexistent session (silently ignored)", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/nonexistent/exec`, {
      method: "POST",
      body: { command: "echo hi" },
    });
    expect(res.status).toBe(200);
  });

  it("abort endpoint returns ok boolean", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/exec/abort`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe("boolean");
  });
});
