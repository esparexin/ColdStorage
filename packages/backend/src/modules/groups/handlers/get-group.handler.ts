import type { Grn, Group, GroupStockSummary } from '@cold-storage/contracts';
import { CustomerModel } from '../../../database/models/customer.model.js';
import { GroupModel } from '../../../database/models/group.model.js';
import { GrnModel } from '../../../database/models/grn.model.js';
import { grnService } from '../../grn/grn.service.js';
import { readLedgerBalanceMany } from '../../inventory/ledger-balance.js';
import { toGroupEntity } from '../group.mappers.js';

export async function getGroupById(
  facilityId: string,
  groupId: string,
): Promise<{ group: Group; stockSummary: GroupStockSummary; memberGrns: Grn[] } | null> {
  const doc = await GroupModel.findOne({ id: groupId, facilityId }).lean().exec();
  if (!doc) return null;

  const memberDocs = await GrnModel.find({ facilityId, groupId })
    .sort({ date: -1, createdAt: -1 })
    .lean()
    .exec();

  const grnIds = memberDocs.map((d) => d.id);
  const balanceMap = await readLedgerBalanceMany(facilityId, grnIds);

  let totalBags = 0;
  let smallBags = 0;
  let bigBags = 0;

  for (const gId of grnIds) {
    const bal = balanceMap.get(gId);
    if (bal) {
      totalBags += bal.total;
      smallBags += bal.smallBags;
      bigBags += bal.bigBags;
    }
  }

  let customerName: string | undefined;
  if (doc.customerId) {
    const cust = await CustomerModel.findOne({ id: doc.customerId }).select('name').lean().exec();
    if (cust) customerName = cust.name;
  }

  const stockSummary: GroupStockSummary = { totalBags, smallBags, bigBags };
  const group = toGroupEntity(doc, { grnCount: grnIds.length, stockSummary, customerName });
  const grnResult = await grnService.listGrns(facilityId, { page: 1, limit: 100, groupId });

  return { group, stockSummary, memberGrns: grnResult.items };
}
