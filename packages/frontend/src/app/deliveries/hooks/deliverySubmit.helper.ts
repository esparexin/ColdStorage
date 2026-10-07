import type { DeliveryChallan, DeliverySummary } from '@cold-storage/contracts';
import { requestWithAuth } from '@/lib/api-client';

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

  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Delivery failed with HTTP ${res.status}`);
  }

  return (await res.json()) as { delivery: DeliveryChallan; summary?: DeliverySummary };
}
