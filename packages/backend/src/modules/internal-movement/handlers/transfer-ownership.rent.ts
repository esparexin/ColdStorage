import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { RentPayment, RentType, TransferOwnershipInput } from '@cold-storage/contracts';
import { toExcludedPeriodKeys } from '@cold-storage/contracts';
import { counterService } from '../../common/counter.service.js';
import { computeRentBalance, type RentBalance } from '../../common/rent-balance.js';
import { rentRepository } from '../../rent/rent.repository.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';
import { toPaymentEntity } from '../../rent/handlers/record-payment.handler.js';
import { computeExpectedDeliveryRent } from '../../delivery/handlers/delivery-rent.helper.js';
import { CommodityModel } from '../../../database/models/commodity.model.js';
import { computeFirstSeasonHamali } from '../../common/hamali-resolution.js';
import { resolveMovementObligation } from './resolve-movement-obligation.js';

export interface CalculateTransferDuesParams {
  facilityId: string;
  grn: {
    id: string;
    grnNumber: string;
    date: Date;
    rentType: RentType;
    commodityId: string;
    smallBagPrice?: number | null;
    bigBagPrice?: number | null;
    bagPrice?: number | null;
    bags: number;
    rentAmount?: number | null;
    hamaliRate?: number | null;
    hamaliAmount?: number | null;
  };
  bal: { total: number };
  confSmall: number;
  confBig: number;
  isHybrid: boolean;
  movementDate: Date;
  input: TransferOwnershipInput;
  session: mongoose.ClientSession;
}

export async function calculateTransferDues(params: CalculateTransferDuesParams): Promise<{
  effectiveObligation: number;
  transferCommodity: { isHamaliApplicable?: boolean; hamaliRate?: number } | null;
  totalDue: number;
  totalPaid: number;
  rentBal: RentBalance;
}> {
  const { facilityId, grn, bal, confSmall, confBig, isHybrid, movementDate, input, session } = params;

  const transferExtensions = await rentExtensionRepository.findExtensionsByGrn(facilityId, grn.id, session);
  const billedKeys = toExcludedPeriodKeys(transferExtensions);

  const { expectedRentCharge } = await computeExpectedDeliveryRent({
    grn: {
      id: grn.id, grnNumber: grn.grnNumber, date: grn.date, rentType: grn.rentType, commodityId: grn.commodityId,
      smallBagPrice: grn.smallBagPrice, bigBagPrice: grn.bigBagPrice, bagPrice: grn.bagPrice,
    },
    withdrawal: { smallBags: confSmall, bigBags: confBig }, quantity: isHybrid ? (input.sourceQuantity ?? bal.total) : undefined,
    deliveryDate: movementDate, session, excludePeriodKeys: billedKeys,
    bagCategory: input.sourceBagCategory, bagPrice: input.sourceBagPrice, seasonalBagPrice: input.sourceSeasonalBagPrice, monthlyBagPrice: input.sourceMonthlyBagPrice,
    isRatesInclusiveOfHamali: false,
  });

  const storedRent = grn.rentAmount ?? 0;
  let effectiveObligation = storedRent > 0 ? Math.max(storedRent, expectedRentCharge) : expectedRentCharge;

  const transferCommodity = await CommodityModel.findOne({ id: grn.commodityId }, null, { session }).lean().exec();
  const transferHamaliShare = computeFirstSeasonHamali(grn.bags, transferCommodity, transferExtensions, grn.hamaliRate, grn.hamaliAmount);

  const existingPayments = await rentRepository.findPaymentsByGrnId(facilityId, grn.id, session);
  const totalPaid = existingPayments.reduce((sum, p) => sum + p.amountPaid, 0);
  if (totalPaid > effectiveObligation + transferHamaliShare) {
    effectiveObligation = Math.max(0, totalPaid - transferHamaliShare);
  }

  const totalDue = await resolveMovementObligation(
    facilityId,
    {
      id: grn.id,
      rentAmount: effectiveObligation,
      rentType: grn.rentType,
      hamaliShare: transferHamaliShare,
      remainingBags: bal.total,
      totalBags: grn.bags,
    },
    session,
  );
  const rentBal = computeRentBalance(totalDue, totalPaid);

  return { effectiveObligation, transferCommodity, totalDue, totalPaid, rentBal };
}

export interface SettleTransferRentParams {
  facilityId: string;
  grnId: string;
  grnNumber: string;
  sourceCustomerId: string;
  sourceCustomerName: string;
  newCustomerName: string;
  movementDate: Date;
  totalDue: number;
  totalPaid: number;
  rentBal: RentBalance;
  input: TransferOwnershipInput;
  userId: string;
  session: mongoose.ClientSession;
}

export async function settleTransferRent(params: SettleTransferRentParams): Promise<{
  paymentRecord: RentPayment | undefined;
  effectiveRentBal: RentBalance;
}> {
  const {
    facilityId,
    grnId,
    grnNumber,
    sourceCustomerId,
    sourceCustomerName,
    newCustomerName,
    movementDate,
    totalDue,
    totalPaid,
    rentBal,
    input,
    userId,
    session,
  } = params;

  let effectiveRentBal = rentBal;
  let paymentRecord: RentPayment | undefined;

  if (rentBal.remainingBalance > 0) {
    if (input.paymentDecision === 'AGREED_PENDING') {
      return {
        paymentRecord: undefined,
        effectiveRentBal: rentBal,
      };
    }

    if (
      input.paymentDecision !== 'SETTLE_NOW' ||
      !input.settlementDetails ||
      input.settlementDetails.amountPaid < rentBal.remainingBalance
    ) {
      throw new Error(
        `Cannot transfer ownership: Outstanding rent of ₹${rentBal.remainingBalance.toLocaleString('en-IN')} must be fully settled before transfer under SETTLE_NOW, or choose AGREED_PENDING to carry forward.`,
      );
    }

    const { amountPaid, paymentMode, paymentNotes } = input.settlementDetails;
    if (amountPaid > rentBal.remainingBalance) {
      throw new Error(
        `Requested settlement ₹${amountPaid} exceeds remaining rent balance of ₹${rentBal.remainingBalance}`,
      );
    }

    const receiptNumber = await counterService.generateRentReceiptNumber(
      facilityId,
      movementDate,
      session,
    );
    const paymentDoc = await rentRepository.createPayment(
      {
        id: `rp-${randomUUID()}`,
        facilityId,
        grnId,
        grnNumber,
        customerId: sourceCustomerId,
        customerName: sourceCustomerName,
        receiptNumber,
        amountPaid,
        paymentMode,
        paymentDate: movementDate,
        notes: paymentNotes?.trim() || `Settled upon ownership transfer to ${newCustomerName}`,
        createdBy: userId,
      },
      session,
    );
    paymentRecord = toPaymentEntity(paymentDoc);

    const updatedTotalPaid = totalPaid + amountPaid;
    effectiveRentBal = computeRentBalance(totalDue, updatedTotalPaid);
  }

  return { paymentRecord, effectiveRentBal };
}
