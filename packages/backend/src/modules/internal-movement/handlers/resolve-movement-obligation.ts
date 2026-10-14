import type { ClientSession } from 'mongoose';
import type { RentObligationInput } from '@cold-storage/contracts';
import { rentRepository } from '../../rent/rent.repository.js';
import { rentExtensionRepository } from '../../rent/rent-extension.repository.js';

/** The GRN fields that participate in the rent obligation. */
export interface ObligationGrn {
  id: string;
  rentAmount: number | null;
  rentType: RentObligationInput['rentType'];
}

/**
 * Resolves the total rent obligation for a GRN in the internal-movement flows.
 *
 * Merge and ownership-transfer both need the full obligation - stored rent,
 * outward rent charges already levied, and finalized extensions - and both
 * used to derive it themselves from a bare `rentAmount`. For a GRN whose rent
 * is carried on its outward challans that produced a zero obligation, which is
 * how two of the six competing derivations survived.
 *
 * Keeping this in one place also keeps the two handlers inside the 250-line
 * budget.
 */
export async function resolveMovementObligation(
  facilityId: string,
  grn: ObligationGrn,
  session?: ClientSession,
): Promise<number> {
  const outwardRentCharges = await rentRepository.getOutwardRentChargesForGrn(
    facilityId,
    grn.id,
    session,
  );
  return rentExtensionRepository.resolveTotalDue(
    facilityId,
    {
      id: grn.id,
      rentAmount: grn.rentAmount,
      rentType: grn.rentType,
      outwardRentCharges,
    },
    session,
  );
}
