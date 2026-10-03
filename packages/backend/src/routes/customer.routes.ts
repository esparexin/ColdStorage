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

  // The customer is registered for a single facility; it must be inside the caller's scope.
  if (req.user!.role !== 'SUPER_ADMIN' && !req.user!.facilityIds.includes(parseResult.data.facilityId)) {
    res.status(403).json({
      error: `Access denied: User is not authorized to register customer for facility '${parseResult.data.facilityId}'`,
    });
    return;
  }

  try {
    const { facilityId, ...customerInput } = parseResult.data;
    const customer = await customerService.createCustomer(customerInput, [facilityId]);
    res.status(201).json({ customer });
  } catch (err: unknown) {
      sendServiceError(res, err, 'Customer creation failed');
  }
});

customerRouter.get('/', requirePermission('customer:view'), async (req: Request, res: Response): Promise<void> => {
  try {
    const facilityId = typeof req.query.facilityId === 'string' ? req.query.facilityId : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const isSuperAdmin = req.user!.role === 'SUPER_ADMIN';

    const customers = await customerService.listCustomers(
      facilityId,
      req.user!.facilityIds,
      isSuperAdmin,
      search,
    );
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
      }

      const updated = await customerService.updateCustomer(customerId, parseResult.data);
      res.status(200).json({ customer: updated });
    } catch (err: unknown) {
      sendServiceError(res, err, 'Customer update failed');
    }
  },
);
