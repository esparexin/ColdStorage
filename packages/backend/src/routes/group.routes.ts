import { Router, type Request, type Response } from 'express';
import {
  assignGrnsSchema,
  createGroupSchema,
  groupQuerySchema,
  moveGrnsSchema,
  unassignGrnsSchema,
  updateGroupSchema,
} from '@cold-storage/contracts';
import { authenticate, requirePasswordChanged } from '../middleware/auth.middleware.js';
import { requireFacilityScope } from '../middleware/facility.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { groupService } from '../modules/groups/group.service.js';
import { sendServiceError } from '../utils/http-error.js';
import { getParamId } from '../utils/params.js';

export const groupRouter = Router();

groupRouter.use(authenticate);
groupRouter.use(requirePasswordChanged);

const scope = requireFacilityScope((req) => getParamId(req.params.facilityId));

function handleRouteError(res: Response, err: unknown, fallback: string): void {
  const msg = err instanceof Error ? err.message : fallback;
  const isConflict =
    msg.includes('already exists') ||
    msg.includes('already assigned') ||
    msg.includes('Cannot delete group') ||
    (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000);

  if (isConflict) {
    res.status(409).json({ error: msg });
    return;
  }
  if (msg.includes('not found')) {
    res.status(404).json({ error: msg });
    return;
  }
  sendServiceError(res, err, fallback);
}

// Create Group
groupRouter.post('/facilities/:facilityId/groups', requirePermission('group:manage'), scope, async (req: Request, res: Response) => {
  const parse = createGroupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  try {
    const group = await groupService.createGroup(getParamId(req.params.facilityId), parse.data, req.user!.userId);
    res.status(201).json({ group });
  } catch (err: unknown) {
    handleRouteError(res, err, 'Group creation failed');
  }
});

// List Groups
groupRouter.get('/facilities/:facilityId/groups', requirePermission('group:view'), scope, async (req: Request, res: Response) => {
  const parse = groupQuerySchema.safeParse(req.query);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parse.error.flatten() });
    return;
  }
  try {
    const result = await groupService.listGroups(getParamId(req.params.facilityId), parse.data);
    res.status(200).json(result);
  } catch (err: unknown) {
    sendServiceError(res, err, 'Failed to list groups');
  }
});

// List Eligible Unassigned GRNs
groupRouter.get('/facilities/:facilityId/groups/eligible-grns', requirePermission('group:view'), scope, async (req: Request, res: Response) => {
  try {
    const facilityId = getParamId(req.params.facilityId);
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
    const commodityId = typeof req.query.commodityId === 'string' ? req.query.commodityId : undefined;
    const page = typeof req.query.page === 'string' ? Number.parseInt(req.query.page, 10) : 1;
    const limit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 20;

    const result = await groupService.listEligibleGrns(facilityId, { search, customerId, commodityId, page, limit });
    res.status(200).json(result);
  } catch (err: unknown) {
    sendServiceError(res, err, 'Failed to list eligible GRNs');
  }
});

// Get Group Details
groupRouter.get('/facilities/:facilityId/groups/:groupId', requirePermission('group:view'), scope, async (req: Request, res: Response) => {
  try {
    const result = await groupService.getGroupById(getParamId(req.params.facilityId), getParamId(req.params.groupId));
    if (!result) {
      res.status(404).json({ error: 'Group not found' });
      return;
    }
    res.status(200).json(result);
  } catch (err: unknown) {
    sendServiceError(res, err, 'Failed to get group');
  }
});

// Update / Rename Group
groupRouter.patch('/facilities/:facilityId/groups/:groupId', requirePermission('group:manage'), scope, async (req: Request, res: Response) => {
  const parse = updateGroupSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  try {
    const group = await groupService.updateGroup(getParamId(req.params.facilityId), getParamId(req.params.groupId), parse.data, req.user!.userId);
    res.status(200).json({ group });
  } catch (err: unknown) {
    handleRouteError(res, err, 'Group update failed');
  }
});

// Delete Group
groupRouter.delete('/facilities/:facilityId/groups/:groupId', requirePermission('group:delete'), scope, async (req: Request, res: Response) => {
  try {
    const groupId = getParamId(req.params.groupId);
    await groupService.deleteGroup(getParamId(req.params.facilityId), groupId, req.user!.userId);
    res.status(200).json({ deleted: true, id: groupId });
  } catch (err: unknown) {
    handleRouteError(res, err, 'Group deletion failed');
  }
});

// Assign GRNs
groupRouter.post('/facilities/:facilityId/groups/:groupId/grns', requirePermission('group:manage'), scope, async (req: Request, res: Response) => {
  const parse = assignGrnsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  try {
    const result = await groupService.assignGrns(getParamId(req.params.facilityId), getParamId(req.params.groupId), parse.data, req.user!.userId);
    res.status(200).json(result);
  } catch (err: unknown) {
    handleRouteError(res, err, 'Assigning GRNs failed');
  }
});

// Unassign GRNs
groupRouter.delete('/facilities/:facilityId/groups/:groupId/grns', requirePermission('group:manage'), scope, async (req: Request, res: Response) => {
  const parse = unassignGrnsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  try {
    const result = await groupService.unassignGrns(getParamId(req.params.facilityId), getParamId(req.params.groupId), parse.data, req.user!.userId);
    res.status(200).json(result);
  } catch (err: unknown) {
    sendServiceError(res, err, 'Unassigning GRNs failed');
  }
});

// Move GRNs
groupRouter.post('/facilities/:facilityId/groups/:groupId/move', requirePermission('group:manage'), scope, async (req: Request, res: Response) => {
  const parse = moveGrnsSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }
  try {
    const result = await groupService.moveGrns(getParamId(req.params.facilityId), getParamId(req.params.groupId), parse.data, req.user!.userId);
    res.status(200).json(result);
  } catch (err: unknown) {
    sendServiceError(res, err, 'Moving GRNs failed');
  }
});
