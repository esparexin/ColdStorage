import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import request from 'supertest';
import { v2 as cloudinary } from 'cloudinary';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { connectToDatabase, disconnectDatabase } from '../database/connection.js';
import { AssetModel } from '../database/models/asset.model.js';
import { SystemSettingsModel } from '../database/models/system-settings.model.js';
import { createAuthSeeder } from './helpers/auth-fixtures.js';

const app = createApp();

describe('Brand Asset & Logo Management Routes & Security Tests', () => {
  let superAdminToken: string;
  let adminToken: string;
  let operatorToken: string;

  // Minimal valid PNG buffer
  const validPngBuffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
    0x42, 0x60, 0x82,
  ]);

  // Valid JPEG header buffer
  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
  ]);

  // Valid WebP header buffer
  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
    0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
    0x14, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
  ]);

  const seed = createAuthSeeder(config.jwtSecret);

  beforeAll(async () => {
    config.cloudinaryUrl = 'cloudinary://test_key:test_secret@test_cloud';
    await connectToDatabase();

    ({ token: superAdminToken } = await seed({
      userId: 'usr-super-admin',
      username: 'super_admin',
      role: 'SUPER_ADMIN',
      facilityIds: [],
      expiresInSeconds: 3600,
    }));

    ({ token: adminToken } = await seed({
      userId: 'usr-admin',
      username: 'plant_admin',
      role: 'ADMIN',
      facilityIds: ['fac-1'],
      expiresInSeconds: 3600,
    }));

    ({ token: operatorToken } = await seed({
      userId: 'usr-operator',
      username: 'plant_operator',
      role: 'OPERATOR',
      facilityIds: ['fac-1'],
      expiresInSeconds: 3600,
    }));
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await AssetModel.deleteMany({});
    await SystemSettingsModel.deleteMany({});
    await mongoose.connection.collection('auditlogs').deleteMany({});

    // Seed default system settings
    await SystemSettingsModel.create({
      _id: 'SYSTEM_SETTINGS',
      orgName: 'Snowfield Logistics Ltd',
      address: 'Industrial Sector 9',
      contact: '9876543210',
      logoAssetId: null,
    });

    // Mock Cloudinary uploader
    vi.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((...args: unknown[]) => {
      const options = (args[0] ?? {}) as Record<string, unknown>;
      const callback = (args.length > 1 ? args[1] : undefined) as
        | ((error?: unknown, result?: unknown) => void)
        | undefined;

      const stream = new Writable({
        write(_chunk, _encoding, next) {
          next();
        },
        final(next) {
          if (callback) {
            callback(undefined, {
              public_id: (options.public_id as string) || 'test_pub_123',
              secure_url: `https://res.cloudinary.com/test_cloud/image/upload/v1/${(options.public_id as string) || 'test_pub_123'}.png`,
              format: 'png',
              bytes: 1024,
              width: 120,
              height: 40,
              resource_type: 'image',
            });
          }
          next();
        },
      });
      return stream as unknown as ReturnType<typeof cloudinary.uploader.upload_stream>;
    });

    vi.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' });
  });

  describe('RBAC & Authentication for Logo Management', () => {
    it('1. rejects unauthenticated POST /api/settings/logo with 401', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .attach('file', validPngBuffer, 'logo.png');

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
      const res = await request(app)
        .delete('/api/settings/logo')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('File Validation & Security Guardrails', () => {
    it('5. rejects request when no file is attached', async () => {
      const res = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`);

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
      const largeBuffer = Buffer.concat([
        validPngBuffer,
        Buffer.alloc(1024 * 1024 + 100), // > 1 MB
      ]);

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

      // Verify SystemSettings singleton update
      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBe(res.body.asset.id);

      // Verify AssetModel in database
      const assetInDb = await AssetModel.findOne({ id: res.body.asset.id });
      expect(assetInDb).toBeDefined();
      expect(assetInDb?.uploadedBy).toBe('usr-super-admin');

      // Verify Audit log entry
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

      // First upload
      const res1 = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validPngBuffer, 'first.png');

      expect(res1.status).toBe(200);
      const firstAssetId = res1.body.asset.id;

      // Second upload with JPEG
      const res2 = await request(app)
        .post('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validJpegBuffer, 'second.jpg');

      expect(res2.status).toBe(200);
      const secondAssetId = res2.body.asset.id;
      expect(secondAssetId).not.toBe(firstAssetId);

      // Verify SystemSettings updated to secondAssetId
      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBe(secondAssetId);

      // Verify previous asset record was deleted from MongoDB
      const oldDoc = await AssetModel.findOne({ id: firstAssetId });
      expect(oldDoc).toBeNull();

      // Verify destroy was called on old asset
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
      // Seed initial asset
      await AssetModel.create({
        id: 'ast_existing_logo',
        publicId: 'cold_storage/branding/ast_existing_logo',
        secureUrl: 'https://res.cloudinary.com/test_cloud/image/upload/v1/ast_existing_logo.png',
        mimeType: 'image/png',
        format: 'png',
        bytes: 2048,
        width: 150,
        height: 50,
        uploadedBy: 'usr-super-admin',
      });

      await SystemSettingsModel.updateOne(
        { _id: 'SYSTEM_SETTINGS' },
        { $set: { logoAssetId: 'ast_existing_logo' } },
      );

      const res = await request(app)
        .delete('/api/settings/logo')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify SystemSettings logoAssetId cleared to null
      const settings = await SystemSettingsModel.findById('SYSTEM_SETTINGS');
      expect(settings?.logoAssetId).toBeNull();

      // Verify Asset record removed from DB
      const assetInDb = await AssetModel.findOne({ id: 'ast_existing_logo' });
      expect(assetInDb).toBeNull();

      // Verify Audit log recorded LOGO_REMOVED
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
      // Seed asset
      await AssetModel.create({
        id: 'ast_resolver_test',
        publicId: 'cold_storage/branding/ast_resolver_test',
        secureUrl: 'https://res.cloudinary.com/test_cloud/image/upload/v1/ast_resolver_test.png',
        mimeType: 'image/png',
        format: 'png',
        bytes: validPngBuffer.length,
        width: 1,
        height: 1,
        uploadedBy: 'usr-super-admin',
      });

      // Mock fetch
      vi.spyOn(global, 'fetch').mockImplementation(async () => {
        return new Response(validPngBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/png',
            'Content-Length': validPngBuffer.length.toString(),
          },
        });
      });

      const res = await request(app).get('/api/assets/ast_resolver_test');

      expect(res.status).toBe(200);
      // Confirmed no redirect (HTTP 200 directly)
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['cache-control']).toBe('public, max-age=86400, immutable');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'");
      expect(res.body).toEqual(validPngBuffer);
    });
  });
});
