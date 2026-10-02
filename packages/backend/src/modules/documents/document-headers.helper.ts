import type { FacilitySubHeader } from '@cold-storage/contracts';
import { FacilityModel } from '../../database/models/facility.model.js';
import { settingsService } from '../settings/settings.service.js';

/**
 * Resolves organization header from SystemSettings singleton.
 * Throws ORGANIZATION_NOT_CONFIGURED if an administrator has not yet configured
 * organization details.
 */
export async function getVerifiedOrganization() {
  const { settings, isConfigured } = await settingsService.getSettings();
  if (!isConfigured) {
    throw new Error(
      'ORGANIZATION_NOT_CONFIGURED: Organization details must be configured by an administrator before generating official documents',
    );
  }
  return settings;
}

/**
 * Resolves facility sub-header.
 */
export async function getFacilitySubHeader(facilityId: string): Promise<FacilitySubHeader> {
  const facility = await FacilityModel.findOne({ id: facilityId }).lean().exec();
  if (!facility) {
    throw new Error(`FACILITY_NOT_FOUND: Facility '${facilityId}' not found`);
  }
  return {
    facilityId: facility.id,
    facilityName: facility.name,
    facilityCode: facility.code,
    facilityAddress: facility.address ?? '',
  };
}
