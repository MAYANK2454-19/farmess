export type MarketPriceValueType = "reported" | "demo";

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
    }
  | { status: "no-data"; records: []; retrievedAt: string; sourceName: string }
  | {
      status: "stale";
      records: MarketPriceRecord[];
      retrievedAt: string;
      sourceName: string;
      message: string;
    }
  | {
      status: "unavailable";
      records: [];
      retrievedAt: string;
      sourceName: string;
      message: string;
    };
