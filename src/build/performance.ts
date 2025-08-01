import { join, dirname, extname } from 'path';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { AssetOptimization } from '../types/index.js';

/**
 * PerformanceOptimizer handles image optimization, lazy loading, and performance enhancements
 */
export class PerformanceOptimizer {
  private outputDir: string;
  private optimization: {
    optimizeImages: boolean;
    generateWebP: boolean;
    lazyLoading: boolean;
    imageQuality: number;
    maxImageWidth: number;
    maxImageHeight: number;
  };

  constructor(outputDir: string, optimization: Record<string, unknown> = {}) {
    this.outputDir = outputDir;
    this.optimization = {
      optimizeImages: (optimization.optimizeImages as boolean) ?? true,
      generateWebP: (optimization.generateWebP as boolean) ?? true,
      lazyLoading: (optimization.lazyLoading as boolean) ?? true,
      imageQuality: (optimization.imageQuality as number) ?? 80,
      maxImageWidth: (optimization.maxImageWidth as number) ?? 1920,
      maxImageHeight: (optimization.maxImageHeight as number) ?? 1080,
    };
  }

  /**
   * Optimize all images in the output directory
   */
  async optimizeImages(): Promise<AssetOptimization> {
    if (!this.optimization.optimizeImages) {
      return { originalSize: 0, optimizedSize: 0, savings: 0 };
    }

    try {
      const imageFiles = await this.findImageFiles();
      let originalSize = 0;
      let optimizedSize = 0;

      for (const imagePath of imageFiles) {
        const result = await this.optimizeImage(imagePath);
        originalSize += result.originalSize;
        optimizedSize += result.optimizedSize;
      }

      const savings = originalSize - optimizedSize;
      const savingsPercent = originalSize > 0 ? (savings / originalSize) * 100 : 0;

      logger.info(
        `Image optimization complete: ${imageFiles.length} images, ` +
        `${this.formatBytes(savings)} saved (${savingsPercent.toFixed(1)}%)`
      );

      return { originalSize, optimizedSize, savings };
    } catch (error) {
      logger.error(`Error optimizing images: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Optimize a single image file
   */
  async optimizeImage(imagePath: string): Promise<AssetOptimization> {
    try {
      const originalStats = await stat(imagePath);
      const originalSize = originalStats.size;
      
      if (originalSize === 0) {
        return { originalSize: 0, optimizedSize: 0, savings: 0 };
      }

      const ext = extname(imagePath).toLowerCase();
      const supportedFormats = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'];
      
      if (!supportedFormats.includes(ext)) {
        return { originalSize, optimizedSize: originalSize, savings: 0 };
      }

      // Skip SVG files (they're already optimized)
      if (ext === '.svg') {
        return { originalSize, optimizedSize: originalSize, savings: 0 };
      }

      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      // Resize if image is too large
      const shouldResize = 
        (metadata.width && metadata.width > this.optimization.maxImageWidth) ||
        (metadata.height && metadata.height > this.optimization.maxImageHeight);

      if (shouldResize) {
        image.resize(
          this.optimization.maxImageWidth,
          this.optimization.maxImageHeight,
          { fit: 'inside', withoutEnlargement: true }
        );
      }

      // Optimize based on format
      let optimizedBuffer: Buffer;
      const quality = this.optimization.imageQuality;

      switch (ext) {
        case '.jpg':
        case '.jpeg':
          optimizedBuffer = await image
            .jpeg({ quality, progressive: true, mozjpeg: true })
            .toBuffer();
          break;
        
        case '.png':
          optimizedBuffer = await image
            .png({ quality, progressive: true, compressionLevel: 9 })
            .toBuffer();
          break;
        
        case '.webp':
          optimizedBuffer = await image
            .webp({ quality, effort: 6 })
            .toBuffer();
          break;
        
        default:
          // For unsupported formats, just copy the original
          optimizedBuffer = await readFile(imagePath);
      }

      // Only replace if the optimized version is smaller
      if (optimizedBuffer.length < originalSize) {
        await writeFile(imagePath, optimizedBuffer);
        
        // Generate WebP version if enabled and not already WebP
        if (this.optimization.generateWebP && ext !== '.webp') {
          await this.generateWebPVersion(imagePath, image);
        }
        
        const optimizedSize = optimizedBuffer.length;
        return { originalSize, optimizedSize, savings: originalSize - optimizedSize };
      } else {
        // Generate WebP version even if original wasn't optimized
        if (this.optimization.generateWebP && ext !== '.webp') {
          await this.generateWebPVersion(imagePath, sharp(imagePath));
        }
        
        return { originalSize, optimizedSize: originalSize, savings: 0 };
      }
    } catch (error) {
      logger.error(`Error optimizing image ${imagePath}: ${(error as Error).message}`);
      return { originalSize: 0, optimizedSize: 0, savings: 0 };
    }
  }

  /**
   * Generate WebP version of an image
   */
  async generateWebPVersion(originalPath: string, imageProcessor: sharp.Sharp): Promise<void> {
    try {
      const webpPath = originalPath.replace(/\.[^.]+$/, '.webp');
      
      // Don't overwrite if WebP version already exists and is newer
      if (existsSync(webpPath)) {
        const originalStats = await stat(originalPath);
        const webpStats = await stat(webpPath);
        if (webpStats.mtime > originalStats.mtime) {
          return;
        }
      }

      const webpBuffer = await imageProcessor
        .webp({ quality: this.optimization.imageQuality, effort: 6 })
        .toBuffer();
      
      await writeFile(webpPath, webpBuffer);
      logger.debug(`Generated WebP version: ${webpPath}`);
    } catch (error) {
      logger.error(`Error generating WebP version for ${originalPath}: ${(error as Error).message}`);
    }
  }

  /**
   * Add lazy loading attributes to images in HTML content
   */
  async addLazyLoading(htmlContent: string): Promise<string> {
    if (!this.optimization.lazyLoading) {
      return htmlContent;
    }

    try {
      // Simple regex-based lazy loading implementation
      // In a production system, you might want to use a proper HTML parser
      let processedHtml = htmlContent;

      // Add loading="lazy" to img tags that don't already have it
      processedHtml = processedHtml.replace(
        /<img(?![^>]*loading=)([^>]*?)>/gi,
        '<img$1 loading="lazy">'
      );

      // Add decoding="async" for better performance
      processedHtml = processedHtml.replace(
        /<img(?![^>]*decoding=)([^>]*?)>/gi,
        '<img$1 decoding="async">'
      );

      // Add width and height attributes if missing (helps prevent layout shift)
      processedHtml = await this.addImageDimensions(processedHtml);

      return processedHtml;
    } catch (error) {
      logger.error(`Error adding lazy loading: ${(error as Error).message}`);
      return htmlContent;
    }
  }

  /**
   * Add responsive image srcset attributes
   */
  async addResponsiveImages(htmlContent: string): Promise<string> {
    try {
      // Find all img tags with src attributes
      const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
      let processedHtml = htmlContent;
      let match;

      while ((match = imgRegex.exec(htmlContent)) !== null) {
        const fullMatch = match[0];
        const srcPath = match[1];
        
        // Skip external images or missing srcPath
        if (!srcPath || srcPath.startsWith('http') || srcPath.startsWith('//')) {
          continue;
        }

        // Generate responsive variants
        const responsiveImg = await this.generateResponsiveImageTag(fullMatch, srcPath);
        if (responsiveImg !== fullMatch) {
          processedHtml = processedHtml.replace(fullMatch, responsiveImg);
        }
      }

      return processedHtml;
    } catch (error) {
      logger.error(`Error adding responsive images: ${(error as Error).message}`);
      return htmlContent;
    }
  }

  /**
   * Generate responsive image tag with srcset
   */
  private async generateResponsiveImageTag(originalTag: string, srcPath: string): Promise<string> {
    try {
      const imagePath = join(this.outputDir, srcPath.replace(/^\//, ''));
      
      if (!existsSync(imagePath)) {
        return originalTag;
      }

      const image = sharp(imagePath);
      const metadata = await image.metadata();
      
      if (!metadata.width || !metadata.height) {
        return originalTag;
      }

      // Generate different sizes (but don't upscale)
      const sizes = [480, 768, 1024, 1280, 1920].filter(size => size <= (metadata.width || 0));
      const srcsetEntries: string[] = [];
      
      for (const size of sizes) {
        const resizedPath = srcPath.replace(/(\.[^.]+)$/, `_${size}w$1`);
        const resizedImagePath = join(this.outputDir, resizedPath.replace(/^\//, ''));
        
        // Generate resized image if it doesn't exist
        if (!existsSync(resizedImagePath)) {
          await this.ensureDir(resizedImagePath);
          await image
            .resize(size, null, { withoutEnlargement: true })
            .toFile(resizedImagePath);
        }
        
        srcsetEntries.push(`${resizedPath} ${size}w`);
      }
      
      // Add WebP versions to srcset if available
      const webpPath = srcPath.replace(/\.[^.]+$/, '.webp');
      const webpImagePath = join(this.outputDir, webpPath.replace(/^\//, ''));
      
      if (existsSync(webpImagePath)) {
        // Create picture element with WebP source
        const webpSrcset = srcsetEntries
          .map(entry => entry.replace(/\.[^.]+(\s+\d+w)$/, '.webp$1'))
          .join(', ');
        
        const fallbackSrcset = srcsetEntries.join(', ');
        
        return `<picture>
          <source type="image/webp" srcset="${webpSrcset}" sizes="(max-width: 768px) 100vw, (max-width: 1024px) 75vw, 50vw">
          ${originalTag.replace(/<img/, '<img srcset="' + fallbackSrcset + '"')}
        </picture>`;
      } else if (srcsetEntries.length > 0) {
        // Just add srcset to existing img tag
        const srcset = srcsetEntries.join(', ');
        return originalTag.replace(/<img/, `<img srcset="${srcset}"`);
      }
      
      return originalTag;
    } catch (error) {
      logger.error(`Error generating responsive image tag for ${srcPath}: ${(error as Error).message}`);
      return originalTag;
    }
  }

  /**
   * Add width and height attributes to images
   */
  private async addImageDimensions(htmlContent: string): Promise<string> {
    try {
      const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
      let processedHtml = htmlContent;
      let match;

      while ((match = imgRegex.exec(htmlContent)) !== null) {
        const fullMatch = match[0];
        const srcPath = match[1];
        
        // Skip if width and height are already present
        if (fullMatch.includes('width=') && fullMatch.includes('height=')) {
          continue;
        }
        
        // Skip external images or missing srcPath
        if (!srcPath || srcPath.startsWith('http') || srcPath.startsWith('//')) {
          continue;
        }

        const imagePath = join(this.outputDir, srcPath.replace(/^\//, ''));
        
        if (existsSync(imagePath)) {
          try {
            const metadata = await sharp(imagePath).metadata();
            if (metadata?.width && metadata?.height) {
              const updatedTag = fullMatch.replace(
                /<img/,
                `<img width="${metadata.width}" height="${metadata.height}"`
              );
              processedHtml = processedHtml.replace(fullMatch, updatedTag);
            }
          } catch (error) {
            // Skip this image if we can't read its metadata
            continue;
          }
        }
      }

      return processedHtml;
    } catch (error) {
      logger.error(`Error adding image dimensions: ${(error as Error).message}`);
      return htmlContent;
    }
  }

  /**
   * Find all image files in the output directory
   */
  private async findImageFiles(): Promise<string[]> {
    const imageFiles: string[] = [];
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    
    async function scanDirectory(dir: string): Promise<void> {
      try {
        const { readdir } = await import('fs/promises');
        const entries = await readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          
          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase();
            if (imageExtensions.includes(ext)) {
              imageFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Directory might not exist or be accessible
        logger.debug(`Could not scan directory ${dir}: ${(error as Error).message}`);
      }
    }
    
    await scanDirectory(this.outputDir);
    return imageFiles;
  }

  /**
   * Generate critical CSS for above-the-fold content
   */
  async generateCriticalCSS(htmlContent: string, cssPath: string): Promise<string> {
    // This is a simplified implementation
    // In a production system, you might use tools like Puppeteer + critical
    try {
      if (!existsSync(cssPath)) {
        return '';
      }

      const cssContent = await readFile(cssPath, 'utf-8');
      
      // Extract classes used in the HTML
      const classRegex = /class="([^"]+)"/g;
      const usedClasses = new Set<string>();
      let match;
      
      while ((match = classRegex.exec(htmlContent)) !== null) {
        const classes = match[1]?.split(/\s+/) || [];
        classes.forEach(cls => usedClasses.add(cls));
      }
      
      // Extract CSS rules for used classes (simplified)
      const criticalRules: string[] = [];
      const cssRules = cssContent.split('}');
      
      for (const rule of cssRules) {
        if (rule.trim()) {
          const [selector, declarations] = rule.split('{');
          if (selector && declarations) {
            // Check if this rule applies to any used classes
            const selectorClasses = selector.match(/\.[a-zA-Z][\w-]*/g) || [];
            const hasUsedClass = selectorClasses.some(cls => 
              usedClasses.has(cls.substring(1)) // Remove the dot
            );
            
            if (hasUsedClass || selector.includes('body') || selector.includes('html')) {
              criticalRules.push(rule.trim() + '}');
            }
          }
        }
      }
      
      return criticalRules.join('\n');
    } catch (error) {
      logger.error(`Error generating critical CSS: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * Get performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    totalImages: number;
    optimizedImages: number;
    webpImages: number;
    averageImageSize: number;
    totalImageSize: number;
    estimatedSavings: number;
  }> {
    try {
      const imageFiles = await this.findImageFiles();
      let totalSize = 0;
      let webpCount = 0;
      
      for (const imagePath of imageFiles) {
        const stats = await stat(imagePath);
        totalSize += stats.size;
        
        if (imagePath.endsWith('.webp')) {
          webpCount++;
        }
      }
      
      const averageSize = imageFiles.length > 0 ? totalSize / imageFiles.length : 0;
      
      // Estimate savings (rough calculation)
      const estimatedSavings = totalSize * 0.3; // Assume 30% average savings from optimization
      
      return {
        totalImages: imageFiles.length,
        optimizedImages: imageFiles.length, // Assume all are optimized after processing
        webpImages: webpCount,
        averageImageSize: Math.round(averageSize),
        totalImageSize: totalSize,
        estimatedSavings: Math.round(estimatedSavings),
      };
    } catch (error) {
      logger.error(`Error getting performance metrics: ${(error as Error).message}`);
      return {
        totalImages: 0,
        optimizedImages: 0,
        webpImages: 0,
        averageImageSize: 0,
        totalImageSize: 0,
        estimatedSavings: 0,
      };
    }
  }

  /**
   * Helper methods
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Update optimization settings
   */
  updateOptimization(optimization: Record<string, unknown>): void {
    this.optimization = { ...this.optimization, ...optimization };
    logger.info('Performance optimization settings updated', this.optimization);
  }
}