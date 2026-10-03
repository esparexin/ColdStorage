import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { assetService } from '../modules/assets/asset.service.js';

import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const assetRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1 * 1024 * 1024, // 1 MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
    if (!allowedExtensions.includes(ext)) {
      return cb(new Error('INVALID_FILE_EXTENSION: Only .png, .jpg, .jpeg, and .webp files are allowed'));
    }

    const allowedMimes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype.toLowerCase())) {
      return cb(new Error('INVALID_MIME_TYPE: File MIME type must be image/png, image/jpeg, or image/webp'));
    }

    cb(null, true);
  },
});

const uploadSingleLogo = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({ error: 'Logo file size exceeds 1 MB limit' });
          return;
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({ error: "Multipart form field name must be 'file'" });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error) {
        res.status(400).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: 'Failed to process file upload' });
      return;
    }
    next();
  });
};

/**
 * POST /api/settings/logo
 * Restricted to SUPER_ADMIN ('settings:manage' permission).
 * Accepts multipart/form-data with a single image file (PNG, JPEG, WebP <= 1MB).
 */
assetRouter.post(
  '/settings/logo',
  authenticate,
  requirePasswordChanged,
  requirePermission('settings:manage'),
  uploadSingleLogo,
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No image file uploaded' });
      return;
    }

    try {
      const asset = await assetService.uploadLogo(
        req.file.buffer,
        req.file.originalname,
        req.user!.userId,
      );

      res.status(200).json({
        success: true,
        asset: {
          id: asset.id,
          publicId: asset.publicId,
          secureUrl: asset.secureUrl,
          mimeType: asset.mimeType,
          format: asset.format,
          bytes: asset.bytes,
          width: asset.width,
          height: asset.height,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload logo';
      const statusCode =
        message.includes('INVALID_FILE') ||
        message.includes('UNSUPPORTED_FORMAT') ||
        message.includes('LOGO_TOO_LARGE')
          ? 400
          : 500;
      res.status(statusCode).json({ error: message });
    }
  },
);

/**
 * DELETE /api/settings/logo
 * Restricted to SUPER_ADMIN ('settings:manage' permission).
 * Removes currently active organization logo and unbinds from SystemSettings.
 */
assetRouter.delete(
  '/settings/logo',
  authenticate,
  requirePasswordChanged,
  requirePermission('settings:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      await assetService.removeLogo(req.user!.userId);
      res.status(200).json({ success: true, message: 'Logo removed successfully' });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to remove logo');
    }
  },
);

/**
 * GET /api/assets/:assetId
 * Public same-origin resolver for document print and browser display.
 * Strictly complies with CSP img-src 'self' by streaming image data directly without external redirects.
 */
assetRouter.get('/assets/:assetId', async (req: Request, res: Response): Promise<void> => {
  const assetId = getParamId(req.params.assetId);
  if (!assetId || !/^[a-zA-Z0-9_-]{1,128}$/.test(assetId)) {
    res.status(400).json({ error: 'Invalid asset ID format' });
    return;
  }

  try {
    const asset = await assetService.getAssetById(assetId);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found', code: 'NOT_FOUND' });
      return;
    }

    // Stream image content from Cloudinary
    const response = await fetch(asset.secureUrl);
    if (!response.ok) {
      res.status(502).json({ error: 'Failed to retrieve asset from storage' });
      return;
    }

    res.setHeader('Content-Type', asset.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    const arrayBuffer = await response.arrayBuffer();
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to retrieve asset');
  }
});
