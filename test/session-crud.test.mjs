import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Session CRUD", () => {
  let server;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(() => {
    server.stop();
  });

  it("starts with empty sessions list", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    expect(res.body.sessions).toEqual([]);
  });

  it("creates a new session via POST /api/sessions", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Test Session", userId: "tester" },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test Session");
    expect(res.body.id).toBeTruthy();
    expect(res.body.createdBy).toBe("tester");
    expect(res.body.branch).toMatch(/^made\//);
  });

  it("lists the created session", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);
    expect(res.body.sessions[0].name).toBe("Test Session");
  });

  it("gets a single session by ID", async () => {
    // Create one first
    const createRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Single Test", userId: "tester" },
    });
    const id = createRes.body.id;

    const res = await jfetch(`${server.baseUrl}/api/sessions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.name).toBe("Single Test");
    expect(res.body.messages).toBeTruthy();
    expect(res.body.messages.length).toBeGreaterThan(0);
    // First message should be a system message
    expect(res.body.messages[0].type).toBe("system");
  });

  it("returns 404 for nonexistent session", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  it("deletes a session", async () => {
    const createRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Delete Me", userId: "tester" },
    });
    const id = createRes.body.id;

    const delRes = await jfetch(`${server.baseUrl}/api/sessions/${id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    // Verify it's gone
    const getRes = await jfetch(`${server.baseUrl}/api/sessions/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("uses default name when name not provided", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Session");
  });

  it("session has system welcome message", async () => {
    const createRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Welcome Test" },
    });
    const id = createRes.body.id;
    const res = await jfetch(`${server.baseUrl}/api/sessions/${id}`);
    const msgs = res.body.messages;
    expect(msgs.some(m => m.type === "system" && m.content.includes("Welcome Test"))).toBe(true);
  });

  it("GET /api/sessions/:id/messages returns messages", async () => {
    const createRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Messages Test" },
    });
    const id = createRes.body.id;

    const res = await jfetch(`${server.baseUrl}/api/sessions/${id}/messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages.length).toBeGreaterThan(0);
  });
});
