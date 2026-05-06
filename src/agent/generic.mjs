// ═══════════════════════════════════════════════════════════
// MADE Generic Agent Adapter — stdin/stdout CLI wrapper
// Works with any command that reads from stdin, streams to stdout.
// Used for: GLM built-in agent, custom scripts, any CLI.
// ═══════════════════════════════════════════════════════════

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AgentAdapter } from "./adapter.mjs";

export class GenericAdapter extends AgentAdapter {
  constructor(config = {}) {
    super(config);
    this.cmd = config.cmd || "cat";          // The CLI command to run
    this.args = config.args || [];            // Static args (e.g. ["--model", "glm-5.1"])
    this.useStdin = config.useStdin !== false; // Default: prompt via stdin
    this.useContext = config.useContext || false; // Default: send only latest prompt
    this._label = config.label || "Generic Agent";
  }

  get id() { return this.cmd.includes("glm") ? "glm" : "generic"; }
  get name() { return this._label; }
  get capabilities() {
    return { canWriteFiles: true, canRunCommands: false, canSearch: false, streaming: true };
  }

  detect() {
    // If cmd is a script path, check if file exists
    if (this.cmd.includes("/")) {
      const exists = fs.existsSync(this.cmd);
      return { available: exists, error: exists ? undefined : `Script not found: ${this.cmd}` };
    }
    // Check PATH
    const found = AgentAdapter.which(this.cmd);
    return {
      available: !!found,
      version: found ? AgentAdapter.getVersion(this.cmd) : undefined,
      error: found ? undefined : `${this.cmd} not found in PATH`,
    };
  }

  async start(workDir, opts = {}) {
    this.workDir = workDir;
    this.model = opts.model;
    // No persistent process — we spawn per-request
  }

  async send(prompt, context, onStream) {
    return new Promise((resolve, reject) => {
      const fullPrompt = this.useContext
        ? AgentAdapter.buildContext(context.session, prompt)
        : prompt;

      const args = [...this.args];
      // Add model arg if needed
      if (this.model && !args.some(a => a.includes("model"))) {
        args.push("--model", this.model);
      }

      const proc = spawn(this.cmd, args, {
        cwd: this.workDir,
        env: { ...process.env },
        stdio: [this.useStdin ? "pipe" : "ignore", "pipe", "pipe"],
      });
      this.process = proc;
      this.running = true;

      if (this.useStdin) {
        proc.stdin.write(fullPrompt);
        proc.stdin.end();
      }

      let fullOutput = "";
      let buffer = "";
      let fileCapture = null;
      let fileBuffer = "";
      const filesChanged = [];

      proc.stdout.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          // File block detection: ```file:PATH
          if (fileCapture) {
            if (line.trim() === "```") {
              try {
                const filePath = path.join(this.workDir, fileCapture);
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, fileBuffer);
                filesChanged.push(fileCapture);
                onStream({ type: "file_written", content: `✅ Wrote ${fileCapture}` });
              } catch (err) {
                onStream({ type: "error", content: `❌ Failed to write ${fileCapture}: ${err.message}` });
              }
              fileCapture = null;
              fileBuffer = "";
              continue;
            } else {
              fileBuffer += line + "\n";
              onStream({ type: "stream", content: line });
              continue;
            }
          }

          const fileMatch = line.match(/^```file:(.+)$/);
          if (fileMatch) {
            fileCapture = fileMatch[1].trim();
            fileBuffer = "";
            onStream({ type: "file_start", content: `📝 Creating ${fileCapture}...` });
            continue;
          }

          fullOutput += line + "\n";
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

  abort() {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
      this.running = false;
    }
  }
}

// ─── GLM Built-in Adapter ────────────────────────────────
export class GLMAdapter extends GenericAdapter {
  constructor() {
    const scriptPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..', '..', 'scripts', 'made-glm-agent.py'
    );
    super({
      cmd: "python3",
      args: [scriptPath, "--model", "glm-5.1"],
      useStdin: true,
      useContext: false,
      label: "GLM-5.1 (built-in)",
    });
  }

  get id() { return "glm"; }

  detect() {
    // Check python3 + API key
    const pythonFound = AgentAdapter.which("python3");
    const hasApiKey = !!(process.env.ZAI_API_KEY || process.env.GLM_API_KEY);
    return {
      available: !!pythonFound && hasApiKey,
      version: pythonFound ? "GLM-5.1 via z.ai" : undefined,
      error: !pythonFound ? "python3 not found" : !hasApiKey ? "ZAI_API_KEY not set" : undefined,
    };
  }

  async send(prompt, context, onStream) {
    // Override model based on session model setting
    if (context.model === "haiku") {
      this.args = [this.args[0], "--model", "glm-4-flash"];
    } else {
      this.args = [this.args[0], "--model", "glm-5.1"];
    }
    return super.send(prompt, context, onStream);
  }
}

export default GenericAdapter;
