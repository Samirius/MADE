// Helper to start the MADE server as a subprocess for integration testing
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";

const require = createRequire(import.meta.url);

/**
 * Find a free port on localhost.
 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/**
 * Start the MADE server on a random port.
 * Returns { baseUrl, stop(), port }.
 */
export async function startServer(env = {}) {
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const proc = spawn(process.execPath, ["src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MADE_PORT: String(port),
      MADE_HOST: "127.0.0.1",
      MADE_DATA_DIR: `/tmp/made-test-data-${port}`,
      MADE_PROJECT_DIR: `/tmp/made-test-project-${port}`,
      MADE_TOKEN: "",
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 20000);
    const ready = (data) => {
      const s = data.toString();
      if (s.includes("MADE v") || s.includes("http://")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    proc.stdout.on("data", ready);
    proc.stderr.on("data", ready); // some environments route console to stderr
    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with code ${code}`));
    });
  });

  return {
    port,
    baseUrl,
    proc,
    stop() {
      proc.kill("SIGTERM");
    },
  };
}

/**
 * JSON fetch helper — returns { status, body, headers }.
 */
export async function jfetch(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", ...opts.headers },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  return { status: res.status, body: data, headers: res.headers };
}
