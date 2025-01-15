import { TradingConfig } from './interfaces';

export const AVAILABLE_SYMBOLS = [
  'ETHUSDT',
  'XRPUSDT',
  'ADAUSDT',
  'SOLUSDT',
  'LTCUSDT',
  'XMRUSDT',
  '1000SHIBUSDT',
] as const;

export const AVAILABLE_TIMEFRAMES = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '8h',
  '12h',
  '1d',
] as const;

// Helper function to get lookback period based on timeframe
function getLookbackPeriod(timeframe: string): number {
  const timeframeMap: { [key: string]: number } = {
    '1m': 200,
    '3m': 150,
    '5m': 120,
    '15m': 100,
    '30m': 80,
    '1h': 60,
    '2h': 48,
    '4h': 36,
    '6h': 24,
    '8h': 20,
    '12h': 15,
    '1d': 10,
  };
  return timeframeMap[timeframe] || 200;
}

const config: TradingConfig = {
  dataFetch: {
    startDate: {
      year: 2024,
      month: 9,
    },
    endDate: {
      year: 2024,
      month: 10,
    },
  },
  trade: {
    maxLookForwardCandles: 100,
  },
  strategy: {
    lookbackPeriod: {
      candles: 200,
      threshold: 15,
      thresholdMultiplier: 15,
    },
  },
  singleBacktest: {
    symbol: 'ETHUSDT',
    timeframe: '1m',
  },
  market: {
    type: 'futures',
    subType: 'um',
  },
  backtestMode: {
    type: 'single', //or single or batch
    batchProcessing: {
      parallel: true,
      concurrencyLimit: 5,
    },
  },
};

export default config;
