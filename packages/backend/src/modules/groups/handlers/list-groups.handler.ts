import type { Group, GroupQuery } from '@cold-storage/contracts';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { readLedgerBalanceMany } from '../../inventory/ledger-balance.js';
import { toGroupEntity } from '../group.mappers.js';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listGroups(
  facilityId: string,
  query: GroupQuery,
): Promise<{ items: Group[]; total: number; page: number; limit: number }> {
  const filter: Record<string, unknown> = { facilityId };

  if (query.customerId) {
    filter.customerId = query.customerId;
  }
  if (query.search && query.search.trim()) {
    filter.name = { $regex: escapeRegExp(query.search.trim()), $options: 'i' };
  }

  const sortField = query.sortBy === 'name' ? 'name' : 'createdAt';
  const sortDir = query.sortDir === 'asc' ? 1 : -1;
  const sort: Record<string, 1 | -1> = { [sortField]: sortDir };

  const page = Math.max(1, query.page || 1);
  const limit = Math.min(100, Math.max(1, query.limit || 20));
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    GroupModel.find(filter).sort(sort).skip(skip).limit(limit).lean().exec(),
    GroupModel.countDocuments(filter).exec(),
  ]);

  const groupIds = docs.map((d) => d.id);
  const memberGrns = await GrnModel.find({ facilityId, groupId: { $in: groupIds } })
    .select('id groupId')
    .lean()
    .exec();

  const memberMap = new Map<string, string[]>();
  for (const gId of groupIds) {
    memberMap.set(gId, []);
  }
  for (const m of memberGrns) {
    if (m.groupId) {
      const list = memberMap.get(m.groupId) || [];
      list.push(m.id);
      memberMap.set(m.groupId, list);
    }
  }

  const allGrnIds = memberGrns.map((m) => m.id);
  const balanceMap = await readLedgerBalanceMany(facilityId, allGrnIds);

  const items = docs.map((doc) => {
    const gGrnIds = memberMap.get(doc.id) || [];
    let totalBags = 0;
    let smallBags = 0;
    let bigBags = 0;

    for (const gId of gGrnIds) {
      const bal = balanceMap.get(gId);
      if (bal) {
        totalBags += bal.total;
        smallBags += bal.smallBags;
        bigBags += bal.bigBags;
      }
    }

    return toGroupEntity(doc, {
      grnCount: gGrnIds.length,
      stockSummary: { totalBags, smallBags, bigBags },
    });
  });

  return { items, total, page, limit };
}
