export interface PositionOccupancyResponse {
  positionId: string;
  code: string;
  capacityBags: number;
  occupiedBags: number;
  availableBags: number;
  storedLots: Array<{
    grnId: string;
    grnNumber: string;
    lotNumber: string;
    commodityName: string;
    bags: number;
    customerName: string;
    inwardDate: string;
  }>;
}

export type ModalType = 'chamber' | 'rack' | 'level' | 'position' | null;
