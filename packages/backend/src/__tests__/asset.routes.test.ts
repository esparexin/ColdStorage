import mongoose from 'mongoose';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AssetModel } from '../database/models/asset.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import {
  createTestAssetDoc,
  mockFetchImageResponse,
  seedAssetTestTokens,
  seedDefaultSystemSettings,
  setupCloudinaryMocks,
  validJpegBuffer,
  validPngBuffer,
  validWebpBuffer,
} from './helpers/asset-test-fixtures.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('Brand Asset & Logo Management Routes & Security Tests', () => {
  let superAdminToken: string;
  let adminToken: string;
  let operatorToken: string;

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    config.cloudinaryUrl = 'cloudinary://test_key:test_secret@test_cloud';
    await connectToDatabase();

    const tokens = await seedAssetTestTokens(seed);
    superAdminToken = tokens.superAdminToken;
    adminToken = tokens.adminToken;
    operatorToken = tokens.operatorToken;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await AssetModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});

    await seedDefaultSystemSettings();
    setupCloudinaryMocks();
  });

  describe('RBAC & Authentication for Logo Management', () => {
    it('1. rejects unauthenticated POST /api/settings/logo with 401', async () => {
      const res = await request(app).post('/api/settings/logo').attach('file', validPngBuffer, 'logo.png');
      expect(res.status).toBe(401);
    });

    it('2. rejects ADMIN role on POST /api/settings/logo with 403', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', validPngBuffer, 'logo.png');
      expect(res.status).toBe(403);
    });

    it('3. rejects OPERATOR role on POST /api/settings/logo with 403', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${operatorToken}`)
        .attach('file', validPngBuffer, 'logo.png');
      expect(res.status).toBe(403);
    });

    it('4. rejects non-SUPER_ADMIN on DELETE /api/settings/logo with 403', async () => {
      const res = await request(app).delete('/api/settings/logo').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('File Validation & Security Guardrails', () => {
    it('5. rejects request when no file is attached', async () => {
      const res = await request(app).post('/api/settings/logo').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('No image file uploaded');
    });

    it('6. rejects SVG file upload (XSS prevention)', async () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', svgBuffer, 'vector.svg');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/INVALID_FILE_EXTENSION|UNSUPPORTED_FORMAT/);
    });

    it('7. rejects spoofed PNG file containing text content', async () => {
      const fakePngBuffer = Buffer.from('This is a text file renamed to fake.png');
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', fakePngBuffer, 'fake.png');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('UNSUPPORTED_FORMAT');
    });

    it('8. rejects file exceeding 1 MB limit', async () => {
      const largeBuffer = Buffer.concat([validPngBuffer, Buffer.alloc(1024 * 1024 + 100)]);
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', largeBuffer, 'huge.png');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/1 MB limit/i);
    });
  });

  describe('Logo Upload, Replacement & Removal Flows', () => {
    it('9. uploads valid PNG, stores AssetModel, updates SystemSettings.logoAssetId and writes audit log', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validPngBuffer, 'brand_logo.png');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.asset.id).toBeDefined();
      expect(res.body.asset.mimeType).toBe('image/png');

      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBe(res.body.asset.id);

      const assetInDb = await AssetModel.findOne({ id: res.body.asset.id });
      expect(assetInDb).toBeDefined();
      expect(assetInDb?.uploadedBy).toBe('usr-super-admin');

      const auditLog = await mongoose.connection.collection('auditlogs').findOne({
        eventType: 'SETTINGS_UPDATED',
        resourceId: 'SYSTEM_SETTINGS',
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.details.action).toBe('LOGO_UPLOADED');
      expect(auditLog?.details.assetId).toBe(res.body.asset.id);
    });

    it('10. replaces existing logo and cleans up previous asset from Cloudinary and DB', async () => {
      const destroySpy = vi.spyOn(cloudinary.uploader, 'destroy');

      const res1 = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validPngBuffer, 'first.png');
      expect(res1.status).toBe(200);
      const firstAssetId = res1.body.asset.id;

      const res2 = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validJpegBuffer, 'second.jpg');
      expect(res2.status).toBe(200);
      const secondAssetId = res2.body.asset.id;
      expect(secondAssetId).not.toBe(firstAssetId);

      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBe(secondAssetId);

      const oldDoc = await AssetModel.findOne({ id: firstAssetId });
      expect(oldDoc).toBeNull();
      expect(destroySpy).toHaveBeenCalled();
    });

    it('10b. uploads valid WebP image format successfully', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validWebpBuffer, 'logo.webp');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.asset.mimeType).toBe('image/webp');
    });

    it('11. removes logo via DELETE /api/settings/logo, destroys Cloudinary asset and clears logoAssetId', async () => {
      await createTestAssetDoc('ast_existing_logo', 2048, 150, 50);
      await SystemSettingsModel.updateOne(
        { _id: 'SYSTEM_SETTINGS' },
        { $set: { logoAssetId: 'ast_existing_logo' } },
      );

      const res = await request(app).delete('/api/settings/logo').set('Authorization', `Bearer ${superAdminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBeNull();

      const assetInDb = await AssetModel.findOne({ id: 'ast_existing_logo' });
      expect(assetInDb).toBeNull();

      const auditLog = await mongoose.connection.collection('auditlogs').findOne({
        'details.action': 'LOGO_REMOVED',
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.details.assetId).toBe('ast_existing_logo');
    });
  });

  describe('Same-Origin Asset Resolver (GET /api/assets/:assetId)', () => {
    it('12. rejects invalid assetId format with 400', async () => {
      const res = await request(app).get('/api/assets/invalid@symbol!param');
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid asset ID format');
    });

    it('13. returns 404 for nonexistent asset ID', async () => {
      const res = await request(app).get('/api/assets/ast_nonexistent_123');
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('14. streams image data with same-origin headers and CSP compliance without redirecting', async () => {
      await createTestAssetDoc('ast_resolver_test', validPngBuffer.length, 1, 1);
      mockFetchImageResponse(validPngBuffer);

      const res = await request(app).get('/api/assets/ast_resolver_test');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=86400, immutable');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'");
      expect(res.body).toEqual(validPngBuffer);
    });
  });
});
