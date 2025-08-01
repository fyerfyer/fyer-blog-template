import { promises as fs } from 'fs';
import path from 'path';
import { minify as minifyHTML } from 'html-minifier-terser';
import { minify as minifyJS } from 'terser';
import postcss from 'postcss';
import cssnano from 'cssnano';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import type { BuildConfig, OptimizationResult, AssetOptimization } from '../types/index.js';

/**
 * Site optimizer for production builds
 * Handles minification, compression, and asset optimization
 */
export class SiteOptimizer {
  constructor(private config: BuildConfig) {}

  /**
   * Optimize entire site for production
   */
  async optimize(buildDir: string): Promise<OptimizationResult> {
    logger.info('Starting site optimization...');
    
    const results: OptimizationResult = {
      html: { originalSize: 0, optimizedSize: 0, savings: 0 },
      css: { originalSize: 0, optimizedSize: 0, savings: 0 },
      js: { originalSize: 0, optimizedSize: 0, savings: 0 },
      images: { originalSize: 0, optimizedSize: 0, savings: 0 },
      totalSavings: 0
    };

    // Optimize HTML files
    if (this.config.optimization.minifyHTML) {
      results.html = await this.optimizeHTML(buildDir);
    }

    // Optimize CSS files
    if (this.config.optimization.minifyCSS) {
      results.css = await this.optimizeCSS(buildDir);
    }

    // Optimize JavaScript files
    if (this.config.optimization.minifyJS) {
      results.js = await this.optimizeJS(buildDir);
    }

    // Optimize images
    if (this.config.optimization.optimizeImages) {
      results.images = await this.optimizeImages(buildDir);
    }

    results.totalSavings = 
      results.html.savings +
      results.css.savings +
      results.js.savings +
      results.images.savings;

    logger.info(`Optimization complete. Total savings: ${this.formatBytes(results.totalSavings)}`);
    return results;
  }

  /**
   * Optimize HTML files
   */
  private async optimizeHTML(buildDir: string): Promise<AssetOptimization> {
    const htmlFiles = await this.findFiles(buildDir, '**/*.html');
    let originalSize = 0;
    let optimizedSize = 0;

    const minifyOptions = {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: true
    };

    for (const file of htmlFiles) {
      const content = await fs.readFile(file, 'utf-8');
      originalSize += Buffer.byteLength(content, 'utf-8');

      const minified = await minifyHTML(content, minifyOptions);
      optimizedSize += Buffer.byteLength(minified, 'utf-8');

      await fs.writeFile(file, minified);
    }

    return {
      originalSize,
      optimizedSize,
      savings: originalSize - optimizedSize
    };
  }

  /**
   * Optimize CSS files
   */
  private async optimizeCSS(buildDir: string): Promise<AssetOptimization> {
    const cssFiles = await this.findFiles(buildDir, '**/*.css');
    let originalSize = 0;
    let optimizedSize = 0;

    const processor = postcss([cssnano({
      preset: ['default', {
        discardComments: { removeAll: true },
        normalizeWhitespace: true,
        minifySelectors: true
      }]
    })]);

    for (const file of cssFiles) {
      const content = await fs.readFile(file, 'utf-8');
      originalSize += Buffer.byteLength(content, 'utf-8');

      const result = await processor.process(content, { from: file });
      optimizedSize += Buffer.byteLength(result.css, 'utf-8');

      await fs.writeFile(file, result.css);
    }

    return {
      originalSize,
      optimizedSize,
      savings: originalSize - optimizedSize
    };
  }

  /**
   * Optimize JavaScript files
   */
  private async optimizeJS(buildDir: string): Promise<AssetOptimization> {
    const jsFiles = await this.findFiles(buildDir, '**/*.js');
    let originalSize = 0;
    let optimizedSize = 0;

    for (const file of jsFiles) {
      const content = await fs.readFile(file, 'utf-8');
      originalSize += Buffer.byteLength(content, 'utf-8');

      const result = await minifyJS(content, {
        compress: true,
        mangle: true,
        format: {
          comments: false
        }
      });

      if (result.code) {
        optimizedSize += Buffer.byteLength(result.code, 'utf-8');
        await fs.writeFile(file, result.code);
      }
    }

    return {
      originalSize,
      optimizedSize,
      savings: originalSize - optimizedSize
    };
  }

  /**
   * Optimize images with Sharp
   */
  private async optimizeImages(buildDir: string): Promise<AssetOptimization> {
    const imageFiles = await this.findFiles(buildDir, '**/*.{jpg,jpeg,png,gif,webp}');
    let originalSize = 0;
    let optimizedSize = 0;

    for (const file of imageFiles) {
      const stats = await fs.stat(file);
      originalSize += stats.size;

      const ext = path.extname(file).toLowerCase();
      const basename = path.basename(file, ext);
      const dirname = path.dirname(file);

      try {
        if (ext === '.jpg' || ext === '.jpeg') {
          await sharp(file)
            .jpeg({ quality: 85, progressive: true })
            .toFile(path.join(dirname, `${basename}_optimized.jpg`));
          
          // Generate WebP version if configured
          if (this.config.optimization.generateWebP) {
            await sharp(file)
              .webp({ quality: 80 })
              .toFile(path.join(dirname, `${basename}.webp`));
          }
        } else if (ext === '.png') {
          await sharp(file)
            .png({ compressionLevel: 8, adaptiveFiltering: true })
            .toFile(path.join(dirname, `${basename}_optimized.png`));
          
          if (this.config.optimization.generateWebP) {
            await sharp(file)
              .webp({ quality: 80, lossless: true })
              .toFile(path.join(dirname, `${basename}.webp`));
          }
        }

        // Check if the optimized file exists and get its stats
        const optimizedPath = path.join(dirname, `${basename}_optimized${ext}`);
        try {
          const optimizedStats = await fs.stat(optimizedPath);
          optimizedSize += optimizedStats.size;

          // Replace original with optimized version
          await fs.rename(optimizedPath, file);
        } catch (statError) {
          // If optimized file doesn't exist, count original size (no optimization occurred)
          optimizedSize += stats.size;
        }
      } catch (error) {
        logger.warn(`Failed to optimize image ${file}: ${error}`);
        optimizedSize += stats.size; // Count as no savings if optimization fails
      }
    }

    return {
      originalSize,
      optimizedSize,
      savings: originalSize - optimizedSize
    };
  }

  /**
   * Find files matching pattern
   */
  private async findFiles(dir: string, pattern: string): Promise<string[]> {
    const glob = (await import('fast-glob')).default;
    return glob(pattern, { cwd: dir, absolute: true });
  }

  /**
   * Format bytes for human-readable output
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
