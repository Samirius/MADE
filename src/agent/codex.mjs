// ═══════════════════════════════════════════════════════════
// MADE Codex Adapter — via codex CLI (OpenAI)
// ═══════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import { AgentAdapter } from "./adapter.mjs";

export class CodexAdapter extends AgentAdapter {
  get id() { return "codex"; }
  get name() { return "Codex (OpenAI)"; }
  get capabilities() {
    return { canWriteFiles: true, canRunCommands: true, canSearch: false, streaming: true };
  }

  detect() {
    const found = AgentAdapter.which("codex");
    if (!found) return { available: false, error: "codex not found in PATH" };
    const version = AgentAdapter.getVersion("codex", ["--version"]);
    return { available: true, version };
  }

  async start(workDir, _opts = {}) {
    this.workDir = workDir;
    // MADE does not pass model — Codex uses its own config
  }

  async send(prompt, context, onStream) {
    const fullPrompt = AgentAdapter.buildContext(context.session, prompt);

    return new Promise((resolve, reject) => {
      const proc = spawn("codex", ["--full-auto", fullPrompt], {
        cwd: this.workDir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });
      this.process = proc;
      this.running = true;

      const filesChanged = [];
      let buffer = "";

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const fileMatch = line.match(/(?:wrote|created|updated)\s+(\S+\.\w+)/i);
          if (fileMatch && !filesChanged.includes(fileMatch[1])) {
            filesChanged.push(fileMatch[1]);
          }
          onStream({ type: "stream", content: line });
        }
      });

      proc.stderr.on("data", (chunk) => {
        onStream({ type: "stream", content: chunk.toString() });
      });

      proc.on("close", (code) => {
        this.process = null;
        this.running = false;
        resolve({ exitCode: code || 0, filesChanged });
      });

      proc.on("error", (err) => {
        this.process = null;
        this.running = false;
        reject(err);
      });
    });
  }
}

export default CodexAdapter;
