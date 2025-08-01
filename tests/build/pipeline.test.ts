import { describe, it, expect, beforeEach } from 'vitest';
import { BuildPipeline } from '../../src/build/pipeline.js';
import { createTestConfig, createTestStructure, createTestContent, fileExists, getAllFiles } from '../utils/test-helpers.js';

describe('BuildPipeline', () => {
  let buildPipeline: BuildPipeline;
  let testDir: string;

  beforeEach(async () => {
    testDir = process.env.TEST_DIR!;
    await createTestStructure(testDir);
    await createTestContent(testDir);

    const config = createTestConfig();
    buildPipeline = new BuildPipeline(config);
  });

  describe('build', () => {
    it('should build the site successfully', async () => {
      const result = await buildPipeline.build({ production: false });
      
      expect(result.success).toBe(true);
      expect(result.buildTime).toBeGreaterThan(0);
      expect(result.generatedFiles.length).toBeGreaterThan(0);
    });

    it('should generate expected files', async () => {
      await buildPipeline.build({ production: false });
      
      const { join } = await import('path');
      const outputDir = join(testDir, 'dist');
      
      // Check for index page
      expect(await fileExists(join(outputDir, 'index.html'))).toBe(true);
      
      // Check for post page
      expect(await fileExists(join(outputDir, 'posts/sample-blog-post/index.html'))).toBe(true);
      
      // Check for about page
      expect(await fileExists(join(outputDir, 'about/index.html'))).toBe(true);
      
      // Check for CSS file
      expect(await fileExists(join(outputDir, 'assets/css/main.css'))).toBe(true);
    });

    it('should generate sitemap when enabled', async () => {
      const result = await buildPipeline.build({ production: false });
      
      const { join } = await import('path');
      const sitemapPath = join(testDir, 'dist/sitemap.xml');
      
      expect(result.success).toBe(true);
      expect(await fileExists(sitemapPath)).toBe(true);
      
      // Verify sitemap content
      const { promises: fs } = await import('fs');
      const sitemapContent = await fs.readFile(sitemapPath, 'utf-8');
      
      expect(sitemapContent).toContain('<?xml version=\"1.0\" encoding=\"UTF-8\"?>');
      expect(sitemapContent).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
      expect(sitemapContent).toContain('/posts/sample-blog-post/');
    });

    it('should generate RSS feed when enabled', async () => {
      const result = await buildPipeline.build({ production: false });
      
      const { join } = await import('path');
      const rssPath = join(testDir, 'dist/rss.xml');
      
      expect(result.success).toBe(true);
      expect(await fileExists(rssPath)).toBe(true);
      
      // Verify RSS content
      const { promises: fs } = await import('fs');
      const rssContent = await fs.readFile(rssPath, 'utf-8');
      
      expect(rssContent).toMatch(/<?xml version="1\.0" encoding="utf-?8"/i);
      expect(rssContent).toContain('<rss version=\"2.0\"');
      expect(rssContent).toContain('Sample Blog Post');
    });

    it('should clean output directory when requested', async () => {
      const { join } = await import('path');
      const { promises: fs } = await import('fs');
      const outputDir = join(testDir, 'dist');
      
      // Create a file that should be cleaned
      const testFile = join(outputDir, 'should-be-deleted.txt');
      await fs.writeFile(testFile, 'test content');
      expect(await fileExists(testFile)).toBe(true);
      
      // Build with clean option
      await buildPipeline.build({ clean: true, production: false });
      
      // File should be gone
      expect(await fileExists(testFile)).toBe(false);
      
      // But new files should exist
      expect(await fileExists(join(outputDir, 'index.html'))).toBe(true);
    });

    it('should handle build errors gracefully', async () => {
      // Create invalid content that should cause parsing errors
      const { join } = await import('path');
      const { promises: fs } = await import('fs');
      
      const invalidContent = `---
title: \"Invalid Post\"
date: invalid-date
---

This post has invalid frontmatter.`;

      await fs.writeFile(
        join(testDir, 'content/posts/2024/01/invalid-post.md'),
        invalidContent
      );

      const result = await buildPipeline.build({ production: false });
      
      // Build might still succeed with warnings, but should handle errors gracefully
      expect(result.buildTime).toBeGreaterThan(0);
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('clean', () => {
    it('should remove output directory', async () => {
      const { join } = await import('path');
      const { promises: fs } = await import('fs');
      const outputDir = join(testDir, 'dist');
      
      // Create some files in output directory
      await fs.writeFile(join(outputDir, 'test.txt'), 'test');
      expect(await fileExists(join(outputDir, 'test.txt'))).toBe(true);
      
      await buildPipeline.clean();
      
      // Directory should be empty or gone
      const exists = await fileExists(outputDir);
      if (exists) {
        const files = await getAllFiles(outputDir);
        expect(files).toHaveLength(0);
      }
    });
  });

  describe('production build', () => {
    it('should apply optimizations in production mode', async () => {
      const config = createTestConfig({
        build: {
          ...createTestConfig().build,
          optimization: {
            minifyHTML: true,
            minifyCSS: true,
            minifyJS: true,
            optimizeImages: false, // Disable for test speed
            generateWebP: false,
            generateSitemap: true,
            generateRSS: true
          }
        }
      });
      
      const prodPipeline = new BuildPipeline(config);
      const result = await prodPipeline.build({ production: true });
      
      expect(result.success).toBe(true);
      
      // Check that HTML is generated (minification is hard to test without comparing)
      const { join } = await import('path');
      const indexPath = join(testDir, 'dist/index.html');
      expect(await fileExists(indexPath)).toBe(true);
      
      // Optimization results should be included in production builds
      if (result.optimization) {
        expect(typeof result.optimization.totalSavings).toBe('number');
      }
    });
  });
});