// ============================================================
// MADE – FileManager
// File operations scoped to a session workspace.
// ============================================================

import path from 'node:path';
import fs from 'node:fs';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import type { FileNode } from '../../shared/types.js';
import type { SessionManager } from './SessionManager.js';

export class FileManager {
  private sessionManager: SessionManager;
  private watchers = new Map<string, FSWatcher>();

  constructor(sessionManager: SessionManager) {
    this.sessionManager = sessionManager;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /** Resolve a path relative to the session workspace, enforcing safety. */
  private resolve(sessionId: string, filePath?: string): string {
    const workspace = this.sessionManager.getWorkspacePath(sessionId);
    if (!workspace) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    const base = filePath ? path.join(workspace, filePath) : workspace;
    const resolved = path.resolve(base);
    // Prevent path traversal outside the workspace
    if (!resolved.startsWith(path.resolve(workspace))) {
      throw new Error('Path traversal denied');
    }
    return resolved;
  }

  // ------------------------------------------------------------------
  // List
  // ------------------------------------------------------------------

  /** Recursively list files and directories under dirPath. */
  list(sessionId: string, dirPath?: string): FileNode[] {
    const target = this.resolve(sessionId, dirPath);
    if (!fs.existsSync(target)) return [];

    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .map((entry): FileNode => {
        const fullPath = path.join(target, entry.name);
        const relPath = path.relative(
          this.sessionManager.getWorkspacePath(sessionId)!,
          fullPath,
        );

        if (entry.isDirectory()) {
          return {
            name: entry.name,
            path: relPath,
            type: 'directory',
            children: this.list(sessionId, relPath),
          };
        }

        const stat = fs.statSync(fullPath);
        return {
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stat.size,
          modified: stat.mtime,
        };
      })
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  // ------------------------------------------------------------------
  // Read
  // ------------------------------------------------------------------

  /** Read the full content of a file as a UTF-8 string. */
  read(sessionId: string, filePath: string): string {
    const resolved = this.resolve(sessionId, filePath);
    return fs.readFileSync(resolved, 'utf-8');
  }

  // ------------------------------------------------------------------
  // Write
  // ------------------------------------------------------------------

  /** Write content to a file, creating parent directories as needed. */
  write(sessionId: string, filePath: string, content: string): void {
    const resolved = this.resolve(sessionId, filePath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, 'utf-8');
  }

  // ------------------------------------------------------------------
  // Delete
  // ------------------------------------------------------------------

  /** Delete a file or directory recursively. */
  delete(sessionId: string, filePath: string): void {
    const resolved = this.resolve(sessionId, filePath);
    if (!fs.existsSync(resolved)) return;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      fs.rmSync(resolved, { recursive: true, force: true });
    } else {
      fs.unlinkSync(resolved);
    }
  }

  // ------------------------------------------------------------------
  // Exists
  // ------------------------------------------------------------------

  /** Check whether a file or directory exists. */
  exists(sessionId: string, filePath: string): boolean {
    const resolved = this.resolve(sessionId, filePath);
    return fs.existsSync(resolved);
  }

  // ------------------------------------------------------------------
  // Watch
  // ------------------------------------------------------------------

  /**
   * Start a chokidar watcher on the session workspace.
   * The callback receives (event: 'add'|'change'|'unlink', filePath).
   */
  watch(
    sessionId: string,
    callback: (event: string, filePath: string) => void,
  ): void {
    // Close existing watcher if any
    this.unwatch(sessionId);

    const workspace = this.sessionManager.getWorkspacePath(sessionId);
    if (!workspace) return;

    const watcher = chokidar.watch(workspace, {
      ignored: /(^|[/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    watcher.on('all', (event, filePath) => {
      const relPath = path.relative(workspace, filePath);
      callback(event, relPath);
    });

    this.watchers.set(sessionId, watcher);
  }

  /** Stop watching a session workspace. */
  unwatch(sessionId: string): void {
    const watcher = this.watchers.get(sessionId);
    if (watcher) {
      watcher.close();
      this.watchers.delete(sessionId);
    }
  }
}
