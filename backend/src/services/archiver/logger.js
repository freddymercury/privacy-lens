import { createLogger } from '../../lib/logger-phase3.js';

// Create loggers for each component in the archiver service
export const deepCrawlerLogger = createLogger('DeepCrawler');
export const linkExtractorLogger = createLogger('LinkExtractor');
export const linkFilterLogger = createLogger('LinkFilter');
export const dedupLogger = createLogger('Dedup');
export const normaliserLogger = createLogger('Normaliser');
export const versionerLogger = createLogger('VersionerDeep');
export const assetFetcherLogger = createLogger('AssetFetcher');
export const concatAssemblerLogger = createLogger('ConcatAssembler');
export const utilsLogger = createLogger('ArchiverUtils');
