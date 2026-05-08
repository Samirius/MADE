import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Health and misc API endpoints", () => {
  let server;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(() => {
    server.stop();
  });

  it("GET /health returns status ok with version", async () => {
    const res = await jfetch(`${server.baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.version).toBe("0.4.0");
  });

  it("GET /api/agents returns agent list", async () => {
    const res = await jfetch(`${server.baseUrl}/api/agents`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.agents)).toBe(true);
    // Each agent should have id, name, available
    for (const agent of res.body.agents) {
      expect(agent.id).toBeTruthy();
      expect(agent.name).toBeTruthy();
      expect(typeof agent.available).toBe("boolean");
    }
  });

  it("GET /api/onboard/detect returns detection results", async () => {
    const res = await jfetch(`${server.baseUrl}/api/onboard/detect`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.agents)).toBe(true);
    expect(typeof res.body.ready).toBe("boolean");
  });

  it("GET /api/git/provider returns provider info", async () => {
    const res = await jfetch(`${server.baseUrl}/api/git/provider`);
    expect(res.status).toBe(200);
    // For test environment with no git remote, should be local
    expect(res.body.ok).toBe(true);
    expect(res.body.provider).toBeTruthy();
  });

  it("GET /api/activity returns activity feed", async () => {
    const res = await jfetch(`${server.baseUrl}/api/activity`);
    expect(res.status).toBe(200);
    expect(res.body.stats).toBeTruthy();
    expect(typeof res.body.stats.totalSessions).toBe("number");
  });

  it("POST /api/users creates a user", async () => {
    const res = await jfetch(`${server.baseUrl}/api/users`, {
      method: "POST",
      body: { name: "Test User", id: "test-user-1" },
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Test User");
    expect(res.body.id).toBe("test-user-1");
  });

  it("GET /api/users lists users", async () => {
    const res = await jfetch(`${server.baseUrl}/api/users`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.some(u => u.name === "Test User")).toBe(true);
  });

  it("POST /api/sessions/:id/plan creates a plan", async () => {
    // Create session first
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Plan Test" },
    });
    const sid = sRes.body.id;

    const planRes = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "Step 1: Do stuff\nStep 2: More stuff", title: "My Plan" },
    });
    expect(planRes.status).toBe(200);
    expect(planRes.body.ok).toBe(true);
    expect(planRes.body.plan.content).toContain("Step 1");
  });

  it("GET /api/sessions/:id/plan retrieves plan", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Plan Get Test" },
    });
    const sid = sRes.body.id;

    // Create plan
    await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "Plan content here" },
    });

    const res = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeTruthy();
    expect(res.body.plan.content).toBe("Plan content here");
  });

  it("DELETE /api/sessions/:id/plan removes plan", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Plan Delete Test" },
    });
    const sid = sRes.body.id;

    await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "temp plan" },
    });

    const delRes = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.ok).toBe(true);

    const getRes = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`);
    expect(getRes.body.plan).toBeNull();
  });

  it("GET /api/sessions/:id/git/status returns git info", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Git Status Test" },
    });
    const sid = sRes.body.id;

    const res = await jfetch(`${server.baseUrl}/api/sessions/${sid}/git/status`);
    expect(res.status).toBe(200);
    expect(res.body.branch).toBeTruthy();
  });

  it("POST /api/sessions/:id/git/commit creates a commit", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Git Commit Test" },
    });
    const sid = sRes.body.id;

    // Write a file first
    await jfetch(`${server.baseUrl}/api/sessions/${sid}/files/newfile.txt`, {
      method: "PUT",
      body: { content: "commit me" },
    });

    const res = await jfetch(`${server.baseUrl}/api/sessions/${sid}/git/commit`, {
      method: "POST",
      body: { message: "test commit" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("GET /api/sessions/:id/git/diff returns diff", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Git Diff Test" },
    });
    const sid = sRes.body.id;

    const res = await jfetch(`${server.baseUrl}/api/sessions/${sid}/git/diff`);
    expect(res.status).toBe(200);
    // diff may be empty string for clean repo
    expect(typeof res.body.diff).toBe("string");
  });

  it("plan optimistic locking rejects stale updates", async () => {
    const sRes = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Lock Test" },
    });
    const sid = sRes.body.id;

    // Create initial plan
    const createRes = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "v1" },
    });
    const updatedAt = createRes.body.plan.updatedAt;

    // Update with correct timestamp
    const updateRes1 = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "v2", updatedAt },
    });
    expect(updateRes1.status).toBe(200);

    // Try update with stale timestamp
    const updateRes2 = await jfetch(`${server.baseUrl}/api/sessions/${sid}/plan`, {
      method: "POST",
      body: { content: "v3", updatedAt }, // stale!
    });
    expect(updateRes2.status).toBe(409);
    expect(updateRes2.body.conflict).toBe(true);
  });

  it("unknown API route returns 404", async () => {
    const res = await jfetch(`${server.baseUrl}/api/unknown-route`);
    expect(res.status).toBe(404);
  });
});
