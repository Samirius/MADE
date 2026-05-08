// ═══════════════════════════════════════════════════════════
// MADE Hermes Adapter — via hermes CLI
// ═══════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import { AgentAdapter } from "./adapter.mjs";

export class HermesAdapter extends AgentAdapter {
  get id() { return "hermes"; }
  get name() { return "Hermes Agent"; }
  get capabilities() {
    return { canWriteFiles: true, canRunCommands: true, canSearch: true, streaming: true };
  }

  detect() {
    const found = AgentAdapter.which("hermes");
    if (!found) return { available: false, error: "hermes not found in PATH" };
    const version = AgentAdapter.getVersion("hermes", ["--version"]);
    return { available: true, version };
  }

  async start(workDir, _opts = {}) {
    this.workDir = workDir;
    // MADE does not pass model — Hermes uses its own config (~/.hermes/config.yaml)
  }

  async send(prompt, context, onStream) {
    const fullPrompt = AgentAdapter.buildContext(context.session, prompt);

    return new Promise((resolve, reject) => {
      // Hermes CLI: chat -q for single query, -Q for quiet (no banner/spinner), --yolo skips approvals
      // Do NOT pass --model — Hermes uses its own config
      const args = ["chat", "-q", fullPrompt, "-Q", "--yolo"];

      const proc = spawn("hermes", args, {
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
          // Detect file writes from Hermes output
          const fileMatch = line.match(/(?:wrote|created|updated|modified)\s+(\S+\.\w+)/i);
          if (fileMatch && !filesChanged.includes(fileMatch[1])) {
            filesChanged.push(fileMatch[1]);
          }
          onStream({ type: "stream", content: line });
        }
      });

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        if (text.trim()) onStream({ type: "stream", content: text });
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

export default HermesAdapter;
