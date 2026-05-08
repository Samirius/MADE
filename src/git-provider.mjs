// ═══════════════════════════════════════════════════════════
// MADE Git Provider Abstraction Layer
// Supports GitHub, GitLab, Gitea, Bitbucket, and local git
// ═══════════════════════════════════════════════════════════

import { execSync } from "node:child_process";

// ─── Remote URL Parsing ──────────────────────────────────

/**
 * Parse a git remote URL into structured components.
 * Handles SSH (git@host:owner/repo.git), HTTPS, and other forms.
 */
function parseRemoteUrl(remoteUrl) {
  if (!remoteUrl) return null;

  let host, owner, repo, protocol;

  // SSH form: git@host:owner/repo.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    host = sshMatch[1];
    owner = sshMatch[2];
    repo = sshMatch[3];
    protocol = "ssh";
  } else {
    // HTTPS / HTTP form
    try {
      const u = new URL(remoteUrl);
      host = u.hostname;
      const parts = u.pathname.replace(/^\/+/, "").replace(/\.git$/, "").split("/");
      owner = parts[0];
      repo = parts.slice(1).join("/");
      protocol = u.protocol.replace(":", "");
    } catch (e) { console.error("Git provider exec error:", e.message);
      // Try file:// or local path
      return { host: null, owner: null, repo: null, protocol: "local", raw: remoteUrl };
    }
  }

  return { host, owner, repo, protocol, raw: remoteUrl };
}

/**
 * Detect which git hosting provider is used based on the remote URL.
 */
export function detectProvider(workdir) {
  let remoteUrl;
  try {
    remoteUrl = execSync("git remote get-url origin", {
      cwd: workdir,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) { console.error("Git provider exec error:", e.message);
    return {
      provider: "local",
      remoteUrl: null,
      parsed: null,
      webUrl: null,
      cliAvailable: false,
      message: "No git remote configured. Local repository only.",
    };
  }

  const parsed = parseRemoteUrl(remoteUrl);
  if (!parsed || !parsed.host) {
    return {
      provider: "local",
      remoteUrl,
      parsed,
      webUrl: null,
      cliAvailable: false,
      message: "Could not parse remote URL.",
    };
  }

  const { host, owner, repo } = parsed;

  // Provider detection by hostname patterns
  if (host === "github.com" || host.endsWith(".github.com")) {
    return {
      provider: "github",
      remoteUrl,
      parsed,
      webUrl: `https://github.com/${owner}/${repo}`,
      cliAvailable: cliExists("gh"),
      host, owner, repo,
    };
  }

  if (host === "gitlab.com" || host.endsWith(".gitlab.com")) {
    return {
      provider: "gitlab",
      remoteUrl,
      parsed,
      webUrl: `https://gitlab.com/${owner}/${repo}`,
      cliAvailable: cliExists("glab"),
      host, owner, repo,
    };
  }

  if (host === "bitbucket.org" || host.endsWith(".bitbucket.org")) {
    return {
      provider: "bitbucket",
      remoteUrl,
      parsed,
      webUrl: `https://bitbucket.org/${owner}/${repo}`,
      cliAvailable: cliExists("bb"),
      host, owner, repo,
    };
  }

  // Gitea: common on gitea.* subdomains or self-hosted
  if (host.includes("gitea")) {
    return {
      provider: "gitea",
      remoteUrl,
      parsed,
      webUrl: `https://${host}/${owner}/${repo}`,
      cliAvailable: cliExists("tea"),
      host, owner, repo,
    };
  }

  // Forgejo (Gitea fork)
  if (host.includes("forgejo") || host.includes("codeberg.org")) {
    return {
      provider: "gitea", // Forgejo is API-compatible with Gitea
      remoteUrl,
      parsed,
      webUrl: `https://${host}/${owner}/${repo}`,
      cliAvailable: cliExists("tea"),
      host, owner, repo,
    };
  }

  // Unknown provider — treat as generic with a web URL guess
  return {
    provider: "generic",
    remoteUrl,
    parsed,
    webUrl: parsed.protocol === "ssh"
      ? `https://${host}/${owner}/${repo}`
      : remoteUrl.replace(/\.git$/, ""),
    cliAvailable: false,
    host, owner, repo,
    message: `Unknown provider (${host}). Will use generic git instructions.`,
  };
}

// ─── CLI availability check ──────────────────────────────

function cliExists(cmd) {
  try {
    execSync(`which ${cmd} 2>/dev/null`, { encoding: "utf8", stdio: "pipe" });
    return true;
  } catch (e) { console.error("Git provider exec error:", e.message);
    return false;
  }
}

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], ...opts });
}

// ─── getWebUrl ────────────────────────────────────────────

/**
 * Returns the web URL for the repository in the given workdir.
 */
export function getWebUrl(workdir) {
  const info = detectProvider(workdir);
  return info.webUrl || null;
}

// ─── createMergeRequest ──────────────────────────────────

/**
 * Creates a Pull Request / Merge Request for the repo in `workdir`.
 * @param {string} workdir
 * @param {string} title
 * @param {string} body
 * @param {string} sourceBranch - The branch to merge from
 * @returns {Promise<{ ok: boolean, url?: string, message?: string, provider: string, method: string }>}
 */
export async function createMergeRequest(workdir, title, body, sourceBranch) {
  const info = detectProvider(workdir);

  switch (info.provider) {
    case "github":
      return createGitHub(workdir, title, body, sourceBranch, info);
    case "gitlab":
      return createGitLab(workdir, title, body, sourceBranch, info);
    case "gitea":
      return createGitea(workdir, title, body, sourceBranch, info);
    case "bitbucket":
      return createBitbucket(workdir, title, body, sourceBranch, info);
    default:
      return createGeneric(workdir, title, body, sourceBranch, info);
  }
}

// ─── GitHub ──────────────────────────────────────────────

function createGitHub(workdir, title, body, sourceBranch, info) {
  if (info.cliAvailable) {
    try {
      const out = run(
        `gh pr create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --head ${JSON.stringify(sourceBranch)}`,
        { cwd: workdir }
      );
      return { ok: true, url: out.trim(), provider: "github", method: "gh_cli" };
    } catch (e) {
      return { ok: false, error: e.message, provider: "github", method: "gh_cli" };
    }
  }

  // Fallback: try GitHub API with GITHUB_TOKEN (uses fetch — no token in /proc)
  return createGitHubAPI(workdir, title, body, sourceBranch, info);
}

async function createGitHubAPI(workdir, title, body, sourceBranch, info) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "No gh CLI and no GITHUB_TOKEN set. Install gh or set the token.", provider: "github", method: "api_fallback" };

  // Detect default branch
  let defaultBranch = "main";
  try {
    const resp = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}`, {
      headers: { "Authorization": `token ${token}`, "User-Agent": "MADE" },
    });
    defaultBranch = (await resp.json()).default_branch || "main";
  } catch { /* default to main */ }

  const resp = await fetch(`https://api.github.com/repos/${info.owner}/${info.repo}/pulls`, {
    method: "POST",
    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json", "User-Agent": "MADE" },
    body: JSON.stringify({ title, body, head: sourceBranch, base: defaultBranch }),
  });
  const data = await resp.json();
  if (data.html_url) {
    return { ok: true, url: data.html_url, provider: "github", method: "api" };
  }
  return { ok: false, error: data.message || "GitHub API error", provider: "github", method: "api_fallback" };
}

// ─── GitLab ──────────────────────────────────────────────

function createGitLab(workdir, title, body, sourceBranch, info) {
  if (info.cliAvailable) {
    try {
      const out = run(
        `glab mr create --title ${JSON.stringify(title)} --description ${JSON.stringify(body)} --head ${JSON.stringify(sourceBranch)} --yes`,
        { cwd: workdir }
      );
      // glab outputs the MR URL, extract it
      const urlMatch = out.match(/https:\/\/\S+/);
      return { ok: true, url: urlMatch ? urlMatch[0] : out.trim(), provider: "gitlab", method: "glab_cli" };
    } catch (e) {
      // Fall through to API
    }
  }

  // GitLab API fallback (uses fetch — no token in /proc)
  return createGitLabAPI(title, body, sourceBranch, info);
}

async function createGitLabAPI(title, body, sourceBranch, info) {
  const token = process.env.GITLAB_TOKEN;
  if (!token) return { ok: false, error: "No glab CLI and no GITLAB_TOKEN set.", provider: "gitlab", method: "api_fallback" };

  const projectPath = encodeURIComponent(`${info.owner}/${info.repo}`);
  const gitlabHost = `https://${info.host}`;

  // Detect default branch
  let defaultBranch = "main";
  try {
    const resp = await fetch(`${gitlabHost}/api/v4/projects/${projectPath}`, {
      headers: { "PRIVATE-TOKEN": token },
    });
    defaultBranch = (await resp.json()).default_branch || "main";
  } catch { /* default to main */ }

  const resp = await fetch(`${gitlabHost}/api/v4/projects/${projectPath}/merge_requests`, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
    body: JSON.stringify({ title, description: body, source_branch: sourceBranch, target_branch: defaultBranch }),
  });
  const data = await resp.json();
  if (data.web_url) {
    return { ok: true, url: data.web_url, provider: "gitlab", method: "api" };
  }
  return { ok: false, error: data.message || "GitLab API error", provider: "gitlab", method: "api_fallback" };
}

// ─── Gitea ───────────────────────────────────────────────

function createGitea(workdir, title, body, sourceBranch, info) {
  if (info.cliAvailable) {
    try {
      const out = run(
        `tea pulls create --title ${JSON.stringify(title)} --description ${JSON.stringify(body)} --head ${JSON.stringify(sourceBranch)}`,
        { cwd: workdir }
      );
      const urlMatch = out.match(/https:\/\/\S+/);
      return { ok: true, url: urlMatch ? urlMatch[0] : out.trim(), provider: "gitea", method: "tea_cli" };
    } catch (e) {
      // Fall through to API
    }
  }

  // Gitea API fallback (uses fetch — no token in /proc)
  return createGiteaAPI(title, body, sourceBranch, info);
}

async function createGiteaAPI(title, body, sourceBranch, info) {
  const token = process.env.GITEA_TOKEN;
  if (!token) return { ok: false, error: "No tea CLI and no GITEA_TOKEN set.", provider: "gitea", method: "api_fallback" };

  const giteaHost = `https://${info.host}`;

  // Detect default branch
  let defaultBranch = "main";
  try {
    const resp = await fetch(`${giteaHost}/api/v1/repos/${info.owner}/${info.repo}`, {
      headers: { "Authorization": `token ${token}` },
    });
    defaultBranch = (await resp.json()).default_branch || "main";
  } catch { /* default to main */ }

  const resp = await fetch(`${giteaHost}/api/v1/repos/${info.owner}/${info.repo}/pulls`, {
    method: "POST",
    headers: { "Authorization": `token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ title, body, head: sourceBranch, base: defaultBranch }),
  });
  const data = await resp.json();
  if (data.html_url) {
    return { ok: true, url: data.html_url, provider: "gitea", method: "api" };
  }
  return { ok: false, error: data.message || "Gitea API error", provider: "gitea", method: "api_fallback" };
}

// ─── Bitbucket ───────────────────────────────────────────

function createBitbucket(workdir, title, body, sourceBranch, info) {
  if (info.cliAvailable) {
    try {
      const out = run(
        `bb pullrequest create --title ${JSON.stringify(title)} --description ${JSON.stringify(body)} --source ${JSON.stringify(sourceBranch)}`,
        { cwd: workdir }
      );
      const urlMatch = out.match(/https:\/\/\S+/);
      return { ok: true, url: urlMatch ? urlMatch[0] : out.trim(), provider: "bitbucket", method: "bb_cli" };
    } catch (e) {
      // Fall through to API
    }
  }

  // Bitbucket API fallback (uses fetch — no token in /proc)
  return createBitbucketAPI(title, body, sourceBranch, info);
}

async function createBitbucketAPI(title, body, sourceBranch, info) {
  const token = process.env.BITBUCKET_TOKEN;
  const user = process.env.BITBUCKET_USER;
  if (!token || !user) return { ok: false, error: "No bb CLI and no BITBUCKET_TOKEN/BITBUCKET_USER set.", provider: "bitbucket", method: "api_fallback" };

  const apiUrl = `https://api.bitbucket.org/2.0/repositories/${info.owner}/${info.repo}/pullrequests`;
  const authHeader = `Basic ${Buffer.from(`${user}:${token}`).toString("base64")}`;

  // Detect default branch
  let defaultBranch = "main";
  try {
    const resp = await fetch(apiUrl.replace("/pullrequests", ""), {
      headers: { "Authorization": authHeader },
    });
    const data = await resp.json();
    defaultBranch = data.mainbranch?.name || "main";
  } catch { /* default to main */ }

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "Authorization": authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      description: body,
      source: { branch: { name: sourceBranch } },
      destination: { branch: { name: defaultBranch } },
    }),
  });
  const data = await resp.json();
  if (data.links?.html?.href) {
    return { ok: true, url: data.links.html.href, provider: "bitbucket", method: "api" };
  }
  return { ok: false, error: data.error?.message || "Bitbucket API error", provider: "bitbucket", method: "api_fallback" };
}

// ─── Generic / Local ─────────────────────────────────────

function createGeneric(workdir, title, body, sourceBranch, info) {
  const instructions = [
    `To create a merge request, push your branch and open the web UI:`,
    ``,
    `  git push -u origin ${sourceBranch}`,
    info.webUrl ? `  Open: ${info.webUrl}` : `  Then create a PR/MR via your git hosting provider's web interface.`,
  ].join("\n");

  return {
    ok: true,
    url: info.webUrl || null,
    message: instructions,
    provider: info.provider,
    method: "generic",
  };
}
