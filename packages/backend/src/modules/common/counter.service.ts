import type { ClientSession } from 'mongoose';
import { getFinancialYearKey } from '@cold-storage/contracts';
import { CounterModel, type CounterType } from '../../database/models/counter.model.js';

/**
 * Document numbering prefixes (P0-Decision 1). Each numbered document family owns a distinct
 * prefix so that Inward Receipts and Rent Payment Receipts can never be confused, even though
 * they are sequenced by independent counters.
 */
export const DOCUMENT_PREFIXES = {
  grn: 'GRN',
  inwardReceipt: 'RCPT',
  challan: 'CHL',
  rentReceipt: 'RRCPT',
  bond: 'BND',
} as const;

export class CounterService {
  public async getNextSequence(
    facilityId: string,
    counterType: CounterType,
    financialYear: string,
    session?: ClientSession,
  ): Promise<number> {
    const counter = await CounterModel.findOneAndUpdate(
      { facilityId, counterType, financialYear },
      { $inc: { lastSequence: 1 } },
      { new: true, upsert: true, session },
    ).exec();

    return counter.lastSequence;
  }

  public async generateGrnNumber(
    facilityId: string,
    date: Date,
    session?: ClientSession,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const seq = await this.getNextSequence(facilityId, 'GRN', fy, session);
    const padded = String(seq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.grn}-${fy}-${padded}`;
  }

  public async generateInwardReceiptNumber(
    facilityId: string,
    date: Date,
    session?: ClientSession,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const seq = await this.getNextSequence(facilityId, 'INWARD_RECEIPT', fy, session);
    const padded = String(seq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.inwardReceipt}-${fy}-${padded}`;
  }

  public async previewNextInwardReceiptNumber(
    facilityId: string,
    date: Date,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const counter = await CounterModel.findOne({ facilityId, counterType: 'INWARD_RECEIPT', financialYear: fy }).exec();
    const nextSeq = (counter?.lastSequence ?? 0) + 1;
    const padded = String(nextSeq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.inwardReceipt}-${fy}-${padded}`;
  }

  public async syncInwardReceiptSequence(
    facilityId: string,
    date: Date,
    sequenceNumber: number,
    session?: ClientSession,
  ): Promise<void> {
    const fy = getFinancialYearKey(date);
    await CounterModel.findOneAndUpdate(
      { facilityId, counterType: 'INWARD_RECEIPT', financialYear: fy, lastSequence: { $lt: sequenceNumber } },
      { $set: { lastSequence: sequenceNumber } },
      { session, upsert: true },
    ).exec();
  }

  public async generateDeliveryChallanNumber(
    facilityId: string,
    date: Date,
    session?: ClientSession,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const seq = await this.getNextSequence(facilityId, 'CHALLAN', fy, session);
    const padded = String(seq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.challan}-${fy}-${padded}`;
  }

  /**
   * Canonical generator for Rent Payment Receipt numbers. P0-Decision 1 requires the rent
   * receipt number to be strictly independent from the inward receipt number; the distinct
   * `RRCPT` prefix (matching `DOCUMENT_PREFIXES.rentReceipt` below)
   * guarantees the two document families never share an identifier namespace.
   */
  public async generateRentReceiptNumber(
    facilityId: string,
    date: Date,
    session?: ClientSession,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const seq = await this.getNextSequence(facilityId, 'RENT_RECEIPT', fy, session);
    const padded = String(seq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.rentReceipt}-${fy}-${padded}`;
  }

  public async generateBondNumber(
    facilityId: string,
    date: Date,
    session?: ClientSession,
    padLength = 4,
  ): Promise<string> {
    const fy = getFinancialYearKey(date);
    const seq = await this.getNextSequence(facilityId, 'BOND', fy, session);
    const padded = String(seq).padStart(padLength, '0');
    return `${DOCUMENT_PREFIXES.bond}-${fy}-${padded}`;
  }
}

export const counterService = new CounterService();
