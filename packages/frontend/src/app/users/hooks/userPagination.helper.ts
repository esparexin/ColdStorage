/**
 * Pure helper for user list pagination and client filtering calculations.
 */

export function hasUserClientFilters(searchTerm: string, roleFilter: string = ''): boolean {
  return roleFilter !== '' || searchTerm.trim() !== '';
}

export function resolveUserDisplayPagination(
  hasClientFilters: boolean,
  filteredCount: number,
  serverTotal: number,
  serverPages: number,
  pageSize: number = 20,
): { totalUsers: number; totalPages: number } {
  if (hasClientFilters) {
    return {
      totalUsers: filteredCount,
      totalPages: Math.max(1, Math.ceil(filteredCount / pageSize)),
    };
  }
  return {
    totalUsers: serverTotal,
    totalPages: serverPages,
  };
}

