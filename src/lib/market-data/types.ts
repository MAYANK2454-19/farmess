export type MarketPriceValueType = "reported" | "demo";

export type MarketSourceQualityRejectionReason =
  | "invalid_record"
  | "missing_identity"
  | "invalid_observation_date"
  | "invalid_price"
  | "missing_prices"
  | "inconsistent_prices";

export type MarketSourceQuality = {
  received: number;
  accepted: number;
  rejected: number;
  rejectionReasons: Record<MarketSourceQualityRejectionReason, number>;
};

export type MarketPriceRecord = {
  id: string;
  commodity: string;
  variety: string | null;
  state: string;
  district: string;
  market: string;
  minPrice: string | null;
  maxPrice: string | null;
  modalPrice: string | null;
  currency: "INR";
  priceUnit: "INR/quintal";
  sourcePriceUnit: string;
  observationDate: string;
  retrievedAt: string;
  sourceName: string;
  sourceUrl: string;
  valueType: MarketPriceValueType;
};

export type MarketSearchFilters = {
  commodity?: string;
  state?: string;
  district?: string;
  market?: string;
  limit?: number;
  offset?: number;
};

export type MarketDataResult =
  | {
      status: "available";
      records: MarketPriceRecord[];
      retrievedAt: string;
      sourceName: string;
      sourceQuality: MarketSourceQuality;
    }
  | {
      status: "no-data";
      records: [];
      retrievedAt: string;
      sourceName: string;
      sourceQuality: MarketSourceQuality;
    }
  | {
      status: "stale";
      records: MarketPriceRecord[];
      retrievedAt: string;
      sourceName: string;
      message: string;
      sourceQuality: MarketSourceQuality;
    }
  | {
      status: "unavailable";
      records: [];
      retrievedAt: string;
      sourceName: string;
      message: string;
      sourceQuality: MarketSourceQuality;
    };
