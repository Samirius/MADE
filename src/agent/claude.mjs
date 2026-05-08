// ═══════════════════════════════════════════════════════════
// MADE Claude Code Adapter — via ACP (JSON-RPC over stdio)
// ═══════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import { AgentAdapter } from "./adapter.mjs";

export class ClaudeAdapter extends AgentAdapter {
  get id() { return "claude"; }
  get name() { return "Claude Code"; }
  get capabilities() {
    return { canWriteFiles: true, canRunCommands: true, canSearch: true, streaming: true };
  }

  detect() {
    const found = AgentAdapter.which("claude");
    if (!found) return { available: false, error: "claude not found in PATH" };
    const version = AgentAdapter.getVersion("claude", ["--version"]);
    return { available: true, version };
  }

  async start(workDir, _opts = {}) {
    this.workDir = workDir;
    // MADE does not pass model — Claude Code uses its own config
  }

  async send(prompt, context, onStream) {
    const fullPrompt = AgentAdapter.buildContext(context.session, prompt);

    return new Promise((resolve, reject) => {
      // Claude Code one-shot mode: --print outputs to stdout, no model override
      const proc = spawn("claude", [
        ...(process.env.MADE_CLAUDE_UNSAFE === "true" ? ["--dangerously-skip-permissions"] : []),
        "--print", fullPrompt,
        "--output-format", "stream-json",
      ], {
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
          try {
            const event = JSON.parse(line);
            // Claude stream-json format
            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text") {
                  onStream({ type: "stream", content: block.text });
                } else if (block.type === "tool_use") {
                  if (block.name === "Write" || block.name === "Edit") {
                    const filePath = block.input?.file_path || "";
                    if (filePath && !filesChanged.includes(filePath)) filesChanged.push(filePath);
                    onStream({ type: "tool", content: `📝 ${block.name}: ${filePath}` });
                  } else if (block.name === "Bash") {
                    onStream({ type: "tool", content: `⚡ $ ${block.input?.command?.slice(0, 80) || ""}` });
                  } else {
                    onStream({ type: "tool", content: `🔧 ${block.name}` });
                  }
                }
              }
            } else if (event.type === "result") {
              onStream({ type: "stream", content: event.result || "" });
            }
          } catch {
            // Not JSON — stream as plain text
            onStream({ type: "stream", content: line });
          }
        }
      });

      proc.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        // Claude sometimes outputs useful info to stderr
        if (text.includes("error") || text.includes("Error")) {
          onStream({ type: "error", content: text.trim() });
        }
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

export default ClaudeAdapter;
