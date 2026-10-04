import { describe, expect, it } from 'vitest';
import { config, resolveMongoUri } from '../config.js';
import { assertSafeDatabaseTarget, connectToDatabase } from '../database/connection.js';

describe('Database Safety Guard & Environment Isolation', () => {
  it('resolves mongoUri to an isolated test database under NODE_ENV=test', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const uri = resolveMongoUri();
    expect(uri).toBeDefined();
    expect(uri).toContain('cold_storage_test');
    expect(uri).not.toMatch(/\/cold_storage(\?|$)/);
  });

  it('ensures config.mongoUri points to the isolated test database', () => {
    expect(config.mongoUri).toBeDefined();
    expect(config.mongoUri).toContain('cold_storage_test');
    expect(config.mongoUri).not.toMatch(/\/cold_storage(\?|$)/);
  });

  it('rejects connection strings targeting live cold_storage in test mode', () => {
    const liveAtlasUri =
      'mongodb+srv://user:pass@cluster0.nmw9phs.mongodb.net/cold_storage?appName=Cluster0';
    const liveLocalUri = 'mongodb://127.0.0.1:27017/cold_storage';

    expect(() => assertSafeDatabaseTarget(liveAtlasUri)).toThrow(
      /FATAL SAFETY VIOLATION: Test process attempted to target live database "cold_storage"/,
    );
    expect(() => assertSafeDatabaseTarget(liveLocalUri)).toThrow(
      /FATAL SAFETY VIOLATION: Test process attempted to target live database "cold_storage"/,
    );
  });

  it('allows connection strings targeting cold_storage_test or custom test database', () => {
    const testAtlasUri =
      'mongodb+srv://user:pass@cluster0.nmw9phs.mongodb.net/cold_storage_test?appName=Cluster0';
    const testLocalUri = 'mongodb://127.0.0.1:27017/cold_storage_test';

    expect(() => assertSafeDatabaseTarget(testAtlasUri)).not.toThrow();
    expect(() => assertSafeDatabaseTarget(testLocalUri)).not.toThrow();
  });

  it('aborts connectToDatabase before connecting if target is cold_storage', async () => {
    const liveUri = 'mongodb://127.0.0.1:27017/cold_storage';
    await expect(connectToDatabase(liveUri)).rejects.toThrow(
      /FATAL SAFETY VIOLATION: Test process attempted to target live database "cold_storage"/,
    );
  });
});
