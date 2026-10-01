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

// Input schemas for Facility
export const createFacilitySchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(30),
  address: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateFacilitySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().min(1).max(30).optional(),
  address: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Input schemas for Chamber
export const createChamberSchema = z.object({
  chamberNumber: z.string().trim().min(1).max(40),
  name: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateChamberSchema = z.object({
  chamberNumber: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Input schemas for Rack
export const createRackSchema = z.object({
  code: z.string().trim().min(1).max(30),
  isActive: z.boolean().default(true),
});

export const updateRackSchema = z.object({
  code: z.string().trim().min(1).max(30).optional(),
  isActive: z.boolean().optional(),
});

// Input schemas for Level
export const createLevelSchema = z.object({
  levelNumber: z.number().int().min(1),
  code: z.string().trim().min(1).max(30),
  isActive: z.boolean().default(true),
});

export const updateLevelSchema = z.object({
  levelNumber: z.number().int().min(1).optional(),
  code: z.string().trim().min(1).max(30).optional(),
  isActive: z.boolean().optional(),
});

// Input schemas for Position
export const createPositionSchema = z.object({
  code: z.string().trim().min(1).max(30),
  capacityBags: z.number().int().positive(),
  isActive: z.boolean().default(true),
});

export const updatePositionSchema = z.object({
  code: z.string().trim().min(1).max(30).optional(),
  capacityBags: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;
export type CreateChamberInput = z.infer<typeof createChamberSchema>;
export type UpdateChamberInput = z.infer<typeof updateChamberSchema>;
export type CreateRackInput = z.infer<typeof createRackSchema>;
export type UpdateRackInput = z.infer<typeof updateRackSchema>;
export type CreateLevelInput = z.infer<typeof createLevelSchema>;
export type UpdateLevelInput = z.infer<typeof updateLevelSchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
