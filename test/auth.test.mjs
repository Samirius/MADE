import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Auth token checking", () => {
  let server;

  beforeAll(async () => {
    server = await startServer({ MADE_TOKEN: "secret123" });
  });

  afterAll(() => {
    server.stop();
  });

  it("rejects requests without token when MADE_TOKEN is set", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/i);
  });

  it("accepts requests with valid ?token= query param", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions?token=secret123`);
    expect(res.status).toBe(200);
  });

  it("accepts requests with valid Authorization: Bearer header", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      headers: { Authorization: "Bearer secret123" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects requests with wrong token", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions?token=wrong`);
    expect(res.status).toBe(401);
  });

  it("rejects requests with empty token when MADE_TOKEN is set", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions?token=`);
    expect(res.status).toBe(401);
  });

  it("/health endpoint also requires auth", async () => {
    const res = await jfetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(401);
  });

  it("/health endpoint works with valid token", async () => {
    const res = await jfetch(`${server.baseUrl}/health?token=secret123`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("No auth when MADE_TOKEN is empty", () => {
  let server;

  beforeAll(async () => {
    server = await startServer({ MADE_TOKEN: "" });
  });

  afterAll(() => {
    server.stop();
  });

  it("allows requests without token", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
  });
});
