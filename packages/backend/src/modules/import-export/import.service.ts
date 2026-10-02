import type { ImportSummary } from '@cold-storage/contracts';
import {
  CustomerService,
  customerService as defaultCustomerService,
} from '../customers/customer.service.js';
import { GrnService, grnService as defaultGrnService } from '../grn/grn.service.js';
import {
  CUSTOMER_IMPORT_ALLOWED_HEADERS,
  CUSTOMER_IMPORT_REQUIRED_HEADERS,
  GRN_IMPORT_ALLOWED_HEADERS,
  GRN_IMPORT_REQUIRED_HEADERS,
} from './csv-parser.helper.js';
import { executeCustomerImport } from './handlers/customer-import.handler.js';
import { executeGrnImport } from './handlers/grn-import.handler.js';

export {
  CUSTOMER_IMPORT_ALLOWED_HEADERS,
  CUSTOMER_IMPORT_REQUIRED_HEADERS,
  GRN_IMPORT_ALLOWED_HEADERS,
  GRN_IMPORT_REQUIRED_HEADERS,
};

export class ImportService {
  constructor(
    private grnServiceInstance: GrnService = defaultGrnService,
    private customerServiceInstance: CustomerService = defaultCustomerService,
  ) {}

  /**
   * Imports customers for a facility from CSV.
   * Transaction rule: ImportService does NOT open any MongoDB transaction.
   * CustomerService.createCustomer owns persistence.
   */
  public async importCustomers(
    facilityId: string,
    csvContent: string | Buffer,
    userId?: string,
  ): Promise<ImportSummary> {
    return executeCustomerImport(
      facilityId,
      csvContent,
      this.customerServiceInstance,
      userId,
    );
  }

  /**
   * Imports GRNs for a facility from CSV.
   * Transaction rule: ImportService does NOT open any MongoDB transaction.
   * GrnService.createGrn owns the session and transaction.
   */
  public async importGrns(
    facilityId: string,
    csvContent: string | Buffer,
    userId: string,
  ): Promise<ImportSummary> {
    return executeGrnImport(
      facilityId,
      csvContent,
      this.grnServiceInstance,
      userId,
    );
  }
}

export const importService = new ImportService();
