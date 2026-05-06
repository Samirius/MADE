// ═══════════════════════════════════════════════════════════
// MADE OpenCode Adapter — via ACP (JSON-RPC over stdio)
// ═══════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import { AgentAdapter } from "./adapter.mjs";

export class OpenCodeAdapter extends AgentAdapter {
  get id() { return "opencode"; }
  get name() { return "OpenCode"; }
  get capabilities() {
    return { canWriteFiles: true, canRunCommands: true, canSearch: true, streaming: true };
  }

  detect() {
    const found = AgentAdapter.which("opencode");
    if (!found) return { available: false, error: "opencode not found in PATH" };
    const version = AgentAdapter.getVersion("opencode", ["--version"]);
    return { available: true, version };
  }

  async start(workDir, opts = {}) {
    this.workDir = workDir;
    this.model = opts.model;
  }

  async send(prompt, context, onStream) {
    const fullPrompt = AgentAdapter.buildContext(context.session, prompt);

    return new Promise((resolve, reject) => {
      const proc = spawn("opencode", ["-p", fullPrompt], {
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

          // Try JSON (ACP format)
          try {
            const event = JSON.parse(line);
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") {
                  onStream({ type: "stream", content: block.text });
                } else if (block.type === "tool_use") {
                  const fp = block.input?.file_path;
                  if (fp && !filesChanged.includes(fp)) filesChanged.push(fp);
                  onStream({ type: "tool", content: `🔧 ${block.name}: ${fp || ""}` });
                }
              }
            }
            continue;
          } catch {}

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

export default OpenCodeAdapter;
