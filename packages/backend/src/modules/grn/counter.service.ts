import type { ClientSession } from 'mongoose';
import { getFinancialYearKey } from '@cold-storage/contracts';
import { CounterModel, type CounterType } from '../../database/models/counter.model.js';

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
    return `GRN-${fy}-${padded}`;
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
    return `RCPT-${fy}-${padded}`;
  }
}

export const counterService = new CounterService();
