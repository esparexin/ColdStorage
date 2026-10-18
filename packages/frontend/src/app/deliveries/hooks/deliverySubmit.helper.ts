import type { DeliveryChallan, DeliverySummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';
import { formatApiErrorMessage, parseApiResponse } from '@/lib/api-response';

export async function submitDeliveryRequest(
  facilityId: string,
  payload: Record<string, unknown>,
): Promise<{ delivery: DeliveryChallan; summary?: DeliverySummary }> {
  const res = await requestWithAuth(
    `/api/facilities/${encodeURIComponent(facilityId)}/deliveries`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const parsed = await parseApiResponse<{ delivery: DeliveryChallan; summary?: DeliverySummary }>(res);
  if (!parsed.ok) {
    throw new Error(formatApiErrorMessage(parsed));
  }

  return parsed.data;
}
