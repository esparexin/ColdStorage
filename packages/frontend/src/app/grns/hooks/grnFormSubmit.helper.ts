import type { Grn } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

export async function submitCreateGrn(
  facilityId: string,
  payload: Record<string, unknown>,
): Promise<Grn> {
  const res = await requestWithAuth(`/api/facilities/${encodeURIComponent(facilityId)}/grns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Creation failed with HTTP ${res.status}`);
  }

  const responseData = (await res.json()) as { grn: Grn };
  return responseData.grn;
}

export async function submitEditGrn(
  facilityId: string,
  grnId: string,
  payload: Record<string, unknown>,
): Promise<Grn> {
  const res = await requestWithAuth(
    `/api/facilities/${encodeURIComponent(facilityId)}/grns/${encodeURIComponent(grnId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Update failed with HTTP ${res.status}`);
  }

  const responseData = (await res.json()) as { grn: Grn };
  return responseData.grn;
}
