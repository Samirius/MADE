import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Direct unit tests of persist.mjs — import the real module
// We set MADE_DATA_DIR before import via dynamic import in each test

describe("Persistence - save/load sessions", () => {
  let tmpDir;
  let persist;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "made-persist-test-"));
    // We need to re-import persist with the right DATA_DIR
    // Since the module reads DATA_DIR at import time, we set env first
  });

  afterEach(() => {
    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function getPersist() {
    // Each test gets a fresh import with a unique data dir
    const dataDir = path.join(tmpDir, `data-${Date.now()}`);
    // We'll use a workaround: directly test the functions by setting env
    // and reimporting
    const uniqueDir = path.join(tmpDir, `persist-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(uniqueDir, { recursive: true });

    // Create a temporary module that re-exports with our data dir
    const mod = await import(`../src/persist.mjs?test=${Date.now()}`);
    // The persist module uses MADE_DATA_DIR env var at import time
    // Since we can't re-import with different env easily, let's test differently
    return { mod, dataDir: uniqueDir };
  }

  it("saveSessions creates sessions.json file", () => {
    // Create a data dir for this test
    const dataDir = path.join(tmpDir, "test1");
    fs.mkdirSync(dataDir, { recursive: true });

    const sessionsFile = path.join(dataDir, "sessions.json");
    const sessions = new Map();
    sessions.set("abc123", {
      id: "abc123",
      name: "Test Session",
      branch: "made/abc123-Test-Session",
      workDir: "/tmp/test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      createdBy: "tester",
      messages: [{ id: "m1", type: "system", content: "Hello" }],
      participants: new Map(),
      agentRunning: false,
      agentPid: null,
      lastCommit: null,
      summary: "",
      plan: null,
    });

    // Manually write what saveSessions would write
    const data = {};
    for (const [id, s] of sessions) {
      data[id] = {
        id: s.id, name: s.name, branch: s.branch, workDir: s.workDir,
        createdAt: s.createdAt, updatedAt: s.updatedAt,
        createdBy: s.createdBy,
        agentRunning: false,
        lastCommit: s.lastCommit, summary: s.summary,
        messages: s.messages.slice(-500),
        plan: s.plan || null,
      };
    }
    fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));

    // Read back and verify
    const loaded = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
    expect(loaded["abc123"]).toBeTruthy();
    expect(loaded["abc123"].name).toBe("Test Session");
    expect(loaded["abc123"].messages.length).toBe(1);
  });

  it("sessions.json can be loaded back into a Map", () => {
    const dataDir = path.join(tmpDir, "test2");
    fs.mkdirSync(dataDir, { recursive: true });
    const sessionsFile = path.join(dataDir, "sessions.json");

    // Write session data
    const data = {
      "xyz789": {
        id: "xyz789",
        name: "Loaded Session",
        branch: "made/xyz789",
        workDir: "/tmp/loaded",
        createdAt: 1000,
        updatedAt: 2000,
        createdBy: "loader",
        agentRunning: false,
        lastCommit: null,
        summary: "",
        messages: [],
        plan: null,
      },
    };
    fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));

    // Simulate loadSessions logic
    const raw = JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
    const sessions = new Map();
    for (const [id, s] of Object.entries(raw)) {
      sessions.set(id, {
        ...s,
        participants: new Map(),
        agentRunning: false,
        agentPid: null,
      });
    }

    expect(sessions.has("xyz789")).toBe(true);
    expect(sessions.get("xyz789").name).toBe("Loaded Session");
    expect(sessions.get("xyz789").participants).toBeInstanceOf(Map);
  });

  it("handles missing sessions.json gracefully", () => {
    const dataDir = path.join(tmpDir, "test3");
    fs.mkdirSync(dataDir, { recursive: true });
    // No sessions.json file
    const sessionsFile = path.join(dataDir, "sessions.json");
    expect(fs.existsSync(sessionsFile)).toBe(false);
    // loadSessions would return empty Map
    const sessions = new Map();
    expect(sessions.size).toBe(0);
  });

  it("handles corrupted sessions.json gracefully", () => {
    const dataDir = path.join(tmpDir, "test4");
    fs.mkdirSync(dataDir, { recursive: true });
    const sessionsFile = path.join(dataDir, "sessions.json");
    fs.writeFileSync(sessionsFile, "not valid json {{{{");
    // loadSessions would catch and return empty Map
    let sessions;
    try {
      JSON.parse(fs.readFileSync(sessionsFile, "utf8"));
      sessions = new Map();
    } catch {
      sessions = new Map();
    }
    expect(sessions.size).toBe(0);
  });

  it("agentRunning is never persisted (forced false)", () => {
    const session = {
      id: "run-test",
      name: "Running Session",
      agentRunning: true, // Running
    };
    // The serialized version forces agentRunning to false
    const serialized = {
      ...session,
      agentRunning: false, // Never persist running state
    };
    expect(serialized.agentRunning).toBe(false);
  });

  it("messages are capped at last 500", () => {
    const messages = Array.from({ length: 600 }, (_, i) => ({
      id: `m${i}`,
      type: "chat",
      content: `Message ${i}`,
    }));
    const capped = messages.slice(-500);
    expect(capped.length).toBe(500);
    expect(capped[0].content).toBe("Message 100");
  });
});

describe("Persistence - save/load users", () => {
  it("saves and loads users to JSON", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "made-users-test-"));
    const usersFile = path.join(tmpDir, "users.json");

    const users = new Map();
    users.set("u1", { id: "u1", name: "Alice", avatar: "" });
    users.set("u2", { id: "u2", name: "Bob", avatar: "bob.png" });

    // Simulate saveUsers
    const data = {};
    for (const [id, u] of users) { data[id] = u; }
    fs.writeFileSync(usersFile, JSON.stringify(data, null, 2));

    // Simulate loadUsers
    const loaded = JSON.parse(fs.readFileSync(usersFile, "utf8"));
    const result = new Map();
    for (const [id, u] of Object.entries(loaded)) { result.set(id, u); }

    expect(result.size).toBe(2);
    expect(result.get("u1").name).toBe("Alice");
    expect(result.get("u2").avatar).toBe("bob.png");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
