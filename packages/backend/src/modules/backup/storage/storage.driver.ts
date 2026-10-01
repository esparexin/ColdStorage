import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface StorageWriteResult {
  location: string;
  sizeBytes: number;
}

export interface BackupStorageDriver {
  write(filename: string, content: Buffer): Promise<StorageWriteResult>;
  read(location: string): Promise<Buffer>;
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
    await this.ensureBaseDir();
    const targetPath = path.join(this.baseDir, filename);
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

  public async read(location: string): Promise<Buffer> {
    return fs.readFile(location);
  }

  public async delete(location: string): Promise<boolean> {
    try {
      await fs.unlink(location);
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
      const stats = await fs.stat(location);
      return stats.size === expectedBytes;
    } catch {
      return false;
    }
  }
}
