// ============================================================
// MADE – ContainerManager
// Manages Docker containers per session for isolated workspaces.
// ============================================================

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export class ContainerManager {
  private containers = new Map<string, string>(); // sessionId -> containerId

  async create(sessionId: string, workspacePath: string): Promise<string> {
    // Check if Docker is available
    try {
      await execAsync('docker --version');
    } catch {
      // Docker not available - return empty string, fall back to local
      return '';
    }

    // Create a container with the workspace mounted
    const imageName = process.env.MADE_DOCKER_IMAGE || 'ubuntu:22.04';
    const { stdout } = await execAsync(
      `docker run -d --name made-${sessionId.slice(0, 8)} ` +
      `-v ${workspacePath}:/workspace ` +
      `-w /workspace ` +
      `--label made-session=${sessionId} ` +
      `${imageName} tail -f /dev/null`,
    );
    const containerId = stdout.trim();
    this.containers.set(sessionId, containerId);
    return containerId;
  }

  async exec(
    sessionId: string,
    command: string,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) {
      throw new Error('Container not found');
    }
    try {
      const { stdout, stderr } = await execAsync(
        `docker exec ${containerId} bash -c ${JSON.stringify(command)}`,
      );
      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      return {
        stdout: e.stdout || '',
        stderr: e.stderr || '',
        exitCode: e.code || 1,
      };
    }
  }

  async stop(sessionId: string): Promise<void> {
    const containerId = this.containers.get(sessionId);
    if (!containerId) return;
    try {
      await execAsync(`docker stop ${containerId} && docker rm ${containerId}`);
    } catch {
      // Swallow errors during cleanup
    }
    this.containers.delete(sessionId);
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execAsync('docker info');
      return true;
    } catch {
      return false;
    }
  }

  hasContainer(sessionId: string): boolean {
    return this.containers.has(sessionId);
  }

  get containerCount(): number {
    return this.containers.size;
  }
}
