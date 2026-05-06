// ═══════════════════════════════════════════════════════════
// MADE Git Providers — class-based provider abstraction
// Supports GitHub, GitLab, Gitea, Bitbucket, and local git.
// ═══════════════════════════════════════════════════════════

import { execSync } from "node:child_process";
import { AgentAdapter } from "../agent/adapter.mjs";

// ─── Base Class ──────────────────────────────────────────

export class GitProvider {
  constructor(workDir) {
    this.workDir = workDir;
  }

  get id() { return "unknown"; }
  get name() { return "Unknown"; }

  /** Run git command in workDir */
  git(cmd) {
    return execSync(`git ${cmd}`, {
      cwd: this.workDir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  }

  /** Get current branch */
  getBranch() {
    try { return this.git("branch --show-current"); }
    catch { return "main"; }
  }

  /** Get git status */
  getStatus() {
    try { return this.git("status --porcelain"); }
    catch { return ""; }
  }

  /** Get recent log */
  getLog(count = 10) {
    try { return this.git(`log --oneline -${count}`); }
    catch { return ""; }
  }

  /** Get diff */
  getDiff() {
    try { return this.git("diff HEAD"); }
    catch { return ""; }
  }

  /** Stage and commit */
  commit(message, author = "MADE Agent <made@sabbk.com>") {
    this.git("add -A");
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: author.split("<")[0].trim(),
      GIT_AUTHOR_EMAIL: author.match(/<(.+)>/)?.[1] || "made@sabbk.com",
      GIT_COMMITTER_NAME: author.split("<")[0].trim(),
      GIT_COMMITTER_EMAIL: author.match(/<(.+)>/)?.[1] || "made@sabbk.com",
    };
    return execSync(`git commit -m ${JSON.stringify(message)} --no-gpg-sign --allow-empty`, {
      cwd: this.workDir, stdio: "pipe", encoding: "utf8", env,
    });
  }

  /** Push to remote */
  push(branch) {
    return this.git(`push -u origin ${branch}`);
  }

  /** Create PR/MR — override in subclasses */
  async createPR(title, body, branch) {
    return { ok: false, error: "Not supported by this provider" };
  }

  /** Full status object */
  getFullStatus() {
    const status = this.getStatus();
    return {
      branch: this.getBranch(),
      status: status.trim(),
      log: this.getLog(),
      dirty: status.trim().length > 0,
      provider: this.id,
    };
  }
}

// ─── GitHub ──────────────────────────────────────────────

export class GitHubProvider extends GitProvider {
  get id() { return "github"; }
  get name() { return "GitHub"; }

  async createPR(title, body, branch) {
    try {
      const result = execSync(
        `gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --head ${branch}`,
        { cwd: this.workDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      return { ok: true, url: result, provider: "github", method: "gh_cli" };
    } catch (e) {
      return { ok: false, error: e.message, provider: "github" };
    }
  }
}

// ─── GitLab ──────────────────────────────────────────────

export class GitLabProvider extends GitProvider {
  get id() { return "gitlab"; }
  get name() { return "GitLab"; }

  async createPR(title, body, branch) {
    try {
      const result = execSync(
        `glab mr create --title ${JSON.stringify(title)} --description ${JSON.stringify(body)} --source-branch ${branch}`,
        { cwd: this.workDir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      return { ok: true, url: result, provider: "gitlab", method: "glab_cli" };
    } catch (e) {
      return { ok: false, error: e.message, provider: "gitlab" };
    }
  }
}

// ─── Local Only ──────────────────────────────────────────

export class LocalProvider extends GitProvider {
  get id() { return "local"; }
  get name() { return "Local Git"; }
}

// ─── Detection ───────────────────────────────────────────

/**
 * Detect git provider from a working directory.
 * @param {string} workDir
 * @returns {GitProvider}
 */
export function detectGitProvider(workDir) {
  // Check for gh CLI + GitHub remote
  const ghFound = AgentAdapter.which("gh");
  if (ghFound) {
    try {
      execSync("gh auth status", { stdio: "pipe" });
      const remote = execSync("git remote get-url origin 2>/dev/null", {
        cwd: workDir, encoding: "utf8", stdio: "pipe",
      }).trim();
      if (remote.includes("github.com")) return new GitHubProvider(workDir);
    } catch {}
  }

  // Check for glab CLI + GitLab remote
  const glabFound = AgentAdapter.which("glab");
  if (glabFound) {
    try {
      execSync("glab auth status", { stdio: "pipe" });
      const remote = execSync("git remote get-url origin 2>/dev/null", {
        cwd: workDir, encoding: "utf8", stdio: "pipe",
      }).trim();
      if (remote.includes("gitlab.com") || remote.includes("gitlab")) return new GitLabProvider(workDir);
    } catch {}
  }

  // Check remote URL for provider hints
  try {
    const remote = execSync("git remote get-url origin 2>/dev/null", {
      cwd: workDir, encoding: "utf8", stdio: "pipe",
    }).trim();
    if (remote.includes("github")) return new GitHubProvider(workDir);
    if (remote.includes("gitlab")) return new GitLabProvider(workDir);
    if (remote.includes("gitea") || remote.includes("forgejo")) return new GitProvider(workDir);
    if (remote.includes("bitbucket")) return new GitProvider(workDir);
  } catch {}

  return new LocalProvider(workDir);
}

/**
 * Detect all available git providers on this system.
 */
export function detectAllGitProviders(workDir) {
  const providers = [];

  const ghFound = AgentAdapter.which("gh");
  if (ghFound) {
    try {
      execSync("gh auth status", { stdio: "pipe" });
      providers.push({ id: "github", name: "GitHub", available: true, tool: "gh" });
    } catch {
      providers.push({ id: "github", name: "GitHub", available: false, error: "gh not authenticated" });
    }
  } else {
    providers.push({ id: "github", name: "GitHub", available: false, error: "gh CLI not found" });
  }

  const glabFound = AgentAdapter.which("glab");
  if (glabFound) {
    try {
      execSync("glab auth status", { stdio: "pipe" });
      providers.push({ id: "gitlab", name: "GitLab", available: true, tool: "glab" });
    } catch {
      providers.push({ id: "gitlab", name: "GitLab", available: false, error: "glab not authenticated" });
    }
  } else {
    providers.push({ id: "gitlab", name: "GitLab", available: false, error: "glab CLI not found" });
  }

  providers.push({ id: "local", name: "Local Git", available: true, tool: "git" });

  return providers;
}
