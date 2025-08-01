import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import type { BlogPost, BlogPage, BuildConfig } from '../types/index.js';

interface BuildCache {
  files: Record<string, FileCache>;
  lastBuild: number;
  version: string;
}

interface FileCache {
  checksum: string;
  lastModified: number;
  dependencies: string[];
}

/**
 * Incremental build system to optimize build performance
 * Only rebuilds files that have changed or their dependencies
 */
export class IncrementalBuilder {
  private cacheFile: string;
  private cache: BuildCache;

  constructor(private config: BuildConfig) {
    this.cacheFile = path.join(this.config.outputDir, '.build-cache.json');
    this.cache = {
      files: {},
      lastBuild: 0,
      version: '1.0.0'
    };
  }

  /**
   * Initialize and load existing cache
   */
  async initialize(): Promise<void> {
    try {
      const cacheData = await fs.readFile(this.cacheFile, 'utf-8');
      this.cache = JSON.parse(cacheData);
      logger.debug('Build cache loaded', { files: Object.keys(this.cache.files).length });
    } catch (error) {
      logger.debug('No existing build cache found, starting fresh');
    }
  }

  /**
   * Determine which files need to be rebuilt
   */
  async getChangedFiles(posts: BlogPost[], pages: BlogPage[]): Promise<{
    changedPosts: BlogPost[];
    changedPages: BlogPage[];
    changedAssets: string[];
    rebuildAll: boolean;
  }> {
    const allContent = [...posts, ...pages];
    const changedPosts: BlogPost[] = [];
    const changedPages: BlogPage[] = [];
    const changedAssets: string[] = [];

    // Check if this is a clean build
    const configChanged = await this.hasConfigChanged();
    if (configChanged) {
      logger.info('Configuration changed, rebuilding all files');
      return {
        changedPosts: posts,
        changedPages: pages,
        changedAssets: await this.getAllAssets(),
        rebuildAll: true
      };
    }

    // Check content files
    for (const content of allContent) {
      const filePath = content.filePath;
      const currentChecksum = await this.calculateChecksum(filePath);
      const currentModified = (await fs.stat(filePath)).mtime.getTime();

      const cached = this.cache.files[filePath];
      if (!cached || 
          cached.checksum !== currentChecksum || 
          cached.lastModified < currentModified) {
        
        if ('tags' in content) {
          changedPosts.push(content as BlogPost);
        } else {
          changedPages.push(content as BlogPage);
        }

        // Update cache
        this.cache.files[filePath] = {
          checksum: currentChecksum,
          lastModified: currentModified,
          dependencies: await this.getDependencies(filePath)
        };
      }
    }

    // Check assets
    const assetDir = path.join(this.config.inputDir, 'assets');
    if (await this.exists(assetDir)) {
      const assets = await this.getAllAssets();
      for (const asset of assets) {
        const currentChecksum = await this.calculateChecksum(asset);
        const cached = this.cache.files[asset];
        
        if (!cached || cached.checksum !== currentChecksum) {
          changedAssets.push(asset);
          this.cache.files[asset] = {
            checksum: currentChecksum,
            lastModified: (await fs.stat(asset)).mtime.getTime(),
            dependencies: []
          };
        }
      }
    }

    return {
      changedPosts,
      changedPages,
      changedAssets,
      rebuildAll: false
    };
  }

  /**
   * Mark build as complete and save cache
   */
  async markBuildComplete(): Promise<void> {
    this.cache.lastBuild = Date.now();
    await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
    logger.debug('Build cache updated');
  }

  /**
   * Clear build cache
   */
  async clearCache(): Promise<void> {
    this.cache = {
      files: {},
      lastBuild: 0,
      version: '1.0.0'
    };
    
    try {
      await fs.unlink(this.cacheFile);
      logger.info('Build cache cleared');
    } catch (error) {
      // Cache file doesn't exist, which is fine
    }
  }

  /**
   * Check if configuration has changed since last build
   */
  private async hasConfigChanged(): Promise<boolean> {
    const configPath = path.join(process.cwd(), 'config', 'blog.config.json');
    
    try {
      const configStat = await fs.stat(configPath);
      return configStat.mtime.getTime() > this.cache.lastBuild;
    } catch (error) {
      return true; // If config doesn't exist, assume changed
    }
  }

  /**
   * Calculate file checksum for change detection
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      logger.warn(`Failed to calculate checksum for ${filePath}`);
      return '';
    }
  }

  /**
   * Get all asset files
   */
  private async getAllAssets(): Promise<string[]> {
    const assetDir = path.join(this.config.inputDir, 'assets');
    
    if (!(await this.exists(assetDir))) {
      return [];
    }

    const glob = (await import('fast-glob')).default;
    return glob('**/*', {
      cwd: assetDir,
      absolute: true,
      onlyFiles: true
    });
  }

  /**
   * Get file dependencies (for advanced dependency tracking)
   */
  private async getDependencies(filePath: string): Promise<string[]> {
    // For now, just return the file itself
    // In the future, could analyze imports, includes, etc.
    return [filePath];
  }

  /**
   * Check if file/directory exists
   */
  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { totalFiles: number; lastBuild: Date | null } {
    return {
      totalFiles: Object.keys(this.cache.files).length,
      lastBuild: this.cache.lastBuild ? new Date(this.cache.lastBuild) : null
    };
  }
}