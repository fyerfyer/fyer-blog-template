import { mkdir, rm } from 'fs/promises';
import { BlogConfig, BuildResult, BlogPost, BlogPage } from '../types/index.js';
import { ContentManager } from '../content/manager.js';
import { ContentEnhancer } from '../content/enhancer.js';
import { SiteGenerator } from './generator.js';
import { AssetProcessor } from './assets.js';
import { SiteOptimizer } from './optimizer.js';
import { IncrementalBuilder } from './incremental.js';
import { DraftManager } from '../content/drafts.js';
import { SearchManager } from '../content/search.js';
import { RelatedPostsManager } from '../content/related.js';
import { ArchiveManager } from '../content/archives.js';
import { SEOManager } from './seo.js';
import { FeedManager } from './feeds.js';
import { PerformanceOptimizer } from './performance.js';
import { logger } from '../utils/logger.js';

export interface BuildOptions {
  production?: boolean;
  clean?: boolean;
}

export class BuildPipeline {
  private config: BlogConfig;
  private contentManager: ContentManager;
  private contentEnhancer: ContentEnhancer;
  private siteGenerator: SiteGenerator;
  private assetProcessor: AssetProcessor;
  private optimizer: SiteOptimizer;
  private incrementalBuilder: IncrementalBuilder;
  private draftManager: DraftManager;
  private searchManager: SearchManager;
  private relatedPostsManager: RelatedPostsManager;
  private archiveManager: ArchiveManager;
  private seoManager: SEOManager;
  private feedManager: FeedManager;
  private performanceOptimizer: PerformanceOptimizer;

  constructor(config: BlogConfig, isProduction?: boolean) {
    this.config = config;
    this.contentManager = new ContentManager(config, isProduction);
    this.contentEnhancer = new ContentEnhancer();
    this.seoManager = new SEOManager(config.seo || { enableStructuredData: false, enableOpenGraph: false, enableTwitterCard: false }, config.build.outputDir, config.site.url, config.build.baseUrl);
    this.siteGenerator = new SiteGenerator(config, this.seoManager);
    this.assetProcessor = new AssetProcessor(config);
    this.optimizer = new SiteOptimizer(config.build);
    this.incrementalBuilder = new IncrementalBuilder(config.build);
    this.draftManager = new DraftManager(this.contentManager, config.build.inputDir);
    this.searchManager = new SearchManager(config.build.outputDir);
    this.relatedPostsManager = new RelatedPostsManager(config.features?.relatedPosts || { enabled: false, maxCount: 3, method: 'tags' });
    this.archiveManager = new ArchiveManager(config.features?.archives || { enabled: false, groupBy: 'year' }, config.build.outputDir);
    this.feedManager = new FeedManager(config.feed || { rss: { enabled: false, filename: 'rss.xml', maxItems: 20 }, atom: { enabled: false, filename: 'atom.xml', maxItems: 20 }, json: { enabled: false, filename: 'feed.json', maxItems: 20 } }, config.build.outputDir, config.site.url, config.build.baseUrl);
    this.performanceOptimizer = new PerformanceOptimizer(config.build.outputDir, config.build.optimization as unknown as Record<string, unknown>);
  }

  async build(options: BuildOptions = {}): Promise<BuildResult> {
    const buildTimer = logger.startTimer('Build pipeline');
    const startTime = Date.now();
    const generatedFiles: string[] = [];
    const errors: string[] = [];

    try {
      if (options.clean) {
        await this.clean();
        await this.incrementalBuilder.clearCache();
      }

      await this.ensureOutputDirectory();
      await this.incrementalBuilder.initialize();

      logger.info('📚 Loading content...');
      const allPosts = await this.contentManager.loadPosts();
      const allPages = await this.contentManager.loadPages();

      // Process scheduled drafts
      logger.info('📝 Processing scheduled drafts...');
      await this.draftManager.processScheduledDrafts();

      logger.info(`Found ${allPosts.length} posts and ${allPages.length} pages`);

      // Determine what needs to be rebuilt
      let posts: BlogPost[];
      let pages: BlogPage[];
      let shouldOptimize = false;

      if (options.production) {
        // Production build - process everything and use incremental building
        const changes = await this.incrementalBuilder.getChangedFiles(allPosts, allPages);
        
        if (changes.rebuildAll) {
          posts = allPosts;
          pages = allPages;
          shouldOptimize = true;
        } else {
          posts = changes.changedPosts.length > 0 ? allPosts : changes.changedPosts;
          pages = changes.changedPages.length > 0 ? allPages : changes.changedPages;
          shouldOptimize = changes.changedPosts.length > 0 || changes.changedPages.length > 0;
        }
        
        logger.info(`Incremental build: ${changes.changedPosts.length} changed posts, ${changes.changedPages.length} changed pages`);
      } else {
        // Development build - process everything to ensure hot reload works
        posts = allPosts;
        pages = allPages;
      }

      // Enhanced content processing for incremental builds (if any changed files need asset processing)
      logger.info('✨ Enhancing content...');
      const enhancedPosts = await Promise.all(
        posts.map(post => this.contentEnhancer.enhancePost(post))
      );
      const enhancedPages = await Promise.all(
        pages.map(page => this.contentEnhancer.enhancePage(page))
      );

      logger.info('🎨 Processing assets...');
      const assetFiles = await this.assetProcessor.processAssets(enhancedPosts);
      generatedFiles.push(...assetFiles);

      // Enhanced content processing for ALL posts and pages (needed for search, archives, etc.)  
      logger.info('✨ Enhancing ALL content for indexes...');
      const allEnhancedPosts = await Promise.all(
        allPosts.map(post => this.contentEnhancer.enhancePost(post))
      );
      const allEnhancedPages = await Promise.all(
        allPages.map(page => this.contentEnhancer.enhancePage(page))
      );

      // Phase 3.1: Advanced Content Features
      logger.info('🔍 Building search index...');
      // Always build search index with ALL posts, not just changed ones
      await this.searchManager.buildSearchIndex(allEnhancedPosts);

      logger.info('📋 Generating archives...');
      await this.archiveManager.generateArchives(allEnhancedPosts);

      // Add related posts to each post
      logger.info('🔗 Calculating related posts...');
      for (const post of allEnhancedPosts) {
        const relations = await this.relatedPostsManager.findRelatedPosts(post, allEnhancedPosts);
        post.relatedPosts = relations;
      }

      logger.info('🏗️  Generating site...');
      this.siteGenerator.setProductionMode(options.production || false);
      // In development mode, use locally enhanced pages to ensure changes are reflected
      // In production mode, use allEnhancedPages for full site generation
      const sitePagesToUse = options.production ? allEnhancedPages : enhancedPages;
      const siteFiles = await this.siteGenerator.generateSite(allEnhancedPosts, sitePagesToUse);
      generatedFiles.push(...siteFiles);

      // Phase 3.2: SEO and Performance
      if (this.config.build.optimization.generateSitemap) {
        logger.info('🗺️  Generating sitemap...');
        await this.seoManager.generateSitemap(allEnhancedPosts, allEnhancedPages);
        await this.seoManager.generateRobotsTxt();
      }

      if (this.config.build.optimization.generateRSS) {
        logger.info('📡 Generating feeds...');
        await this.feedManager.generateFeeds(
          allEnhancedPosts,
          this.config.site.title,
          this.config.site.description,
          this.config.site.author.name,
          this.config.site.author.email
        );
        
        // Generate category and tag feeds
        await this.feedManager.generateCategoryFeeds(
          allEnhancedPosts,
          this.config.site.title,
          this.config.site.description,
          this.config.site.author.name,
          this.config.site.author.email
        );
        
        await this.feedManager.generateTagFeeds(
          allEnhancedPosts,
          this.config.site.title,
          this.config.site.description,
          this.config.site.author.name,
          this.config.site.author.email
        );
        
        await this.feedManager.generateFeedIndex(allEnhancedPosts, this.config.site.title);
      }

      // Production optimizations
      let optimization;
      if (options.production && shouldOptimize) {
        logger.info('⚡ Optimizing build...');
        optimization = await this.optimizer.optimize(this.config.build.outputDir);
        
        // Image optimization and performance enhancements
        logger.info('🖼️  Optimizing images...');
        const imageOptimization = await this.performanceOptimizer.optimizeImages();
        if (optimization) {
          optimization.images = imageOptimization;
        }
      }

      // Mark build as complete for incremental building
      if (options.production) {
        await this.incrementalBuilder.markBuildComplete();
      }

      const buildTime = Date.now() - startTime;
      buildTimer();

      const result: BuildResult = {
        success: true,
        buildTime,
        generatedFiles
      };
      
      if (optimization) {
        result.optimization = optimization;
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      logger.error(`Build failed: ${(error as Error).message}`);
      
      return {
        success: false,
        buildTime: Date.now() - startTime,
        generatedFiles,
        errors,
      };
    }
  }

  async clean(): Promise<void> {
    try {
      await rm(this.config.build.outputDir, { recursive: true, force: true });
      logger.info('🧹 Cleaned output directory');
    } catch (error) {
      logger.warn(`Warning: Could not clean output directory: ${(error as Error).message}`);
    }
  }

  private async ensureOutputDirectory(): Promise<void> {
    await mkdir(this.config.build.outputDir, { recursive: true });
  }

  /**
   * Get build statistics and metrics
   */
  async getBuildStats(): Promise<{
    posts: number;
    pages: number;
    drafts: number;
    tags: number;
    categories: number;
    searchIndex: object | null;
    archives: object | null;
    feeds: object | null;
    seo: object | null;
    performance: object | null;
  }> {
    const allPosts = await this.contentManager.loadPosts();
    const allPages = await this.contentManager.loadPages();
    const drafts = await this.draftManager.getDrafts();
    
    const searchStats = await this.searchManager.getSearchStats();
    const archiveStats = await this.archiveManager.getArchiveStats(allPosts);
    const feedStats = await this.feedManager.getFeedStats(allPosts);
    const seoStats = await this.seoManager.getSEOMetrics(allPosts);
    const performanceStats = await this.performanceOptimizer.getPerformanceMetrics();
    
    const allTags = Array.from(new Set(allPosts.flatMap(p => p.frontmatter.tags || [])));
    const allCategories = Array.from(new Set(allPosts.flatMap(p => p.frontmatter.categories || [])));
    
    return {
      posts: allPosts.length,
      pages: allPages.length,
      drafts: drafts.length,
      tags: allTags.length,
      categories: allCategories.length,
      searchIndex: searchStats,
      archives: archiveStats,
      feeds: feedStats,
      seo: seoStats,
      performance: performanceStats,
    };
  }
}