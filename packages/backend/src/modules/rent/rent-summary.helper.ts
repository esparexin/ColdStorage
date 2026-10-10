import {
  totalRentDue,
  type RentExtension,
  type RentSummaryDto,
} from '@cold-storage/contracts';
import type { GrnDoc } from '../../database/models/grn.model.js';
import type { RentPaymentDoc } from '../../database/models/rent-payment.model.js';
import { computeRentBalance } from '../common/rent-balance.js';
import { toPaymentEntity } from './handlers/record-payment.handler.js';

/**
 * Maps a GRN and its payments to the canonical rent summary DTO.
 *
 * Shared by the single-GRN lookup and the batched facility list so both derive
 * the balance through computeRentBalance and cannot drift apart.
 *
 * The balance is always derived from the total due (original Seasonal
 * obligation plus finalized January/February extensions). With no extensions
 * the total due equals Grn.rentAmount exactly.
 */
export function buildRentSummary(
  grn: GrnDoc,
  payments: RentPaymentDoc[],
  extensions: RentExtension[],
  deliveredBags = 0,
  remainingBags = grn.bags,
  outwardRentCharges = 0,
): RentSummaryDto {
  const baseRent = grn.rentAmount > 0 ? grn.rentAmount : outwardRentCharges;
  const totalDue = totalRentDue(
    baseRent,
    extensions.map((e) => e.finalAmount),
  );
  const balance = computeRentBalance(
    totalDue,
    payments.reduce((sum, p) => sum + p.amountPaid, 0),
  );

  return {
    grnId: grn.id,
    grnNumber: grn.grnNumber,
    facilityId: grn.facilityId,
    customerId: grn.customerId,
    customerName: grn.customerName,
    commodityName: grn.commodityName,
    chamber: grn.chamber,
    inwardDate: grn.date,
    totalBags: grn.bags,
    deliveredBags,
    remainingBags,
    bagPrice: grn.bagPrice ?? null,
    smallBagPrice: grn.smallBagPrice ?? null,
    bigBagPrice: grn.bigBagPrice ?? null,
    totalBagsWeight: grn.totalBagsWeight ?? null,
    rentType: grn.rentType,
    rentAmount: baseRent,
    rentMonths: grn.rentMonths ?? null,
    totalPaid: balance.totalPaid,
    remainingBalance: balance.remainingBalance,
    paymentStatus: balance.paymentStatus,
    payments: payments.map((p) => toPaymentEntity(p)),
    extensions,
    totalDue: balance.rentAmount,
  };
}
