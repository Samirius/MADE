import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("File operations", () => {
  let server;
  let sessionId;

  beforeAll(async () => {
    server = await startServer();
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "File Ops Test" },
    });
    sessionId = res.body.id;
  });

  afterAll(() => {
    server.stop();
  });

  it("lists files in session root directory", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.entries)).toBe(true);
    // Should at least have README.md
    expect(res.body.entries.some(e => e.name === "README.md")).toBe(true);
  });

  it("reads a file (README.md) from session", async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/files/README.md`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("File Ops Test");
  });

  it("writes a new file to session workspace", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/hello.txt`, {
      method: "PUT",
      body: { content: "Hello from test!" },
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("reads back the written file", async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/files/hello.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Hello from test!");
  });

  it("writes to a nested path (creates directories)", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/deep/nested/file.txt`, {
      method: "PUT",
      body: { content: "deep content" },
    });
    expect(res.status).toBe(200);
  });

  it("reads back the nested file", async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/files/deep/nested/file.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("deep content");
  });

  it("blocks path traversal with ../etc/passwd", async () => {
    // fetch() resolves .. in the URL before sending, so the server sees a normalized
    // path that doesn't match the files route → 404 (path is safe either way)
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/../../../etc/passwd`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for nonexistent file", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/nope.txt`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for file ops on nonexistent session", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/nonexistent/files/`);
    expect(res.status).toBe(404);
  });

  it("file write also blocks path traversal", async () => {
    // fetch() resolves .. in the URL before sending, so the server sees a normalized
    // path that doesn't match the files route → 404 (path is safe either way)
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/../../../tmp/evil.txt`, {
      method: "PUT",
      body: { content: "evil" },
    });
    expect(res.status).toBe(404);
  });

  it("lists directory entries with type info", async () => {
    // Write a file and list
    await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/testdir/doc.txt`, {
      method: "PUT",
      body: { content: "dir test" },
    });
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/files/`);
    expect(res.status).toBe(200);
    const dirEntry = res.body.entries.find(e => e.name === "testdir");
    expect(dirEntry).toBeTruthy();
    expect(dirEntry.type).toBe("dir");
  });
});
