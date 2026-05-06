// ═══════════════════════════════════════════════════════════
// MADE Agent Registry — picks the right adapter
// One import: import { getAdapter, detectAll } from "./registry.mjs"
// ═══════════════════════════════════════════════════════════

import { ClaudeAdapter } from "./claude.mjs";
import { OpenCodeAdapter } from "./opencode.mjs";
import { HermesAdapter } from "./hermes.mjs";
import { CodexAdapter } from "./codex.mjs";
import { GLMAdapter } from "./generic.mjs";
import { GenericAdapter } from "./generic.mjs";

// Built-in adapters
const BUILTIN_ADAPTERS = {
  claude: ClaudeAdapter,
  opencode: OpenCodeAdapter,
  hermes: HermesAdapter,
  codex: CodexAdapter,
  glm: GLMAdapter,
};

/**
 * Get an agent adapter by name.
 * @param {string} name - Agent identifier (claude, opencode, hermes, codex, glm)
 * @param {object} config - Optional config for generic adapter
 * @returns {AgentAdapter}
 */
export function getAdapter(name, config = {}) {
  if (BUILTIN_ADAPTERS[name]) {
    return new BUILTIN_ADAPTERS[name](config);
  }

  // Custom agent: use generic adapter with the command
  return new GenericAdapter({
    cmd: name,
    args: config.args || [],
    useStdin: config.useStdin !== false,
    useContext: config.useContext || false,
    label: config.label || name,
    ...config,
  });
}

/**
 * Detect all available agents on this system.
 * @returns {Array<{ id, name, available, version, error, capabilities }>}
 */
export function detectAll() {
  const results = [];
  for (const [id, AdapterClass] of Object.entries(BUILTIN_ADAPTERS)) {
    const adapter = new AdapterClass();
    const detection = adapter.detect();
    results.push({
      id,
      name: adapter.name,
      capabilities: adapter.capabilities,
      ...detection,
    });
  }
  return results;
}

/**
 * Find the best available agent.
 * Priority: claude > opencode > hermes > codex > glm
 * @returns {{ id, name, adapter: AgentAdapter } | null}
 */
export function findBest() {
  const priority = ["claude", "opencode", "hermes", "codex", "glm"];
  for (const id of priority) {
    const adapter = getAdapter(id);
    const detection = adapter.detect();
    if (detection.available) {
      return { id, name: adapter.name, adapter };
    }
  }
  return null;
}

export default { getAdapter, detectAll, findBest };
