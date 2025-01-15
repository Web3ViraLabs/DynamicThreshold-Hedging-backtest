// Basic candle data structure
export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

// Details of a candle in string format
export interface CandleDetails {
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string | number;
}

// Legend candle with threshold information
export interface LegendCandle {
  currentDynamicThreshold: string;
  upwardThreshold: string;
  downwardThreshold: string;
  LegendCandleDifference: string;
  LegendCandleDetails: CandleDetails;
}

// Entry information
export interface Entry {
  reason: 'UpwardThresholdMet' | 'DownwardThresholdMet';
  side: 'LONG' | 'SHORT';
  price: number;
  formatted_price: string;
  time: string;
  candlesUntilThreshold: number;
  PositionEntryCandleDetails: CandleDetails;
}

// Final result format for each threshold check
export interface ThresholdResult {
  Legend_Candle_no: number;
  timestamp: string;
  LegendCandle: {
    currentDynamicThreshold: string;
    upwardThreshold: string;
    downwardThreshold: string;
    LegendCandleDifference: string;
    LegendCandleDetails: CandleDetails;
  };
  entry?: Entry;
  success: boolean;
}

export type NullableThresholdResult = ThresholdResult | null;

export interface RawSymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  filters: Array<{
    filterType: string;
    minPrice?: string;
    maxPrice?: string;
    tickSize?: string;
    minQty?: string;
    maxQty?: string;
    stepSize?: string;
  }>;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  pricePrecision: number;
  quantityPrecision: number;
}

export interface BacktestResult {
  symbol: string;
  timeframe: string;
  symbolInfo: SymbolInfo;
  config: TradingConfig;
  results: NullableThresholdResult[];
  stats: {
    totalCandles: number;
    legendCandles: number;
    successRate: number;
    successfulTrades: number;
  };
}

export interface TradingConfig {
  dataFetch: {
    startDate: {
      year: number;
      month: number;
    };
    endDate?: {
      year: number;
      month: number;
    };
  };
  trade: {
    maxLookForwardCandles: number;
  };
  strategy: {
    lookbackPeriod: {
      candles: number;
      threshold: number;
      thresholdMultiplier: number;
    };
  };
  singleBacktest: {
    symbol: string;
    timeframe: string;
  };
  market: {
    type: 'futures' | 'spot';
    subType: 'um' | 'cm';
  };
  backtestMode: {
    type: 'single' | 'batch';
    batchProcessing?: {
      parallel: boolean;
      concurrencyLimit: number;
    };
  };
}

export interface CandleData {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteAssetVolume: number;
  trades: number;
  takerBuyBaseAssetVolume: number;
  takerBuyQuoteAssetVolume: number;
  ignore: number;
}
