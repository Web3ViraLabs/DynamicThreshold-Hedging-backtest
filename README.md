# Threshold-Hedging Backtester

A TypeScript-based backtesting system for cryptocurrency trading strategies that identifies significant price movements (legend candles) and tests trading opportunities based on dynamic thresholds.

## Features

- Identifies legend candles based on price movement volatility
- Dynamic threshold calculation using market volatility
- Supports both bullish and bearish legend candles
- Configurable lookback periods based on timeframes
- Detailed trade entry analysis with success rate tracking
- Supports both spot and futures markets (um/cm)
- Single and batch backtest modes
- Comprehensive JSON result output

## Prerequisites

- Node.js (v14 or higher)
- TypeScript
- npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Threshold-Hedging-backtest
```

2. Install dependencies:
```bash
npm install
```

## Usage

1. Prepare your data:
   - Place your Binance kline data in CSV format under the `kline` directory
   - For futures: `kline/um/SYMBOL/TIMEFRAME/csv/`
   - For spot: `kline/spot/SYMBOL/TIMEFRAME/csv/`
   - CSV format: `open_time,open,high,low,close,volume,close_time,...`

2. Configure your strategy in `src/config.ts`:
```typescript
{
  strategy: {
    lookbackPeriod: {
      candles: 200,         // Number of candles to analyze
      threshold: 15,        // Base threshold for legend candles
      thresholdMultiplier: 15, // Multiplier for dynamic threshold
    }
  },
  trade: {
    maxLookForwardCandles: 100, // Max candles to look for entry
  }
}
```

3. Run the backtester:
```bash
ts-node src/run-backtest.ts
```

4. View results:
   - Results are saved in `results/SYMBOL/TIMEFRAME_results.json`
   - Contains detailed information about each legend candle and trade entry
   - Includes overall statistics like success rate

## Legend Candle Identification

A candle is identified as a legend candle when:
1. Its price movement (abs(close-open)/open * 100) is significant compared to recent market volatility
2. The movement exceeds the dynamic threshold calculated from the lookback period
3. Can be either bullish (green) or bearish (red) candles

## Project Structure

```
Threshold-Hedging-backtest/
├── src/
│   ├── backtest.ts          # Core backtesting engine
│   ├── config.ts            # Configuration settings
│   ├── interfaces.ts        # Type definitions
│   ├── data-fetcher.ts      # Data loading utilities
│   └── run-backtest.ts      # Main execution script
├── kline/                   # CSV data files
│   ├── um/                  # Futures data
│   └── spot/                # Spot data
└── results/                 # Backtest results
    └── SYMBOL/              # Symbol-specific results
```

## Configuration Options

### Market Settings
```typescript
market: {
  type: 'futures' | 'spot',  // Market type
  subType: 'um' | 'cm',      // For futures only
}
```

### Backtest Mode
```typescript
backtestMode: {
  type: 'single' | 'batch',  // Single pair or batch processing
  batchProcessing?: {
    parallel: boolean,       // Run tests in parallel
    concurrencyLimit: number // Max concurrent tests
  }
}
```

### Available Symbols and Timeframes
- Symbols: ETHUSDT, XRPUSDT, ADAUSDT, SOLUSDT, LTCUSDT, XMRUSDT, 1000SHIBUSDT
- Timeframes: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d
