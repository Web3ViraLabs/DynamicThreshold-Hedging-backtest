import path from 'path';
import fs from 'fs';
import { Backtester } from './backtest';
import { DataFetcher } from './data-fetcher';
import config, { AVAILABLE_SYMBOLS, AVAILABLE_TIMEFRAMES } from './config';
import { SymbolInfo } from './interfaces';

async function getAllCsvFiles(symbol: string, timeframe: string): Promise<string[]> {
  // Get the correct base path based on market type
  const marketType = config.market.type;
  const subType = config.market.subType;
  let basePath;
  
  if (marketType === 'futures') {
    basePath = path.join(__dirname, `../kline/${subType}`);
  } else {
    basePath = path.join(__dirname, '../kline/spot');
  }

  const klineDir = path.join(
    basePath,
    symbol,
    timeframe,
    'csv'
  );

  const files = await fs.promises.readdir(klineDir);

  // Filter files based on date range
  const startDate = new Date(
    config.dataFetch.startDate.year,
    config.dataFetch.startDate.month - 1
  );
  const endDate = config.dataFetch.endDate 
    ? new Date(
        config.dataFetch.endDate.year,
        config.dataFetch.endDate.month - 1
      )
    : new Date();

  return files
    .filter((file) => {
      // Extract date from filename (e.g., ETHUSDT-1m-2024-01.csv)
      const match = file.match(/\d{4}-\d{2}/);
      if (!match) return false;
      
      const [year, month] = match[0].split('-').map(Number);
      const fileDate = new Date(year, month - 1);
      
      return fileDate >= startDate && fileDate <= endDate;
    })
    .filter((file) => file.endsWith('.csv'))
    .sort()
    .map((file) => path.join(klineDir, file));
}

async function processSymbol(symbol: string, timeframe: string, symbolInfo: any) {
  try {
    console.log(`\nProcessing ${symbol} on ${timeframe} timeframe`);
    console.log(`Price precision: ${symbolInfo.pricePrecision} decimals`);
    
    // First: Download data
    console.log('\n=== Starting Data Download Phase ===');
    const dataFetcher = new DataFetcher(symbol, {
      ...config,
      singleBacktest: {
        symbol,
        timeframe
      }
    });
    await dataFetcher.fetchHistoricalData();
    console.log(' Data download complete');

    // Second: Run backtest
    console.log('\n=== Starting Backtest Phase ===');
    const backtester = new Backtester(symbol, {
      ...config,
      singleBacktest: {
        symbol,
        timeframe
      }
    });

    // Set symbol info before processing
    backtester.setSymbolInfo(symbolInfo);

    const csvFiles = await getAllCsvFiles(symbol, timeframe);
    console.log(`Loading ${csvFiles.length} CSV files...`);
    
    for (const csvFile of csvFiles) {
      await backtester.loadData(csvFile);
    }

    await backtester.findThresholds();
    console.log(' Backtest complete');
  } catch (error) {
    console.error(`Error processing ${symbol} - ${timeframe}:`, error);
  }
}

async function runBatchBacktest() {
  const symbols = AVAILABLE_SYMBOLS;
  const timeframes = AVAILABLE_TIMEFRAMES;

  console.log(`Starting batch backtest for:`);
  console.log(`Symbols: ${symbols.join(', ')}`);
  console.log(`Timeframes: ${timeframes.join(', ')}`);
  console.log(`Total combinations: ${symbols.length * timeframes.length}`);

  // First fetch all symbol info
  const dataFetcher = new DataFetcher('BTCUSDT'); // Temporary symbol just to instantiate
  const symbolInfoMap = new Map<string, SymbolInfo>();
  
  console.log('\nFetching symbol information...');
  for (const symbol of symbols) {
    try {
      const info = await dataFetcher.fetchSymbolInfo(symbol);
      symbolInfoMap.set(symbol, info);
      console.log(`${symbol}: ${info.pricePrecision} decimals`);
    } catch (error) {
      console.error(`Failed to fetch info for ${symbol}:`, error);
      // Skip this symbol
      continue;
    }
  }

  if (config.backtestMode.batchProcessing?.parallel) {
    const concurrencyLimit = config.backtestMode.batchProcessing.concurrencyLimit || 5;
    const queue = [];

    for (const symbol of symbols) {
      const symbolInfo = symbolInfoMap.get(symbol);
      if (!symbolInfo) continue; // Skip if we couldn't get symbol info
      
      for (const timeframe of timeframes) {
        queue.push({ symbol, timeframe, symbolInfo });
      }
    }

    console.log(`Processing in parallel with concurrency limit of ${concurrencyLimit}`);

    // Process in parallel with concurrency limit
    while (queue.length > 0) {
      const batch = queue.splice(0, concurrencyLimit);
      await Promise.all(batch.map(({ symbol, timeframe, symbolInfo }) => 
        processSymbol(symbol, timeframe, symbolInfo)
      ));
      console.log(`Remaining combinations: ${queue.length}`);
    }
  } else {
    // Process sequentially
    let processed = 0;
    const total = symbols.length * timeframes.length;

    for (const symbol of symbols) {
      const symbolInfo = symbolInfoMap.get(symbol);
      if (!symbolInfo) continue; // Skip if we couldn't get symbol info
      
      for (const timeframe of timeframes) {
        await processSymbol(symbol, timeframe, symbolInfo);
        processed++;
        console.log(`Progress: ${processed}/${total} combinations completed`);
      }
    }
  }

  console.log('\nBatch processing complete!');
}

async function runSingleBacktest() {
  const { symbol, timeframe } = config.singleBacktest;
  
  // Fetch symbol info first
  const dataFetcher = new DataFetcher(symbol);
  const symbolInfo = await dataFetcher.fetchSymbolInfo(symbol);
  
  await processSymbol(symbol, timeframe, symbolInfo);
}

async function main() {
  try {
    if (config.backtestMode.type === 'batch') {
      await runBatchBacktest();
    } else {
      await runSingleBacktest();
    }
  } catch (error) {
    console.error('Error running backtest:', error);
    process.exit(1);
  }
}

main();