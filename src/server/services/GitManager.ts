// ============================================================
// MADE – GitManager
// Git operations per session using simple-git.
// ============================================================

import { simpleGit, SimpleGit, StatusResult, BranchSummary, LogResult } from 'simple-git';
import type {
  GitStatusResult,
  GitBranchResult,
  CommitInfo,
} from '../../shared/types.js';
import type { SessionManager } from './SessionManager.js';

export class GitManager {
  private sessionManager: SessionManager;

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  /** Get a simple-git instance scoped to a session workspace. */
  private git(sessionId: string): SimpleGit {
    const workspace = this.sessionManager.getWorkspacePath(sessionId);
    if (!workspace) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return simpleGit(workspace);
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------

  /** Initialize a git repo in the session workspace. */
  async init(sessionId: string): Promise<void> {
    const git = this.git(sessionId);
    await git.init();
    // Configure a default user so commits work without global config
    await git.addConfig('user.email', 'made@localhost');
    await git.addConfig('user.name', 'MADE');
  }

  // ------------------------------------------------------------------
  // Status
  // ------------------------------------------------------------------

  /** Return a structured git status for the session. */
  async status(sessionId: string): Promise<GitStatusResult> {
    const git = this.git(sessionId);
    const s: StatusResult = await git.status();

    return {
      branch: s.current ?? '',
      staged: s.staged,
      modified: s.modified,
      untracked: s.not_added,
    };
  }

  // ------------------------------------------------------------------
  // Diff
  // ------------------------------------------------------------------

  /** Return the diff (optionally for a specific file). */
  async diff(sessionId: string, filePath?: string): Promise<string> {
    const git = this.git(sessionId);
    if (filePath) {
      return git.diff([filePath]);
    }
    return git.diff();
  }

  // ------------------------------------------------------------------
  // Commit
  // ------------------------------------------------------------------

  /** Stage all changes and commit. */
  async commit(sessionId: string, message: string, author?: string): Promise<void> {
    const git = this.git(sessionId);

    if (author) {
      await git.addConfig('user.name', author);
    }

    await git.add('-A');
    await git.commit(message);
  }

  // ------------------------------------------------------------------
  // Branch
  // ------------------------------------------------------------------

  /** List all branches and indicate the current one. */
  async branch(sessionId: string): Promise<GitBranchResult> {
    const git = this.git(sessionId);
    const summary: BranchSummary = await git.branch();

    return {
      current: summary.current,
      branches: Object.keys(summary.branches),
    };
  }

  /** Checkout an existing branch. */
  async checkout(sessionId: string, branchName: string): Promise<void> {
    const git = this.git(sessionId);
    await git.checkout(branchName);
  }

  /** Create and checkout a new branch. */
  async createBranch(sessionId: string, name: string): Promise<void> {
    const git = this.git(sessionId);
    await git.checkoutLocalBranch(name);
  }

  // ------------------------------------------------------------------
  // Push
  // ------------------------------------------------------------------

  /** Push a branch to a remote. */
  async push(sessionId: string, remote: string, branch: string): Promise<void> {
    const git = this.git(sessionId);
    await git.push([remote, branch]);
  }

  // ------------------------------------------------------------------
  // Log
  // ------------------------------------------------------------------

  /** Return recent commits. */
  async log(sessionId: string, count = 20): Promise<CommitInfo[]> {
    const git = this.git(sessionId);
    const result: LogResult = await git.log({ maxCount: count });

    return result.all.map((c) => ({
      hash: c.hash,
      message: c.message,
      author: c.author_name,
      date: c.date,
    }));
  }
}
