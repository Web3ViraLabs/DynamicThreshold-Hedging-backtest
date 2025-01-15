import path from 'path';
import fs from 'fs';
import moment from 'moment';
import { parse } from 'csv-parse';
import config from './config';
import {
  ThresholdResult,
  NullableThresholdResult,
  CandleData,
  Entry,
  TradingConfig,
  BacktestResult
} from './interfaces';

export class Backtester {
  private candles: CandleData[] = [];
  private thresholdResults: ThresholdResult[] = [];
  private totalCandles: number = 0;
  private legendCandles: number = 0;
  private successfulTrades = 0;
  private symbolInfo?: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    baseAssetPrecision: number;
    quotePrecision: number;
    pricePrecision: number;
    quantityPrecision: number;
  };

  constructor(
    private symbol: string,
    private runConfig: TradingConfig = config
  ) {}

  public setSymbolInfo(info: {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    baseAssetPrecision: number;
    quotePrecision: number;
    pricePrecision: number;
    quantityPrecision: number;
  }) {
    this.symbolInfo = info;
  }

  async loadData(csvFilePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const startDate = new Date(
        this.runConfig.dataFetch.startDate.year,
        this.runConfig.dataFetch.startDate.month - 1
      );
      const startTimestamp = startDate.getTime();

      const endDate = this.runConfig.dataFetch.endDate
        ? new Date(
            this.runConfig.dataFetch.endDate.year,
            this.runConfig.dataFetch.endDate.month - 1
          )
        : new Date();
      const endTimestamp = endDate.getTime();

      console.log(`Loading data from ${csvFilePath}`);
      console.log(`Start date: ${startDate.toISOString()}`);
      console.log(`End date: ${endDate.toISOString()}`);

      const stream = fs.createReadStream(csvFilePath);
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
      });

      parser.on('readable', () => {
        let row: any;
        while ((row = parser.read()) !== null) {
          const candleTimestamp = parseInt(row.open_time);

          if (
            candleTimestamp >= startTimestamp &&
            candleTimestamp <= endTimestamp
          ) {
            const candle: CandleData = {
              openTime: candleTimestamp,
              open: parseFloat(row.open),
              high: parseFloat(row.high),
              low: parseFloat(row.low),
              close: parseFloat(row.close),
              volume: parseFloat(row.volume),
              closeTime: parseInt(row.close_time),
              quoteAssetVolume: parseFloat(row.quote_volume),
              trades: parseInt(row.count),
              takerBuyBaseAssetVolume: parseFloat(row.taker_buy_volume),
              takerBuyQuoteAssetVolume: parseFloat(row.taker_buy_quote_volume),
              ignore: parseInt(row.ignore)
            };
            this.candles.push(candle);
            this.totalCandles++;
          }
        }
      });

      parser.on('error', (err) => {
        console.error('Error parsing CSV:', err);
        reject(err);
      });

      parser.on('end', () => {
        console.log(`Loaded ${this.totalCandles} candles from ${csvFilePath}`);
        resolve();
      });

      stream.pipe(parser);
    });
  }

  private formatNumber(num: number): string {
    return Number(num.toFixed(2)).toString();
  }

  private formatPrice(price: number | string): string {
    if (!this.symbolInfo) {
      throw new Error('Symbol info not set');
    }
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return numPrice.toFixed(this.symbolInfo.pricePrecision);
  }

  private formatCandleDetails(candle: any) {
    return {
      open: this.formatPrice(candle.open),
      high: this.formatPrice(candle.high),
      low: this.formatPrice(candle.low),
      close: this.formatPrice(candle.close),
      volume: candle.volume,
    };
  }

  private async isLegendCandle(index: number): Promise<boolean> {
    const lookbackPeriod = this.getLookbackPeriod();
    if (index < lookbackPeriod) return false;

    const lookbackCandles = this.candles.slice(index - lookbackPeriod, index);
    const currentCandle = this.candles[index];

    // Calculate current candle's movement percentage using open-close
    const currentDiff = (Math.abs(currentCandle.close - currentCandle.open) / currentCandle.open) * 100;

    // Calculate average movement of previous candles using open-close
    const previousDiffs = lookbackCandles.map(
      (candle) => Math.abs((candle.close - candle.open) / candle.open) * 100
    );
    const averageDiff = previousDiffs.reduce((a, b) => a + b, 0) / previousDiffs.length;
    const dynamicThreshold = this.runConfig.strategy.lookbackPeriod.threshold * averageDiff;

    console.log(`
🔍 Checking candle at ${moment(currentCandle.openTime).format('YYYY-MM-DD HH:mm:ss')}
Movement: ${currentDiff.toFixed(2)}%
Average Movement: ${averageDiff.toFixed(2)}%
Dynamic Threshold: ${dynamicThreshold.toFixed(2)}%`);

    // Is it a legend candle?
    return currentDiff >= dynamicThreshold;
  }

  private async processLegendCandle(
    candleIndex: number,
    candle: CandleData,
    dynamicThreshold: number
  ): Promise<NullableThresholdResult> {
    const isLegend = await this.isLegendCandle(candleIndex);
    if (!isLegend) {
      return null;
    }

    // Calculate threshold value based on close price
    const thresholdValue = candle.close * (dynamicThreshold / 100);
    const upwardThreshold = candle.close + thresholdValue;
    const downwardThreshold = candle.close - thresholdValue;

    const result: ThresholdResult = {
      Legend_Candle_no: this.legendCandles + 1,
      timestamp: moment(candle.openTime).format('YYYY-MM-DD HH:mm:ss'),
      LegendCandle: {
        currentDynamicThreshold: dynamicThreshold.toFixed(
          this.symbolInfo?.pricePrecision || 2
        ),
        upwardThreshold: this.formatPrice(upwardThreshold),
        downwardThreshold: this.formatPrice(downwardThreshold),
        LegendCandleDifference: (
          (Math.abs(candle.close - candle.open) / candle.open) *
          100
        ).toFixed(2),
        LegendCandleDetails: this.formatCandleDetails(candle),
      },
      success: false,
    };

    console.log(`
✨ LEGEND CANDLE FOUND!
Time: ${result.timestamp}
Close: ${candle.close}
Upward Threshold: ${result.LegendCandle.upwardThreshold}
Downward Threshold: ${result.LegendCandle.downwardThreshold}`);

    // Look for entry opportunities in subsequent candles
    const maxLookForward = this.runConfig.trade.maxLookForwardCandles;
    let candlesChecked = 0;

    for (
      let i = candleIndex + 1;
      i < Math.min(candleIndex + maxLookForward + 1, this.candles.length);
      i++
    ) {
      candlesChecked++;
      const futureCandle = this.candles[i];
      const high = futureCandle.high;
      const low = futureCandle.low;

      if (high >= upwardThreshold) {
        result.entry = {
          reason: 'UpwardThresholdMet',
          side: 'LONG',
          price: upwardThreshold,
          formatted_price: `${this.formatPrice(upwardThreshold)} USDT`,
          time: moment(futureCandle.openTime).format('YYYY-MM-DD HH:mm:ss'),
          candlesUntilThreshold: candlesChecked,
          PositionEntryCandleDetails: this.formatCandleDetails(futureCandle),
        };
        result.success = true;
        break;
      } else if (low <= downwardThreshold) {
        result.entry = {
          reason: 'DownwardThresholdMet',
          side: 'SHORT',
          price: downwardThreshold,
          formatted_price: `${this.formatPrice(downwardThreshold)} USDT`,
          time: moment(futureCandle.openTime).format('YYYY-MM-DD HH:mm:ss'),
          candlesUntilThreshold: candlesChecked,
          PositionEntryCandleDetails: this.formatCandleDetails(futureCandle),
        };
        result.success = true;
        break;
      }
    }

    return result;
  }

  private getLookbackPeriod(): number {
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
    return timeframeMap[this.runConfig.singleBacktest.timeframe] || 200;
  }

  public async findThresholds(): Promise<ThresholdResult[]> {
    console.log(`\nStarting findThresholds with ${this.candles.length} candles`);
    const results: ThresholdResult[] = [];
    const lookbackPeriod = this.getLookbackPeriod();

    console.log('Config:', {
      lookbackPeriod,
      threshold: this.runConfig.strategy.lookbackPeriod.threshold,
      multiplier: this.runConfig.strategy.lookbackPeriod.thresholdMultiplier,
      timeframe: this.runConfig.singleBacktest.timeframe
    });

    if (this.candles.length < lookbackPeriod) {
      console.log(`Warning: Not enough candles (${this.candles.length}) for lookback period (${lookbackPeriod})`);
      return results;
    }

    for (let i = lookbackPeriod; i < this.candles.length; i++) {
      const lookbackCandles = this.candles.slice(i - lookbackPeriod, i);
      const currentCandle = this.candles[i];

      // Calculate average movement of previous candles
      const previousDiffs = lookbackCandles.map(
        (candle) => Math.abs((candle.close - candle.open) / candle.open) * 100
      );
      const averageDiff = previousDiffs.reduce((a, b) => a + b, 0) / previousDiffs.length;
      const dynamicThreshold = averageDiff * this.runConfig.strategy.lookbackPeriod.thresholdMultiplier;

      const result = await this.processLegendCandle(
        i,
        currentCandle,
        dynamicThreshold
      );

      if (result) {
        this.legendCandles++;
        if (this.legendCandles % 5 === 0) {
          console.log(`Found ${this.legendCandles} legend candles so far...`);
        }
        results.push(result);
        if (result.success) {
          this.successfulTrades++;
        }
      }
    }

    console.log(`\nProcessing complete. Found ${this.legendCandles} legend candles with ${this.successfulTrades} successful trades`);
    await this.saveResults(results);
    return results;
  }

  private async saveResults(results: ThresholdResult[]): Promise<void> {
    if (!this.symbolInfo) {
      throw new Error('Symbol info not set before saving results');
    }

    const resultData: BacktestResult = {
      symbol: this.symbol,
      timeframe: this.runConfig.singleBacktest.timeframe,
      symbolInfo: this.symbolInfo,
      config: this.runConfig,
      results: results,
      stats: {
        totalCandles: this.totalCandles,
        legendCandles: this.legendCandles,
        successfulTrades: this.successfulTrades,
        successRate:
          this.legendCandles > 0
            ? (this.successfulTrades / this.legendCandles) * 100
            : 0,
      },
    };

    // Create results directory if it doesn't exist
    const resultsDir = path.join(process.cwd(), '..', 'results', this.symbol);
    await fs.promises.mkdir(resultsDir, { recursive: true });

    // Save results to JSON file
    const resultPath = path.join(
      resultsDir,
      `${this.runConfig.singleBacktest.timeframe}_results.json`
    );
    await fs.promises.writeFile(
      resultPath,
      JSON.stringify(resultData, null, 2)
    );
  }

  public getStats() {
    return {
      totalCandles: this.totalCandles,
      legendCandles: this.legendCandles,
      successfulTrades: this.successfulTrades,
      successRate:
        this.legendCandles > 0
          ? (this.successfulTrades / this.legendCandles) * 100
          : 0,
    };
  }

  async run(): Promise<void> {
    await this.findThresholds();
  }
}
