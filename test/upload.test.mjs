import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startServer, jfetch } from "./helpers.mjs";

describe("Upload validation", () => {
  let server;
  let sessionId;

  beforeAll(async () => {
    server = await startServer();
    const res = await jfetch(`${server.baseUrl}/api/sessions`, {
      method: "POST",
      body: { name: "Upload Test" },
    });
    sessionId = res.body.id;
  });

  afterAll(() => {
    server.stop();
  });

  function multipartBody(filename, content, contentType = "image/png") {
    const boundary = "----TestBoundary12345";
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;
    const body = header + content + footer;
    return { body, boundary };
  }

  it("rejects non-multipart request", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      body: { filename: "test.png" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/multipart/);
  });

  it("accepts a valid PNG upload", async () => {
    const { body, boundary } = multipartBody("test.png", "fake-png-data");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message.fileName).toBe("test.png");
    expect(data.message.type).toBe("image");
    expect(data.message.content).toMatch(/^\/api\/sessions\//);
  });

  it("accepts JPG upload", async () => {
    const { body, boundary } = multipartBody("photo.jpg", "fake-jpg-data");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("accepts WEBP upload", async () => {
    const { body, boundary } = multipartBody("image.webp", "fake-webp-data");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("accepts SVG upload", async () => {
    const { body, boundary } = multipartBody("diagram.svg", "<svg></svg>");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("rejects disallowed file types (e.g., .exe)", async () => {
    const { body, boundary } = multipartBody("evil.exe", "binary-data");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not allowed/);
  });

  it("rejects .txt uploads", async () => {
    const { body, boundary } = multipartBody("notes.txt", "some text");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("rejects .js uploads", async () => {
    const { body, boundary } = multipartBody("script.js", "alert(1)");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for upload on nonexistent session", async () => {
    const { body, boundary } = multipartBody("test.png", "data");
    const res = await fetch(`${server.baseUrl}/api/sessions/nonexistent/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(404);
  });
});
