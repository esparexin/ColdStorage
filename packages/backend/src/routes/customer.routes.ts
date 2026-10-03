import { Router, type Request, type Response } from 'express';
import { createCustomerSchema, updateCustomerSchema } from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { customerService } from '../modules/customers/customer.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const customerRouter = Router();

customerRouter.use(authenticate);
customerRouter.use(requirePasswordChanged);

customerRouter.post('/', requirePermission('customer:manage'), async (req: Request, res: Response): Promise<void> => {
  const parseResult = createCustomerSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
    return;
  }

  // If caller is not SUPER_ADMIN, they can only register customers for their assigned facilities
  if (req.user!.role !== 'SUPER_ADMIN') {
    const unauthorizedFacility = parseResult.data.facilityIds.find((fid) => !req.user!.facilityIds.includes(fid));
    if (unauthorizedFacility) {
      res.status(403).json({
        error: `Access denied: User is not authorized to register customer for facility '${unauthorizedFacility}'`,
      });
      return;
    }
  }

  try {
    const customer = await customerService.createCustomer(parseResult.data);
    res.status(201).json({ customer });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Customer creation failed');
  }
});

customerRouter.get('/', requirePermission('customer:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const facilityId = typeof req.query.facilityId === 'string' ? req.query.facilityId : undefined;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const customers = await customerService.listCustomers(facilityId, req.user!.facilityIds, isSuperAdmin);
    res.status(200).json({ items: customers, total: customers.length });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to list customers');
  }
});

customerRouter.get(
  '/:customerId',
  requirePermission('customer:view'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const customerId = getParamId(req.params.customerId);
      const customer = await customerService.getCustomerById(customerId);
      if (!customer) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      // Verify caller is authorized for at least one facility the customer is associated with
      if (req.user!.role !== 'SUPER_ADMIN') {
        const hasAccess = customer.facilityIds.some((fid) => req.user!.facilityIds.includes(fid));
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied: Customer does not belong to your assigned facilities' });
          return;
        }
      }

      res.status(200).json({ customer });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Failed to get customer');
    }
  },
);

customerRouter.patch(
  '/:customerId',
  requirePermission('customer:manage'),
  async (req: Request, res: Response): Promise<void> => {
    const parseResult = updateCustomerSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.flatten() });
      return;
    }

    try {
      const customerId = getParamId(req.params.customerId);
      const existing = await customerService.getCustomerById(customerId);
      if (!existing) {
        res.status(404).json({ error: 'Customer not found' });
        return;
      }

      if (req.user!.role !== 'SUPER_ADMIN') {
        const hasAccess = existing.facilityIds.some((fid) => req.user!.facilityIds.includes(fid));
        if (!hasAccess) {
          res.status(403).json({ error: 'Access denied: Customer does not belong to your assigned facilities' });
          return;
        }
        if (parseResult.data.facilityIds) {
          const unauthorizedFacility = parseResult.data.facilityIds.find(
            (fid) => !req.user!.facilityIds.includes(fid),
          );
          if (unauthorizedFacility) {
            res.status(403).json({
              error: `Access denied: User is not authorized to associate facility '${unauthorizedFacility}'`,
            });
            return;
          }
        }
      }

      const updated = await customerService.updateCustomer(customerId, parseResult.data);
      res.status(200).json({ customer: updated });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Customer update failed');
    }
  },
);
