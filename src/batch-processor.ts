import { Backtester } from './backtest';
import { DataFetcher } from './data-fetcher';
import path from 'path';
import fs from 'fs';
import config, { AVAILABLE_SYMBOLS, AVAILABLE_TIMEFRAMES } from './config';
import { TradingConfig } from './interfaces';
import { ThresholdResult } from './interfaces';

export class BatchProcessor {
  private symbols = AVAILABLE_SYMBOLS;
  private timeframes = AVAILABLE_TIMEFRAMES;
  private completedBacktests: Set<string> = new Set();

  constructor(
    private useParallel: boolean = false,
    private concurrencyLimit: number = 5
  ) {}

  private async downloadData(
    symbol: string, 
    timeframe: typeof AVAILABLE_TIMEFRAMES[number]
  ): Promise<void> {
    try {
      console.log(`\n=== Downloading data for ${symbol} - ${timeframe} ===`);
      
      const runConfig: TradingConfig = {
        ...config,
        singleBacktest: {
          symbol,
          timeframe
        }
      };

      const dataFetcher = new DataFetcher(symbol, runConfig);
      await dataFetcher.fetchHistoricalData();
      
      console.log(`✅ Downloaded data for ${symbol} - ${timeframe}`);
    } catch (error) {
      console.error(`❌ Error downloading data for ${symbol} - ${timeframe}:`, error);
      throw error;
    }
  }

  private async runBacktest(
    symbol: string, 
    timeframe: typeof AVAILABLE_TIMEFRAMES[number]
  ): Promise<void> {
    try {
      console.log(`\n=== Running backtest for ${symbol} - ${timeframe} ===`);
      
      const runConfig: TradingConfig = {
        ...config,
        singleBacktest: {
          symbol,
          timeframe
        }
      };

      const backtester = new Backtester(symbol, runConfig);
      const csvFiles = await this.getAllCsvFiles(symbol, timeframe);

      if (csvFiles.length === 0) {
        console.log(`No CSV files found for ${symbol} - ${timeframe}`);
        return;
      }

      console.log(`Loading ${csvFiles.length} CSV files...`);
      for (const csvFile of csvFiles) {
        await backtester.loadData(csvFile);
      }

      await backtester.findThresholds();
      
      // Results will always be created, even if empty
      this.completedBacktests.add(`${symbol}-${timeframe}`);
      console.log(`✅ Completed backtest for ${symbol} - ${timeframe}`);
    } catch (error) {
      console.error(`❌ Error in backtest for ${symbol} - ${timeframe}:`, error);
      throw error;
    }
  }

  private async downloadAllData(): Promise<void> {
    console.log('\n=== Starting Data Download Phase ===');
    const totalDownloads = this.symbols.length * this.timeframes.length;
    console.log(`Total downloads needed: ${totalDownloads}`);

    if (this.useParallel) {
      const queue = [];
      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          queue.push({ symbol, timeframe });
        }
      }

      while (queue.length > 0) {
        const batch = queue.splice(0, this.concurrencyLimit);
        await Promise.all(
          batch.map(({ symbol, timeframe }) => 
            this.downloadData(symbol, timeframe)
          )
        );
        console.log(`Remaining downloads: ${queue.length}`);
      }
    } else {
      let completed = 0;
      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          await this.downloadData(symbol, timeframe);
          completed++;
          console.log(`Download progress: ${completed}/${totalDownloads}`);
        }
      }
    }

    console.log('\n✅ All data downloads completed');
  }

  private async runAllBacktests(): Promise<void> {
    console.log('\n=== Starting Backtest Phase ===');
    const totalBacktests = this.symbols.length * this.timeframes.length;
    console.log(`Total backtests to run: ${totalBacktests}`);

    if (this.useParallel) {
      const queue = [];
      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          queue.push({ symbol, timeframe });
        }
      }

      while (queue.length > 0) {
        const batch = queue.splice(0, this.concurrencyLimit);
        await Promise.all(
          batch.map(({ symbol, timeframe }) => 
            this.runBacktest(symbol, timeframe)
          )
        );
        console.log(`Remaining backtests: ${queue.length}`);
      }
    } else {
      let completed = 0;
      for (const symbol of this.symbols) {
        for (const timeframe of this.timeframes) {
          await this.runBacktest(symbol, timeframe);
          completed++;
          console.log(`Backtest progress: ${completed}/${totalBacktests}`);
        }
      }
    }

    console.log('\n✅ All backtests completed');
  }

  async processAll(): Promise<void> {
    console.log(`Starting batch processing in ${this.useParallel ? 'parallel' : 'sequential'} mode`);
    
    // First phase: Download all data
    await this.downloadAllData();
    
    // Second phase: Run all backtests
    await this.runAllBacktests();
    
    // Generate summary
    await this.runBatch();
    
    console.log('\nBatch processing complete!');
  }

  private async getAllCsvFiles(symbol: string, timeframe: string): Promise<string[]> {
    const klineDir = path.join(
      __dirname, 
      `../kline/${symbol}/${timeframe}/csv`
    );
    const files = await fs.promises.readdir(klineDir);
    return files
      .filter((file) => file.endsWith('.csv'))
      .sort()
      .map((file) => path.join(klineDir, file));
  }

  private async generateSummaryReport(symbol: string, timeframe: string): Promise<any> {
    try {
      const resultsPath = path.join(
        __dirname,
        `../results/${symbol}/${timeframe}_results.json`
      );

      if (!fs.existsSync(resultsPath)) {
        console.log(`No results file found for ${symbol} - ${timeframe}`);
        return;
      }

      const rawData = fs.readFileSync(resultsPath, 'utf8');
      if (!rawData) {
        console.log(`Empty results file for ${symbol} - ${timeframe}`);
        return;
      }

      const results = JSON.parse(rawData);
      if (!results || !results.results) {
        console.log(`Invalid results format for ${symbol} - ${timeframe}`);
        return;
      }

      const trades = results.results as ThresholdResult[];
      const successfulTrades = trades.filter((t: ThresholdResult) => t.success);

      const summary = {
        symbol,
        timeframe,
        total_trades: trades.length,
        successful_trades: successfulTrades.length,
        success_rate: trades.length > 0 ? (successfulTrades.length / trades.length) * 100 : 0,
        config: results.config
      };

      // Save individual summary
      const summaryDir = path.join(__dirname, '../results/summary');
      if (!fs.existsSync(summaryDir)) {
        fs.mkdirSync(summaryDir, { recursive: true });
      }

      const summaryPath = path.join(
        summaryDir,
        `${symbol}_${timeframe}_summary.json`
      );

      fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

      return summary;
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error reading results for ${symbol} - ${timeframe}:`, error);
        return {
          symbol,
          timeframe,
          total_trades: 0,
          successful_trades: 0,
          success_rate: 0,
          config: null,
          error: error.message
        };
      } else {
        console.error(`Unknown error reading results for ${symbol} - ${timeframe}`);
        return {
          symbol,
          timeframe,
          total_trades: 0,
          successful_trades: 0,
          success_rate: 0,
          config: null,
          error: 'Unknown error occurred'
        };
      }
    }
  }

  public async run(): Promise<void> {
    console.log('\nStarting batch processing...');
    
    // Create results directory if it doesn't exist
    const resultsDir = path.join(__dirname, '../results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }

    await this.runBatch();
    
    console.log('\nBatch processing complete!');
  }

  private async runBatch(): Promise<void> {
    const startTime = Date.now();
    const summaryDir = path.join(__dirname, '../results/summary');
    if (!fs.existsSync(summaryDir)) {
      fs.mkdirSync(summaryDir, { recursive: true });
    }

    const batchSummaryPath = path.join(
      summaryDir,
      `batch_summary_${startTime}.json`
    );

    const summaries = [];
    let completedCount = 0;
    const totalBacktests = this.symbols.length * this.timeframes.length;

    for (const symbol of this.symbols) {
      for (const timeframe of this.timeframes) {
        try {
          await this.runBacktest(symbol, timeframe);
          const summary = await this.generateSummaryReport(symbol, timeframe);
          if (summary) {
            summaries.push(summary);
          }
        } catch (err) {
          const error = err as Error;
          console.error(`Error in backtest for ${symbol} - ${timeframe}:`, error);
          summaries.push({
            symbol,
            timeframe,
            total_trades: 0,
            successful_trades: 0,
            success_rate: 0,
            config: null,
            error: error?.message || 'Unknown error occurred'
          });
        }
        completedCount++;
      }
    }

    // Save batch summary
    fs.writeFileSync(
      batchSummaryPath,
      JSON.stringify({
        timestamp: new Date().toISOString(),
        total_pairs: this.symbols.length,
        total_timeframes: this.timeframes.length,
        summaries
      }, null, 2)
    );

    console.log(`✅ Summary report saved to ${batchSummaryPath}`);
    console.log(`Completed ${completedCount} out of ${totalBacktests} backtests`);
  }
} 