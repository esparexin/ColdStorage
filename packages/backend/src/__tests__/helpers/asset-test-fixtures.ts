import { Writable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';
import { vi } from 'vitest';
import { AssetModel } from '../../database/models/asset.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { createAuthSeeder } from './auth-fixtures.js';

// Minimal valid PNG buffer
export const validPngBuffer = Buffer.from([
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
export const validJpegBuffer = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
]);

// Valid WebP header buffer
export const validWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20,
  0x14, 0x00, 0x00, 0x00, 0x30, 0x01, 0x00, 0x9d,
]);

export interface AssetTestTokens {
  superAdminToken: string;
  adminToken: string;
  operatorToken: string;
}

export async function seedAssetTestTokens(
  seed: ReturnType<typeof createAuthSeeder>,
): Promise<AssetTestTokens> {
  const { token: superAdminToken } = await seed({
    userId: 'usr-super-admin',
    username: 'super_admin',
    role: 'SUPER_ADMIN',
    facilityIds: [],
    expiresInSeconds: 3600,
  });

  const { token: adminToken } = await seed({
    userId: 'usr-admin',
    username: 'plant_admin',
    role: 'ADMIN',
    facilityIds: ['fac-1'],
    expiresInSeconds: 3600,
  });

  const { token: operatorToken } = await seed({
    userId: 'usr-operator',
    username: 'plant_operator',
    role: 'OPERATOR',
    facilityIds: ['fac-1'],
    expiresInSeconds: 3600,
  });

  return { superAdminToken, adminToken, operatorToken };
}

export async function seedDefaultSystemSettings(): Promise<void> {
  await SystemSettingsModel.create({
    _id: 'SYSTEM_SETTINGS',
    orgName: 'Snowfield Logistics Ltd',
    address: 'Industrial Sector 9',
    contact: '9876543210',
    logoAssetId: null,
  });
}

export async function createTestAssetDoc(id: string, bytes = 2048, width = 150, height = 50): Promise<void> {
  await AssetModel.create({
    id,
    publicId: `cold_storage/branding/${id}`,
    secureUrl: `https://res.cloudinary.com/test_cloud/image/upload/v1/${id}.png`,
    mimeType: 'image/png',
    format: 'png',
    bytes,
    width,
    height,
    uploadedBy: 'usr-super-admin',
  });
}

export function mockFetchImageResponse(buffer: Buffer): void {
  vi.spyOn(global, 'fetch').mockImplementation(async () => {
    return new Response(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': buffer.length.toString(),
      },
    });
  });
}

export function setupCloudinaryMocks(): void {
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
}
