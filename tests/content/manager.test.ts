import { describe, it, expect, beforeEach } from 'vitest';
import { ContentManager } from '../../src/content/manager.js';
import { createTestConfig, createTestStructure, createTestContent } from '../utils/test-helpers.js';

describe('ContentManager', () => {
  let contentManager: ContentManager;
  let testDir: string;

  beforeEach(async () => {
    testDir = process.env.TEST_DIR!;
    await createTestStructure(testDir);
    await createTestContent(testDir);

    const config = createTestConfig();
    contentManager = new ContentManager(config);
  });

  describe('loadPosts', () => {
    it('should load blog posts from content directory', async () => {
      const posts = await contentManager.loadPosts();
      
      expect(posts).toHaveLength(1);
      expect(posts[0].title).toBe('Sample Blog Post');
      expect(posts[0].frontmatter.tags).toContain('javascript');
      expect(posts[0].frontmatter.categories).toContain('programming');
    });

    it('should exclude draft posts by default', async () => {
      // Create a draft post
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      
      const draftContent = `---
title: \"Draft Post\"
date: 2024-01-16T10:00:00Z
draft: true
---

This is a draft post.`;

      await fs.writeFile(
        join(testDir, 'content/posts/2024/01/draft-post.md'),
        draftContent
      );

      const posts = await contentManager.loadPosts();
      expect(posts).toHaveLength(1); // Should only have the non-draft post
      expect(posts[0].title).toBe('Sample Blog Post');
    });

    it('should include drafts when configured', async () => {
      const config = createTestConfig({
        build: {
          ...createTestConfig().build,
          includeDrafts: true
        }
      });
      
      const managerWithDrafts = new ContentManager(config);
      
      // Create a draft post
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      
      const draftContent = `---
title: \"Draft Post\"
date: 2024-01-16T10:00:00Z
draft: true
---

This is a draft post.`;

      await fs.writeFile(
        join(testDir, 'content/posts/2024/01/draft-post.md'),
        draftContent
      );

      const posts = await managerWithDrafts.loadPosts();
      expect(posts).toHaveLength(2);
      
      const draftPost = posts.find(p => p.title === 'Draft Post');
      expect(draftPost).toBeDefined();
      expect(draftPost?.frontmatter.draft).toBe(true);
    });

    it('should sort posts by date descending', async () => {
      // Create additional posts with different dates
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      
      const newerPost = `---
title: \"Newer Post\"
date: 2024-01-20T10:00:00Z
---

Newer post content.`;

      const olderPost = `---
title: \"Older Post\"
date: 2024-01-10T10:00:00Z
---

Older post content.`;

      await fs.writeFile(
        join(testDir, 'content/posts/2024/01/newer-post.md'),
        newerPost
      );
      
      await fs.writeFile(
        join(testDir, 'content/posts/2024/01/older-post.md'),
        olderPost
      );

      const posts = await contentManager.loadPosts();
      expect(posts).toHaveLength(3);
      
      // Should be sorted by date descending
      expect(posts[0].title).toBe('Newer Post');
      expect(posts[1].title).toBe('Sample Blog Post');
      expect(posts[2].title).toBe('Older Post');
    });
  });

  describe('loadPages', () => {
    it('should load blog pages from content directory', async () => {
      const pages = await contentManager.loadPages();
      
      expect(pages).toHaveLength(1);
      expect(pages[0].title).toBe('About Page');
      expect(pages[0].frontmatter.description).toBe('About this blog');
    });

    it('should handle empty pages directory', async () => {
      // Remove the about page
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      
      await fs.unlink(join(testDir, 'content/pages/about.md'));
      
      const pages = await contentManager.loadPages();
      expect(pages).toHaveLength(0);
    });
  });

  describe('getPostBySlug', () => {
    it('should find post by slug', async () => {
      const post = await contentManager.getPostBySlug('sample-blog-post');
      
      expect(post).toBeDefined();
      expect(post!.title).toBe('Sample Blog Post');
    });

    it('should return null for non-existent slug', async () => {
      const post = await contentManager.getPostBySlug('non-existent-post');
      expect(post).toBeNull();
    });
  });

  describe('getAllTags', () => {
    it('should return all unique tags from posts', async () => {
      const tags = await contentManager.getAllTags();
      
      expect(tags).toContain('javascript');
      expect(tags).toContain('web-development');
      expect(tags).toHaveLength(2);
    });

    it('should return empty array when no posts exist', async () => {
      // Remove all posts
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      
      await fs.rm(join(testDir, 'content/posts'), { recursive: true, force: true });
      await fs.mkdir(join(testDir, 'content/posts'), { recursive: true });
      
      const tags = await contentManager.getAllTags();
      expect(tags).toHaveLength(0);
    });
  });

  describe('getAllCategories', () => {
    it('should return all unique categories from posts', async () => {
      const categories = await contentManager.getAllCategories();
      
      expect(categories).toContain('programming');
      expect(categories).toHaveLength(1);
    });
  });
});