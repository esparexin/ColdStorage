import { z } from 'zod';

export const rateLimitTierSchema = z.enum(['TIER_1_AUTH', 'TIER_2_MUTATIONS', 'TIER_3_GENERAL']);
export type RateLimitTier = z.infer<typeof rateLimitTierSchema>;

export const rateLimitErrorResponseSchema = z.object({
  error: z.string(),
  retryAfterSeconds: z.number().int().min(0),
});
export type RateLimitErrorResponse = z.infer<typeof rateLimitErrorResponseSchema>;

export const rateLimitTierConfigSchema = z.object({
  tier: rateLimitTierSchema,
  windowMs: z.number().int().positive(),
  maxRequests: z.number().int().positive(),
});
export type RateLimitTierConfig = z.infer<typeof rateLimitTierConfigSchema>;

export const securityHeadersPolicySchema = z.object({
  contentSecurityPolicy: z.string(),
  xFrameOptions: z.literal('DENY'),
  xContentTypeOptions: z.literal('nosniff'),
  referrerPolicy: z.literal('strict-origin-when-cross-origin'),
  strictTransportSecurity: z.string().optional(),
});
export type SecurityHeadersPolicy = z.infer<typeof securityHeadersPolicySchema>;
