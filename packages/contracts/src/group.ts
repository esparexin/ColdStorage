import { z } from 'zod';

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'Group name is required')
  .max(50, 'Group name cannot exceed 50 characters');

export const groupRemarksSchema = z
  .string()
  .trim()
  .max(500, 'Remarks cannot exceed 500 characters')
  .nullish();

export const groupStockSummarySchema = z.object({
  totalBags: z.number().int().min(0),
  smallBags: z.number().int().min(0),
  bigBags: z.number().int().min(0),
});

export const groupSchema = z.object({
  id: z.string().min(1),
  facilityId: z.string().min(1),
  name: groupNameSchema,
  remarks: z.string().nullable().optional(),
  customerId: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  grnCount: z.number().int().min(0).default(0),
  stockSummary: groupStockSummarySchema.optional(),
  createdBy: z.string().min(1),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createGroupSchema = z
  .object({
    name: groupNameSchema,
    remarks: groupRemarksSchema,
    customerId: z.string().trim().min(1).nullish(),
  })
  .strict();

export const updateGroupSchema = z
  .object({
    name: groupNameSchema.optional(),
    remarks: groupRemarksSchema,
  })
  .strict();

export const assignGrnsSchema = z
  .object({
    grnIds: z.array(z.string().trim().min(1)).min(1, 'At least one GRN must be selected'),
  })
  .strict();

export const unassignGrnsSchema = z
  .object({
    grnIds: z.array(z.string().trim().min(1)).min(1, 'At least one GRN must be selected'),
  })
  .strict();

export const moveGrnsSchema = z
  .object({
    targetGroupId: z.string().trim().min(1, 'Target group ID is required'),
    grnIds: z.array(z.string().trim().min(1)).min(1, 'At least one GRN must be selected'),
  })
  .strict();

export const groupQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(50).optional(),
  customerId: z.string().trim().optional(),
  sortBy: z.enum(['name', 'createdAt', 'grnCount']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type Group = z.infer<typeof groupSchema>;
export type GroupStockSummary = z.infer<typeof groupStockSummarySchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AssignGrnsInput = z.infer<typeof assignGrnsSchema>;
export type UnassignGrnsInput = z.infer<typeof unassignGrnsSchema>;
export type MoveGrnsInput = z.infer<typeof moveGrnsSchema>;
export type GroupQuery = z.infer<typeof groupQuerySchema>;
