import axios from 'axios';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import config from './config';
import { TradingConfig, SymbolInfo, RawSymbolInfo } from './interfaces';
import crypto from 'crypto';

interface DataAvailability {
  symbol: string;
  firstAvailable: {
    year: number;
    month: number;
  };
  lastAvailable: {
    year: number;
    month: number;
  };
  timeframes: {
    [key: string]: {
      downloaded: boolean;
      firstDownloaded?: {
        year: number;
        month: number;
      };
      lastDownloaded?: {
        year: number;
        month: number;
      };
    };
  };
  lastUpdated: string;
}

export class DataFetcher {
  private baseUrl = 'https://data.binance.vision';
  private apiUrl: string;
  private timeframe: string;
  private symbolInfo: Map<string, SymbolInfo> = new Map();

  constructor(
    private symbol: string,
    private runConfig: TradingConfig = config
  ) {
    this.timeframe = runConfig.singleBacktest.timeframe;
    
    // Set API URL based on market type
    if (this.runConfig.market.type === 'futures') {
      if (this.runConfig.market.subType === 'um') {
        this.apiUrl = 'https://fapi.binance.com/fapi/v1';
        this.baseUrl = 'https://data.binance.vision/data/futures/um';
      } else if (this.runConfig.market.subType === 'cm') {
        this.apiUrl = 'https://dapi.binance.com/dapi/v1';
        this.baseUrl = 'https://data.binance.vision/data/futures/cm';
      } else {
        throw new Error(`Unsupported futures subType: ${this.runConfig.market.subType}`);
      }
    } else {
      this.apiUrl = 'https://api.binance.com/api/v3';
      this.baseUrl = 'https://data.binance.vision/data/spot';
    }
  }

  private getDataPath(): string {
    const marketType = this.runConfig.market.type;
    const subType = this.runConfig.market.subType;
    
    if (marketType === 'futures') {
      return path.join(__dirname, `../kline/${subType}/${this.symbol}`);
    }
    return path.join(__dirname, `../kline/spot/${this.symbol}`);
  }

  public async fetchSymbolInfo(symbol: string): Promise<SymbolInfo> {
    if (this.symbolInfo.has(symbol)) {
      return this.symbolInfo.get(symbol)!;
    }

    try {
      let response;
      if (this.runConfig.market.type === 'futures') {
        // For futures, use exchangeInfo without symbol parameter
        response = await axios.get(`${this.apiUrl}/exchangeInfo`);
        const symbolData = response.data.symbols.find((s: any) => s.symbol === symbol);
        if (!symbolData) {
          throw new Error(`Symbol ${symbol} not found in futures exchange info`);
        }
        response = { data: { symbols: [symbolData] } };
      } else {
        // For spot
        response = await axios.get(`${this.apiUrl}/exchangeInfo`, {
          params: { symbol }
        });
      }

      const symbolData = response.data.symbols[0] as RawSymbolInfo;
      
      // Find price filter for precision
      const priceFilter = symbolData.filters.find(
        (f) => f.filterType === 'PRICE_FILTER'
      );
      const lotSizeFilter = symbolData.filters.find(
        (f) => f.filterType === 'LOT_SIZE'
      );

      // Calculate precision from tickSize (e.g., "0.00001000" has 8 decimals)
      const pricePrecision = priceFilter?.tickSize
        ? -Math.log10(parseFloat(priceFilter.tickSize))
        : symbolData.quotePrecision;

      const quantityPrecision = lotSizeFilter?.stepSize
        ? -Math.log10(parseFloat(lotSizeFilter.stepSize))
        : symbolData.baseAssetPrecision;

      const info: SymbolInfo = {
        symbol: symbolData.symbol,
        baseAsset: symbolData.baseAsset,
        quoteAsset: symbolData.quoteAsset,
        baseAssetPrecision: symbolData.baseAssetPrecision,
        quotePrecision: symbolData.quotePrecision,
        pricePrecision: Math.max(0, Math.floor(pricePrecision)),
        quantityPrecision: Math.max(0, Math.floor(quantityPrecision))
      };

      this.symbolInfo.set(symbol, info);
      return info;
    } catch (error) {
      console.error(`Error fetching symbol info for ${symbol}:`, error);
      throw error;
    }
  }

  private async createDirectories(): Promise<void> {
    const basePath = this.getDataPath();
    const dirs = [
      basePath,
      path.join(basePath, this.timeframe),
      path.join(basePath, this.timeframe, 'zip'),
      path.join(basePath, this.timeframe, 'csv')
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private getDownloadUrl(year: number, month: number): string {
    const monthStr = month.toString().padStart(2, '0');
    const filename = `${this.symbol}-${this.timeframe}-${year}-${monthStr}`;

    if (this.runConfig.market.type === 'futures') {
      return `${this.baseUrl}/monthly/klines/${this.symbol}/${this.timeframe}/${filename}.zip`;
    }
    return `${this.baseUrl}/monthly/klines/${this.symbol}/${this.timeframe}/${filename}.zip`;
  }

  public async fetchHistoricalData(): Promise<void> {
    console.log(`\nChecking data availability for ${this.symbol} - ${this.timeframe}...`);
    
    const startDate = new Date(
      this.runConfig.dataFetch.startDate.year,
      this.runConfig.dataFetch.startDate.month - 1
    );
    const endDate = this.runConfig.dataFetch.endDate
      ? new Date(
          this.runConfig.dataFetch.endDate.year,
          this.runConfig.dataFetch.endDate.month - 1
        )
      : new Date();

    console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    await this.createDirectories();

    const basePath = this.getDataPath();
    const csvDir = path.join(basePath, this.timeframe, 'csv');
    const zipDir = path.join(basePath, this.timeframe, 'zip');

    // Check if we have all required files
    let hasAllFiles = true;
    const requiredFiles: string[] = [];

    for (
      let date = new Date(startDate);
      date <= endDate;
      date.setMonth(date.getMonth() + 1)
    ) {
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthStr = month.toString().padStart(2, '0');
      const filename = `${this.symbol}-${this.timeframe}-${year}-${monthStr}`;
      
      if (!fs.existsSync(path.join(csvDir, `${filename}.csv`))) {
        hasAllFiles = false;
        requiredFiles.push(`${filename}.zip`);
      }
    }

    if (hasAllFiles) {
      console.log('Using existing data - all required files are present');
      return;
    }

    // Download missing files
    for (const filename of requiredFiles) {
      const [, , year, month] = filename.split('-');
      const url = this.getDownloadUrl(parseInt(year), parseInt(month));
      const zipPath = path.join(zipDir, filename);
      
      try {
        console.log(`Downloading ${url}`);
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(zipPath, response.data);

        // Extract
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(csvDir, true);
        
        // Remove zip
        fs.unlinkSync(zipPath);
      } catch (error) {
        console.error(`Failed to download/extract ${filename}:`, error);
        throw error;
      }
    }
  }
}
