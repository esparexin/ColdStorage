import { z } from 'zod';
import { indianGstinSchema, indianMobileSchema } from './common.js';

export const customerSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(150),
  mobile: indianMobileSchema,
  address: z.string().trim().max(300).nullable().optional(),
  gstin: indianGstinSchema.nullable().optional(),
  facilityIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});

export const createCustomerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  mobile: indianMobileSchema,
  address: z.string().trim().max(300).nullable().optional(),
  gstin: indianGstinSchema.nullable().optional(),
  facilityIds: z.array(z.string().min(1)).min(1),
  isActive: z.boolean().default(true),
});

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  mobile: indianMobileSchema.optional(),
  address: z.string().trim().max(300).nullable().optional(),
  gstin: indianGstinSchema.nullable().optional(),
  facilityIds: z.array(z.string().min(1)).min(1).optional(),
  isActive: z.boolean().optional(),
});

export type Customer = z.infer<typeof customerSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
