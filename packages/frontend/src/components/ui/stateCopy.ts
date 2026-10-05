/**
 * stateCopy — single SSOT for loading / error / empty copy.
 * All list pages must consume these labels instead of inline strings so
 * ellipsis (… U+2026), titles, and empty vocabularies stay consistent.
 */

export const LOADING_LABELS = {
  auth: 'Checking authentication…',
  dashboard: 'Loading dashboard…',
  grns: 'Loading Inward of Goods…',
  deliveries: 'Loading Delivery Challans…',
  rent: 'Loading rent billing accounts…',
  customers: 'Loading customers…',
  commodities: 'Loading commodities…',
  users: 'Loading users…',
  audit: 'Loading audit logs…',
  backupLogs: 'Loading backup logs…',
  facilities: 'Loading facilities…',
  settings: 'Loading system settings…',
  connectivity: 'Checking connection…',
  data: 'Loading data…',
  saving: 'Saving…',
  signingIn: 'Signing in…',
  encrypting: 'Encrypting…',
  exporting: 'Exporting…',
  importing: 'Processing Import…',
  uploading: 'Uploading…',
} as const;

export const ERROR_TITLES = {
  default: 'Something went wrong',
  grns: 'Error loading Inward of Goods',
  deliveries: 'Error loading deliveries',
  rent: 'Error loading rent accounts',
  customers: 'Error loading customers',
  commodities: 'Error loading commodities',
  users: 'Error loading users',
  audit: 'Error loading audit logs',
  facilities: 'Could not load facilities',
  facilityAction: 'Facility action failed',
  connectivity: 'Frontend to Backend connection failed',
  accessRestricted: 'Access Restricted',
} as const;

export const EMPTY_MESSAGES = {
  noFacilityGrns: 'Please select a facility from the top header to manage Inward of Goods.',
  noFacilityDeliveries: 'Please select a facility from the top header to manage deliveries.',
  noFacilityRent: 'Please select a facility from the top header to manage rent billing.',
  noFacilityImportExport: 'Please select a facility from the top header to manage data imports and exports.',
  dashboard: 'No dashboard data available.',
  commodityStock: 'No commodity stock on hand.',
  recentActivity: 'No recent activity.',
  audit: 'No audit log events recorded yet.',
  backupLogs: 'No backup history recorded yet.',
  facilities: 'No facilities configured yet. Add one to begin recording inward receipts.',
  usersFiltered: 'No users match your filter criteria.',
  usersEmpty: 'No registered users found.',
  customersEmpty: 'No customers registered yet.',
  commoditiesEmpty: 'No commodities registered yet.',
} as const;

export function emptyForFacility(facilityName: string | null, kind: 'grns' | 'deliveries' | 'rent'): string {
  const name = facilityName ?? 'this facility';
  if (kind === 'grns') return `No Inward of Goods recorded for ${name} yet.`;
  if (kind === 'deliveries') return `No delivery challans recorded for ${name} yet.`;
  return `No rent accounts recorded for ${name} yet.`;
}

export function noMatchMessage(kind: 'customers' | 'commodities', term: string): string {
  if (kind === 'customers') return `No customers matching "${term}".`;
  return `No commodities matching "${term}".`;
}

export const ACCESS_MESSAGES = {
  audit: "Inspecting audit trails requires the 'audit:view' permission.",
  settings: "System settings require the 'settings:manage' permission.",
  backup: "Backup management requires the 'backup:manage' permission.",
  users: "Requires the 'user:manage' permission.",
} as const;

export const PRINT_MESSAGES = {
  popupBlocked: 'Pop-up window was blocked. Please allow pop-ups for this site to print documents.',
  grnFailed: 'Failed to generate document',
  challanFailed: 'Failed to generate delivery challan',
} as const;
