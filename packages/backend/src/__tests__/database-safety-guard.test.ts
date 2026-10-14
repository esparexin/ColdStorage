import { describe, expect, it } from 'vitest';
import { config, resolveMongoUri } from '../config.js';
import {
  assertSafeDatabaseTarget,
  connectToDatabase,
  extractDatabaseName,
  isLiveDatabaseName,
} from '../database/connection.js';

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

  it('fails closed: NODE_ENV=test + Atlas live URI never resolves to cold_storage', () => {
    expect(process.env.NODE_ENV).toBe('test');
    const liveAtlasUri =
      'mongodb+srv://user:pass@cluster0.nmw9phs.mongodb.net/cold_storage?appName=Cluster0';
    expect(() => assertSafeDatabaseTarget(liveAtlasUri)).toThrow(/FATAL SAFETY VIOLATION/);
    // resolveMongoUri() rewrites any inherited live URI to the isolated test DB.
    expect(resolveMongoUri()).not.toMatch(/\/cold_storage(\?|$)/);
  });

  it('rejects bypasses that the previous last-segment parser missed', () => {
    // Each of these passed the old implementation:
    //   const dbName = uri.split('?')[0].split('/').pop()
    // A trailing slash yields '' from lastIndexOf('/'), and only the exact
    // lowercase string was compared.

    // 1. Trailing slash -> old parser read '' and allowed the live target.
    expect(() =>
      assertSafeDatabaseTarget('mongodb://127.0.0.1:27017/cold_storage/'),
    ).toThrow(/FATAL SAFETY VIOLATION/);

    // 2. Multiple trailing slashes.
    expect(() =>
      assertSafeDatabaseTarget('mongodb://127.0.0.1:27017/cold_storage///'),
    ).toThrow(/FATAL SAFETY VIOLATION/);

    // 3. Case variation: a live database renamed by case is still live.
    expect(() =>
      assertSafeDatabaseTarget('mongodb://127.0.0.1:27017/Cold_Storage'),
    ).toThrow(/FATAL SAFETY VIOLATION/);
    expect(() =>
      assertSafeDatabaseTarget('mongodb://127.0.0.1:27017/COLD_STORAGE'),
    ).toThrow(/FATAL SAFETY VIOLATION/);

    // 4. An unencoded '/' in the password must not shift the parse.
    expect(() =>
      assertSafeDatabaseTarget('mongodb://user:pa/ss@127.0.0.1:27017/cold_storage'),
    ).toThrow(/FATAL SAFETY VIOLATION/);

    // 5. Percent-encoded credentials are decoded correctly.
    expect(() =>
      assertSafeDatabaseTarget(
        'mongodb+srv://user:p%40ss@cluster0.example.net/cold_storage?retryWrites=true',
      ),
    ).toThrow(/FATAL SAFETY VIOLATION/);
  });

  it('extractDatabaseName parses the database path correctly', () => {
    const cases: Array<[string, string]> = [
      ['mongodb://127.0.0.1:27017/cold_storage', 'cold_storage'],
      ['mongodb://127.0.0.1:27017/cold_storage/', 'cold_storage'],
      ['mongodb://127.0.0.1:27017/cold_storage///', 'cold_storage'],
      ['mongodb://127.0.0.1:27017/cold_storage?replicaSet=rs0', 'cold_storage'],
      ['mongodb://127.0.0.1:27017/', ''],
      ['mongodb://127.0.0.1:27017', ''],
      ['mongodb+srv://u:p@cluster0.example.net/cold_storage_test', 'cold_storage_test'],
      ['mongodb://user:pa/ss@127.0.0.1:27017/cold_storage', 'cold_storage'],
      ['mongodb+srv://user:p%40ss@cluster0.example.net/cold_storage?x=1', 'cold_storage'],
      ['mongodb://h/a,b:27017/cold_storage', 'cold_storage'],
    ];
    for (const [uri, expected] of cases) {
      expect(extractDatabaseName(uri), uri).toBe(expected);
    }
  });

  it('isLiveDatabaseName is case-insensitive and does not match suffixed names', () => {
    expect(isLiveDatabaseName('cold_storage')).toBe(true);
    expect(isLiveDatabaseName('COLD_STORAGE')).toBe(true);
    expect(isLiveDatabaseName('Cold_Storage')).toBe(true);
    // A different database is not the live one; the guard is not a prefix test.
    expect(isLiveDatabaseName('cold_storage_prod')).toBe(false);
    expect(isLiveDatabaseName('cold_storage_test')).toBe(false);
  });

  it('keeps stock suites on an isolated database even when MONGODB_URI is Atlas', async () => {
    const { stockSuiteUri } = await import('./helpers/stock-reset.js');
    const previousTestUri = process.env.MONGODB_TEST_URI;
    const previousUri = process.env.MONGODB_URI;
    process.env.MONGODB_URI =
      'mongodb+srv://user:pass@cluster0.nmw9phs.mongodb.net/cold_storage?appName=Cluster0';
    delete process.env.MONGODB_TEST_URI;
    try {
      const uri = stockSuiteUri();
      expect(uri).toContain('cold_storage_stock_test');
      expect(uri).not.toMatch(/\/cold_storage(\?|$)/);
      expect(() => assertSafeDatabaseTarget(uri)).not.toThrow();
    } finally {
      if (previousTestUri === undefined) delete process.env.MONGODB_TEST_URI;
      else process.env.MONGODB_TEST_URI = previousTestUri;
      if (previousUri === undefined) delete process.env.MONGODB_URI;
      else process.env.MONGODB_URI = previousUri;
    }
  });
});
