import crypto from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { config } from '../../config.js';
import { AssetModel, type AssetDoc } from '../../database/models/asset.model.js';
import { SystemSettingsModel } from '../../database/models/system-settings.model.js';
import { auditService } from '../audit/audit.service.js';
import { settingsService } from '../settings/settings.service.js';

import {
  detectAndValidateImageFormat,
  type DetectedImage,
} from './asset-validator.helper.js';

export { detectAndValidateImageFormat, type DetectedImage };

export class AssetService {
  /**
   * Uploads and binds organization logo:
   * 1. Validates magic bytes and 1MB size limit.
   * 2. Uploads to Cloudinary folder 'cold_storage/branding'.
   * 3. Stores metadata in AssetModel.
   * 4. Updates SystemSettings.logoAssetId singleton.
   * 5. Emits SETTINGS_UPDATED audit log.
   * 6. Cleans up previous logo asset if replaced.
   * 7. Rolls back Cloudinary upload if DB update fails.
   */
  public async uploadLogo(
    buffer: Buffer,
    originalname: string,
    uploadedBy: string,
  ): Promise<AssetDoc> {
    const maxSizeBytes = 1 * 1024 * 1024; // 1 MB
    if (buffer.length > maxSizeBytes) {
      throw new Error('LOGO_TOO_LARGE: Logo file size exceeds 1 MB limit');
    }

    const detected = detectAndValidateImageFormat(buffer, originalname);

    if (!config.cloudinaryUrl) {
      throw new Error(
        'CLOUDINARY_NOT_CONFIGURED: CLOUDINARY_URL environment variable is required for asset uploads',
      );
    }

    cloudinary.config({
      cloudinary_url: config.cloudinaryUrl,
    });

    const assetId = `ast_${crypto.randomUUID().replace(/-/g, '')}`;

    // Upload to Cloudinary via stream
    const uploadResult = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'cold_storage/branding',
          public_id: assetId,
          resource_type: 'image',
          overwrite: false,
        },
        (error, result) => {
          if (error || !result) {
            reject(error || new Error('Upload to Cloudinary failed'));
          } else {
            resolve(result);
          }
        },
      );
      uploadStream.end(buffer);
    });

    try {
      // Create asset record
      const assetDoc = await AssetModel.create({
        id: assetId,
        publicId: uploadResult.public_id,
        secureUrl: uploadResult.secure_url,
        mimeType: detected.mimeType,
        format: uploadResult.format || detected.format,
        bytes: uploadResult.bytes || buffer.length,
        width: uploadResult.width || 0,
        height: uploadResult.height || 0,
        uploadedBy,
      });

      // Capture previous logo ID before updating
      const currentSettings = await settingsService.ensureInitialized();
      const oldAssetId = currentSettings.logoAssetId;

      // Update SystemSettings singleton
      await SystemSettingsModel.updateOne(
        { _id: 'SYSTEM_SETTINGS' },
        { $set: { logoAssetId: assetId } },
      );

      // Audit log event
      await auditService.log({
        eventType: 'SETTINGS_UPDATED',
        severity: 'INFO',
        userId: uploadedBy,
        facilityId: null,
        resource: 'settings',
        resourceId: 'SYSTEM_SETTINGS',
        details: {
          action: 'LOGO_UPLOADED',
          assetId,
          publicId: uploadResult.public_id,
          bytes: uploadResult.bytes || buffer.length,
          format: uploadResult.format || detected.format,
        },
      });

      // Asynchronously clean up old asset if it exists
      if (oldAssetId && oldAssetId !== assetId) {
        try {
          const oldAsset = await AssetModel.findOne({ id: oldAssetId });
          if (oldAsset) {
            await cloudinary.uploader.destroy(oldAsset.publicId, { resource_type: 'image' });
            await AssetModel.deleteOne({ id: oldAssetId });
          }
        } catch (cleanupErr) {
          // Non-fatal warning
          console.warn('Failed to clean up superseded logo asset:', cleanupErr);
        }
      }

      return assetDoc;
    } catch (dbErr) {
      // Rollback newly uploaded Cloudinary image to prevent orphans
      try {
        await cloudinary.uploader.destroy(uploadResult.public_id, { resource_type: 'image' });
      } catch (destroyErr) {
        console.error('Failed to destroy Cloudinary image during upload rollback:', destroyErr);
      }
      throw dbErr;
    }
  }

  /**
   * Removes current logo asset:
   * 1. Clears SystemSettings.logoAssetId singleton to null.
   * 2. Destroys image in Cloudinary.
   * 3. Deletes asset record from MongoDB.
   * 4. Emits SETTINGS_UPDATED audit log.
   */
  public async removeLogo(userId?: string): Promise<void> {
    const settings = await settingsService.ensureInitialized();
    const currentAssetId = settings.logoAssetId;
    if (!currentAssetId) {
      return;
    }

    const assetDoc = await AssetModel.findOne({ id: currentAssetId });
    if (assetDoc) {
      if (config.cloudinaryUrl) {
        cloudinary.config({ cloudinary_url: config.cloudinaryUrl });
        try {
          await cloudinary.uploader.destroy(assetDoc.publicId, { resource_type: 'image' });
        } catch (destroyErr) {
          console.warn('Failed to destroy Cloudinary image during logo removal:', destroyErr);
        }
      }
      await AssetModel.deleteOne({ id: currentAssetId });
    }

    await SystemSettingsModel.updateOne(
      { _id: 'SYSTEM_SETTINGS' },
      { $set: { logoAssetId: null } },
    );

    await auditService.log({
      eventType: 'SETTINGS_UPDATED',
      severity: 'INFO',
      userId,
      facilityId: null,
      resource: 'settings',
      resourceId: 'SYSTEM_SETTINGS',
      details: {
        action: 'LOGO_REMOVED',
        assetId: currentAssetId,
      },
    });
  }

  /**
   * Retrieves asset document by id.
   */
  public async getAssetById(assetId: string): Promise<AssetDoc | null> {
    if (!assetId || !/^[a-zA-Z0-9_-]{1,128}$/.test(assetId)) {
      return null;
    }
    return AssetModel.findOne({ id: assetId }).exec();
  }
}

export const assetService = new AssetService();
