import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface StorageWriteResult {
  location: string;
  sizeBytes: number;
}

export interface BackupStorageDriver {
  write(filename: string, content: Buffer): Promise<StorageWriteResult>;
  delete(location: string): Promise<boolean>;
  verify(location: string, expectedBytes: number): Promise<boolean>;
}

export class LocalEncryptedStorageDriver implements BackupStorageDriver {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), 'storage/backups');
  }

  private async ensureBaseDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  public async write(filename: string, content: Buffer): Promise<StorageWriteResult> {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename: path traversal forbidden');
    }
    await this.ensureBaseDir();
    const targetPath = path.resolve(this.baseDir, filename);
    const baseResolved = `${path.resolve(this.baseDir)}${path.sep}`;
    if (!targetPath.startsWith(baseResolved)) throw new Error('Storage jail violation');
    const tempPath = `${targetPath}.tmp_${Date.now()}`;

    // Write to temporary file first, then atomically rename
    await fs.writeFile(tempPath, content);
    await fs.rename(tempPath, targetPath);

    const stats = await fs.stat(targetPath);
    return {
      location: targetPath,
      sizeBytes: stats.size,
    };
  }

  public async delete(location: string): Promise<boolean> {
    try {
      const resolved = path.resolve(location);
      const baseResolved = `${path.resolve(this.baseDir)}${path.sep}`;
      if (!resolved.startsWith(baseResolved)) throw new Error('Storage jail violation');
      await fs.unlink(resolved);
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') {
        return false;
      }
      throw err;
    }
  }

  public async verify(location: string, expectedBytes: number): Promise<boolean> {
    try {
      const resolved = path.resolve(location);
      const baseResolved = `${path.resolve(this.baseDir)}${path.sep}`;
      if (!resolved.startsWith(baseResolved)) return false;
      const stats = await fs.stat(resolved);
      return stats.size === expectedBytes;
    } catch {
      return false;
    }
  }
}
