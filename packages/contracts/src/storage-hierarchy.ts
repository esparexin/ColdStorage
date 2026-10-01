import { z } from 'zod';

/**
 * Storage hierarchy contracts (P0-Decision 5).
 * Approved hierarchy: Facility -> Chamber -> Rack -> Level -> Position
 */

export const positionSchema = z.object({
  id: z.string().min(1),
  levelId: z.string().min(1),
  code: z.string().trim().min(1).max(30),
  capacityBags: z.number().int().positive(),
  isActive: z.boolean().default(true),
});

export const levelSchema = z.object({
  id: z.string().min(1),
  rackId: z.string().min(1),
  levelNumber: z.number().int().min(1),
  code: z.string().trim().min(1).max(30),
  isActive: z.boolean().default(true),
});

export const rackSchema = z.object({
  id: z.string().min(1),
  chamberId: z.string().min(1),
  code: z.string().trim().min(1).max(30),
  isActive: z.boolean().default(true),
});

export const chamberSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  chamberNumber: z.string().trim().min(1).max(40),
  name: z.string().trim().max(100).optional(),
  isActive: z.boolean().default(true),
});

export const facilitySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().default(true),
});

export type Position = z.infer<typeof positionSchema>;
export type Level = z.infer<typeof levelSchema>;
export type Rack = z.infer<typeof rackSchema>;
export type Chamber = z.infer<typeof chamberSchema>;
export type Facility = z.infer<typeof facilitySchema>;
