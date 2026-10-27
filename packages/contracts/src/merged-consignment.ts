import { z } from 'zod';

export const mergedSourceBillingItemSchema = z.object({
  grnId: z.string().optional(),
  grnNumber: z.string().min(1),
  receiptNumber: z.string().nullable().optional(),
  dateStr: z.string().nullable().optional(),
  seasonYear: z.number().int().optional(),
  customerName: z.string().nullable().optional(),
  bags: z.number().int().min(0),
  rentAmount: z.number().min(0),
  amountPaid: z.number().min(0),
  remainingBalance: z.number().min(0),
  status: z.string().optional(),
});
export type MergedSourceBillingItem = z.infer<typeof mergedSourceBillingItemSchema>;

export const mergedRepackHamaliItemSchema = z.object({
  repackBags: z.number().int().min(0),
  ratePerBag: z.number().min(0),
  amount: z.number().min(0),
});
export type MergedRepackHamaliItem = z.infer<typeof mergedRepackHamaliItemSchema>;

export const mergedRepackedStockSchema = z.object({
  bagType: z.enum(['S/B', 'Hybrid']),
  smallBags: z.number().int().min(0).optional(),
  bigBags: z.number().int().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
});
export type MergedRepackedStock = z.infer<typeof mergedRepackedStockSchema>;

export const mergedConsignmentBreakdownSchema = z.object({
  isMergedTarget: z.boolean(),
  totalMergedAddedBags: z.number().int().min(0),
  repackHamali: mergedRepackHamaliItemSchema.nullable().optional(),
  totalCarriedRent: z.number().min(0).default(0),
  totalSeparateSourceRent: z.number().min(0).default(0),
  sources: z.array(mergedSourceBillingItemSchema).default([]),
  genesisBags: z.number().int().min(0),
  genesisCustomerName: z.string().optional(),
  repackedStock: mergedRepackedStockSchema.nullable().optional(),
  repackedSmallBags: z.number().int().min(0).nullable().optional(),
  repackedBigBags: z.number().int().min(0).nullable().optional(),
  repackedHybridBags: z.number().int().min(0).nullable().optional(),
  repackedBagType: z.enum(['S/B', 'Hybrid']).nullable().optional(),
  repackVariance: z.number().int().optional(),
  repackSourceBags: z.number().int().min(0).optional(),
});
export type MergedConsignmentBreakdown = z.infer<typeof mergedConsignmentBreakdownSchema>;

/**
 * Parses the authoritative structured remark written by merge-grn.handler upon consignment merge.
 * Returns null if the account remarks do not indicate a merged destination consignment.
 */
export function parseMergedConsignmentBreakdown(
  remarks: string | null | undefined,
  totalAccountBags: number,
  customerName: string,
): MergedConsignmentBreakdown | null {
  if (!remarks || !remarks.includes('[MERGE RECEIVED')) {
    return null;
  }

  const addedBagsMatch = remarks.match(/\+(\d+)\s+bags/);
  const totalMergedAddedBags = addedBagsMatch ? parseInt(addedBagsMatch[1], 10) : 0;

  const repackMatch = remarks.match(
    /Repacking Hamali:\s*₹(\d+(?:\.\d+)?)\s*\((\d+)\s*bags\s*@\s*₹(\d+(?:\.\d+)?)\/bag\)/i,
  );
  const repackHamali: MergedRepackHamaliItem | null = repackMatch
    ? {
        amount: parseFloat(repackMatch[1]),
        repackBags: parseInt(repackMatch[2], 10),
        ratePerBag: parseFloat(repackMatch[3]),
      }
    : null;

  const carriedMatch = remarks.match(/(?:Carried pending rent|Additional rent):\s*₹(\d+(?:\.\d+)?)/i);
  const totalCarriedRent = carriedMatch ? parseFloat(carriedMatch[1]) : 0;

  const separateSourceRentMatch = remarks.match(
    /Source pending rent:\s*₹(\d+(?:\.\d+)?)\s*kept as separate pending bills/i,
  );
  const totalSeparateSourceRent = separateSourceRentMatch
    ? parseFloat(separateSourceRentMatch[1])
    : 0;

  const sources: MergedSourceBillingItem[] = [];
  let pos = 0;
  const upperRemarks = remarks.toUpperCase();
  while (pos < remarks.length) {
    const grnIdx = upperRemarks.indexOf('GRN', pos);
    if (grnIdx === -1) break;

    const openParen = remarks.indexOf('(', grnIdx);
    if (openParen === -1) break;

    const grnCandidate = remarks.slice(grnIdx + 3, openParen).trim();
    if (!grnCandidate || !/^[A-Za-z0-9-]+$/.test(grnCandidate)) {
      pos = grnIdx + 3;
      continue;
    }

    const closeParen = remarks.indexOf(')', openParen);
    if (closeParen === -1) break;

    const details = remarks.slice(openParen + 1, closeParen);
    const parts = details.split(',');

    let receiptNumber: string | undefined;
    let dateStr: string | undefined;
    let seasonYear: number | undefined;
    let customerName: string | undefined;
    let status: string | undefined;
    let bags = 0;
    let rentAmount = 0;
    let amountPaid = 0;
    let remainingBalance = 0;
    let hasBags = false;

    for (const rawPart of parts) {
      const part = rawPart.trim();
      const colonIdx = part.indexOf(':');
      const hashIdx = part.indexOf('#');

      if (part.toLowerCase().startsWith('receipt') && hashIdx !== -1) {
        receiptNumber = part.slice(hashIdx + 1).trim() || undefined;
      } else if (colonIdx !== -1) {
        const key = part.slice(0, colonIdx).trim().toLowerCase();
        const rawVal = part.slice(colonIdx + 1).trim();
        const numVal = parseFloat(rawVal.replace(/^[₹\s]+/, '')) || 0;

        if (key === 'date') {
          dateStr = rawVal || undefined;
          seasonYear = dateStr ? parseInt(dateStr.split('-')[0], 10) || undefined : undefined;
        } else if (key === 'customer') {
          customerName = rawVal || undefined;
        } else if (key === 'bags') {
          bags = parseInt(rawVal, 10) || 0;
          hasBags = true;
        } else if (key === 'rent') {
          rentAmount = numVal;
        } else if (key === 'paid') {
          amountPaid = numVal;
        } else if (key === 'balance') {
          remainingBalance = numVal;
        } else if (key === 'status') {
          status = rawVal || undefined;
        }
      }
    }

    if (hasBags) {
      sources.push({
        grnNumber: grnCandidate,
        receiptNumber,
        dateStr,
        seasonYear,
        customerName,
        bags,
        rentAmount,
        amountPaid,
        remainingBalance,
        status,
      });
    }

    pos = closeParen + 1;
  }

  const genesisBags = Math.max(0, totalAccountBags - totalMergedAddedBags);

  const repackedSbMatch = remarks.match(/Repacked:\s*(\d+)\s*S\s*\+\s*(\d+)\s*B/i);
  const repackedHybridMatch = remarks.match(/Confirmed Hybrid:\s*(\d+)\s*bags/i);

  let repackedSmallBags: number | null = null;
  let repackedBigBags: number | null = null;
  let repackedHybridBags: number | null = null;
  let repackedBagType: 'S/B' | 'Hybrid' | null = null;
  let repackedStock: MergedRepackedStock | null = null;

  if (repackedSbMatch) {
    repackedSmallBags = parseInt(repackedSbMatch[1], 10);
    repackedBigBags = parseInt(repackedSbMatch[2], 10);
    repackedBagType = 'S/B';
    repackedStock = {
      bagType: 'S/B',
      smallBags: repackedSmallBags,
      bigBags: repackedBigBags,
      quantity: repackedSmallBags + repackedBigBags,
    };
  } else if (repackedHybridMatch) {
    repackedHybridBags = parseInt(repackedHybridMatch[1], 10);
    repackedBagType = 'Hybrid';
    repackedStock = {
      bagType: 'Hybrid',
      quantity: repackedHybridBags,
    };
  }

  const varianceMatch = remarks.match(/Variance from (\d+)\s+source bags:\s*([+-]?\d+)\s*bags/i);
  const repackSourceBags = varianceMatch ? parseInt(varianceMatch[1], 10) : undefined;
  const repackVariance = varianceMatch ? parseInt(varianceMatch[2], 10) : undefined;

  return {
    isMergedTarget: true,
    totalMergedAddedBags,
    repackHamali,
    totalCarriedRent,
    totalSeparateSourceRent,
    sources,
    genesisBags,
    genesisCustomerName: customerName,
    repackedStock,
    repackedSmallBags,
    repackedBigBags,
    repackedHybridBags,
    repackedBagType,
    repackVariance,
    repackSourceBags,
  };
}
