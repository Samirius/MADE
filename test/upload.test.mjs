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

  function multipartBody(filename, contentBuffer, contentType = "image/png") {
    const boundary = "----TestBoundary12345";
    const header = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`);
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([header, contentBuffer, footer]);
    return { body, boundary };
  }

  // Real file magic bytes for each type
  const FAKE_FILES = {
    png:  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]),
    jpg:  Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]),
    jpeg: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]),
    gif:  Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00]),
    webp: Buffer.from([0x52, 0x49, 0x46, 0x46, 0x0C, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
  };

  it("rejects non-multipart request", async () => {
    const res = await jfetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      body: { filename: "test.png" },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/multipart/);
  });

  it("accepts a valid PNG upload", async () => {
    const { body, boundary } = multipartBody("test.png", FAKE_FILES.png, "image/png");
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
    const { body, boundary } = multipartBody("photo.jpg", FAKE_FILES.jpg, "image/jpeg");
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
    const { body, boundary } = multipartBody("image.webp", FAKE_FILES.webp, "image/webp");
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(200);
  });

  it("rejects SVG upload (removed from whitelist for security)", async () => {
    const { body, boundary } = multipartBody("diagram.svg", Buffer.from("<svg></svg>"));
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/not allowed/);
  });

  it("rejects disallowed file types (e.g., .exe)", async () => {
    const { body, boundary } = multipartBody("evil.exe", Buffer.from("binary-data"));
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
    const { body, boundary } = multipartBody("notes.txt", Buffer.from("some text"));
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("rejects .js uploads", async () => {
    const { body, boundary } = multipartBody("script.js", Buffer.from("alert(1)"));
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for upload on nonexistent session", async () => {
    const { body, boundary } = multipartBody("test.png", Buffer.from("data"));
    const res = await fetch(`${server.baseUrl}/api/sessions/nonexistent/upload`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body,
    });
    expect(res.status).toBe(404);
  });
});
