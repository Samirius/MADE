// ═══════════════════════════════════════════════════════════
// MADE Agent Adapter — Base class
// All agent adapters extend this. One interface, many agents.
// ═══════════════════════════════════════════════════════════

import { execSync } from "node:child_process";

export class AgentAdapter {
  constructor(config = {}) {
    this.config = config;
    this.process = null;
    this.running = false;
  }

  // ─── Must override ──────────────────────────────────────

  /** Return adapter identifier */
  get id() { throw new Error("Not implemented"); }

  /** Return human-readable name */
  get name() { throw new Error("Not implemented"); }

  /** Return capabilities: { canWriteFiles, canRunCommands, canSearch, streaming } */
  get capabilities() { throw new Error("Not implemented"); }

  /**
   * Check if agent is installed and available.
   * @returns {{ available: boolean, version?: string, error?: string }}
   */
  detect() { throw new Error("Not implemented"); }

  /**
   * Start an agent session in the given working directory.
   * @param {string} workDir - Working directory for the agent
   * @param {object} opts - { model, systemPrompt }
   * @returns {Promise<void>}
   */
  async start(workDir, opts = {}) { throw new Error("Not implemented"); }

  /**
   * Send a prompt to the running agent.
   * @param {string} prompt - User prompt
   * @param {object} context - { history: [], plan: string|null }
   * @param {function} onStream - Called with { type, content } for streaming output
   * @returns {Promise<{ exitCode: number, filesChanged: string[] }>}
   */
  async send(prompt, context, onStream) { throw new Error("Not implemented"); }

  /**
   * Abort the running agent process.
   */
  abort() {
    if (this.process && this.process.pid) {
      this.process.kill("SIGTERM");
      this.process = null;
      this.running = false;
    }
  }

  /**
   * Graceful shutdown.
   */
  async stop() {
    this.abort();
  }

  // ─── Shared utilities ───────────────────────────────────

  /** Check if a command exists in PATH */
  static which(cmd) {
    try {
      const result = execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8", timeout: 3000 }).trim();
      return result || null;
    } catch {
      return null;
    }
  }

  /** Get version of a command */
  static getVersion(cmd, args = ["--version"]) {
    try {
      return execSync(`${cmd} ${args.join(" ")}`, { encoding: "utf8", timeout: 3000 }).trim();
    } catch {
      return null;
    }
  }

  /** Build conversation context from session history */
  static buildContext(session, userPrompt) {
    const lines = [];
    lines.push(`# MADE Session: ${session.name}`);
    lines.push(`Branch: ${session.branch}`);
    lines.push("");
    lines.push("## Conversation History");

    const recent = session.messages.slice(-50);
    for (const msg of recent) {
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (msg.type === "system") lines.push(`[${time}] [System] ${msg.content}`);
      else if (msg.type === "chat") lines.push(`[${time}] [${msg.userName}] ${msg.content}`);
      else if (msg.type === "agent_start") lines.push(`[${time}] [Agent Prompt] ${msg.content}`);
      else if (msg.type === "agent_done") lines.push(`[${time}] [Agent] ${msg.content}`);
      else if (msg.type === "terminal") lines.push(`[${time}] [Terminal] ${msg.content}`);
      // Skip agent_stream — too noisy for context
    }

    if (session.plan) {
      lines.push("");
      lines.push("## Current Plan");
      lines.push(session.plan.content);
    }

    lines.push("");
    lines.push("## Current Request");
    lines.push(userPrompt);
    lines.push("");
    lines.push("You are in the MADE workspace. The project files are in the current directory. Make the changes requested above.");

    return lines.join("\n");
  }

  /** Parse file:PATH blocks from agent output and write them */
  static parseFileBlocks(output, workDir, fs, path) {
    const filesChanged = [];
    const fileBlockRegex = /```file:(.+?)\n([\s\S]*?)```/g;
    let match;
    while ((match = fileBlockRegex.exec(output)) !== null) {
      const filePath = path.join(workDir, match[1].trim());
      const content = match[2];
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        filesChanged.push(match[1].trim());
      } catch (err) {
        console.error(`Failed to write ${match[1]}: ${err.message}`);
      }
    }
    return filesChanged;
  }
}

export default AgentAdapter;
