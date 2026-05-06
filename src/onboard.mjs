// ═══════════════════════════════════════════════════════════
// MADE Onboarding — auto-detect agents, git providers, tools
// Powers the /api/onboard/detect endpoint and setup wizard.
// ═══════════════════════════════════════════════════════════

import { detectAll as detectAgents } from "./agent/registry.mjs";
import { detectAllGitProviders } from "./git/provider.mjs";
import { AgentAdapter } from "./agent/adapter.mjs";
import { execSync } from "node:child_process";

/**
 * Full system scan for onboarding.
 * @param {string} workDir - Directory to check for git providers
 * @returns {{
 *   agents: Array,
 *   gitProviders: Array,
 *   tools: Array,
 *   ready: boolean,
 *   recommendations: string[]
 * }}
 */
export function fullDetect(workDir = process.cwd()) {
  const agents = detectAgents();
  const gitProviders = detectAllGitProviders(workDir);
  const tools = detectTools();

  // Check if system is ready to use
  const hasAgent = agents.some(a => a.available);
  const hasGit = gitProviders.some(g => g.available);
  const ready = hasAgent && hasGit;

  // Build recommendations
  const recommendations = [];

  if (!agents.some(a => a.available)) {
    recommendations.push({
      type: "agent",
      priority: 1,
      message: "No coding agent detected. Install one to get started:",
      options: [
        { name: "Claude Code", install: "npm install -g @anthropic-ai/claude-code" },
        { name: "OpenCode", install: "go install github.com/opencode-ai/opencode@latest" },
        { name: "GLM (built-in)", install: "Set ZAI_API_KEY env var for built-in agent" },
      ],
    });
  } else if (!agents.find(a => a.id === "claude")?.available) {
    recommendations.push({
      type: "agent_upgrade",
      priority: 3,
      message: "For the best experience, install Claude Code:",
      options: [{ name: "Claude Code", install: "npm install -g @anthropic-ai/claude-code" }],
    });
  }

  if (!gitProviders.find(g => g.id === "github")?.available) {
    if (!AgentAdapter.which("gh")) {
      recommendations.push({
        type: "git",
        priority: 2,
        message: "Install GitHub CLI for PR integration:",
        options: [{ name: "GitHub CLI", install: "brew install gh && gh auth login" }],
      });
    } else {
      recommendations.push({
        type: "git_auth",
        priority: 2,
        message: "GitHub CLI found but not authenticated. Run: gh auth login",
        options: [],
      });
    }
  }

  return {
    agents,
    gitProviders,
    tools,
    ready,
    recommendations,
    summary: {
      totalAgents: agents.length,
      availableAgents: agents.filter(a => a.available).length,
      totalGitProviders: gitProviders.length,
      availableGitProviders: gitProviders.filter(g => g.available).length,
    },
  };
}

/**
 * Detect general dev tools.
 */
function detectTools() {
  const tools = [
    { id: "node", name: "Node.js", cmd: "node", versionArgs: ["--version"] },
    { id: "npm", name: "npm", cmd: "npm", versionArgs: ["--version"] },
    { id: "git", name: "Git", cmd: "git", versionArgs: ["--version"] },
    { id: "python3", name: "Python 3", cmd: "python3", versionArgs: ["--version"] },
    { id: "docker", name: "Docker", cmd: "docker", versionArgs: ["--version"] },
    { id: "gh", name: "GitHub CLI", cmd: "gh", versionArgs: ["--version"] },
    { id: "glab", name: "GitLab CLI", cmd: "glab", versionArgs: ["version"] },
  ];

  return tools.map(tool => {
    const found = AgentAdapter.which(tool.cmd);
    return {
      id: tool.id,
      name: tool.name,
      available: !!found,
      version: found ? AgentAdapter.getVersion(tool.cmd, tool.versionArgs) : undefined,
    };
  });
}

export default fullDetect;
