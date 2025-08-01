import { promises as fs } from 'fs';
import { join } from 'path';
import type { BlogConfig, BlogPost, BlogPage } from '../../src/types/index.js';

/**
 * Test utilities for fyer-blog-template
 */

/**
 * Create a test blog configuration
 */
export function createTestConfig(overrides: Partial<BlogConfig> = {}): BlogConfig {
  const testDir = process.env.TEST_DIR || '/tmp/test';
  
  return {
    site: {
      title: 'Test Blog',
      description: 'A test blog for unit testing',
      url: 'https://test.example.com',
      author: {
        name: 'Test Author',
        email: 'test@example.com'
      },
      language: 'en',
      timezone: 'UTC'
    },
    build: {
      inputDir: join(testDir, 'content'),
      outputDir: join(testDir, 'dist'),
      baseUrl: '/',
      includeDrafts: false,
      optimization: {
        minifyHTML: true,
        minifyCSS: true,
        minifyJS: true,
        optimizeImages: true,
        generateWebP: false, // Disable for tests
        generateSitemap: true,
        generateRSS: true
      }
    },
    theme: {
      name: 'default',
      customization: {}
    },
    feed: {
      rss: {
        enabled: true,
        filename: 'rss.xml',
        maxItems: 20
      },
      atom: {
        enabled: false,
        filename: 'atom.xml',
        maxItems: 20
      },
      json: {
        enabled: false,
        filename: 'feed.json',
        maxItems: 20
      }
    },
    ...overrides
  };
}

/**
 * Create test blog post
 */
export function createTestPost(overrides: Partial<BlogPost> = {}): BlogPost {
  const defaultPost: BlogPost = {
    id: 'test-post-1',
    slug: 'test-post-1',
    title: 'Test Post 1',
    content: '# Test Post\\n\\nThis is a test post with some content.',
    excerpt: 'This is a test post with some content.',
    frontmatter: {
      title: 'Test Post 1',
      date: new Date('2024-01-15T10:00:00Z'),
      tags: ['test', 'blog'],
      categories: ['general'],
      draft: false
    },
    metadata: {
      wordCount: 10,
      readingTime: 1,
      lastModified: new Date('2024-01-15T10:00:00Z'),
      checksum: 'test-checksum'
    },
    filePath: '/test/path/test-post-1.md'
  };

  return { ...defaultPost, ...overrides };
}

/**
 * Create test blog page
 */
export function createTestPage(overrides: Partial<BlogPage> = {}): BlogPage {
  const defaultPage: BlogPage = {
    id: 'test-page-1',
    slug: 'test-page-1',
    title: 'Test Page 1',
    content: '# Test Page\\n\\nThis is a test page.',
    frontmatter: {
      title: 'Test Page 1',
      description: 'A test page'
    },
    metadata: {
      wordCount: 8,
      readingTime: 1,
      lastModified: new Date('2024-01-15T10:00:00Z'),
      checksum: 'test-checksum-page'
    },
    filePath: '/test/path/test-page-1.md'
  };

  return { ...defaultPage, ...overrides };
}

/**
 * Create test directory structure
 */
export async function createTestStructure(baseDir: string): Promise<void> {
  const dirs = [
    'content/posts/2024/01',
    'content/pages',
    'content/assets/images',
    'dist',
    'config'
  ];

  for (const dir of dirs) {
    await fs.mkdir(join(baseDir, dir), { recursive: true });
  }
}

/**
 * Create test markdown files
 */
export async function createTestContent(baseDir: string): Promise<void> {
  // Create test post
  const postContent = `---
title: \"Sample Blog Post\"
date: 2024-01-15T10:00:00Z
tags: [\"javascript\", \"web-development\"]
categories: [\"programming\"]
description: \"A sample blog post for testing\"
---

# Sample Blog Post

This is a sample blog post with some **markdown** content.

## Code Example

\`\`\`javascript
function hello() {
  console.log('Hello, world!');
}
\`\`\`

## List Example

- Item 1
- Item 2
- Item 3

That's it for this test post!`;

  await fs.writeFile(
    join(baseDir, 'content/posts/2024/01/sample-blog-post.md'),
    postContent
  );

  // Create test page
  const pageContent = `---
title: \"About Page\"
description: \"About this blog\"
---

# About

This is the about page for the test blog.`;

  await fs.writeFile(
    join(baseDir, 'content/pages/about.md'),
    pageContent
  );

  // Create blog config
  const config = createTestConfig({
    build: {
      inputDir: join(baseDir, 'content'),
      outputDir: join(baseDir, 'dist'),
      baseUrl: '/',
      includeDrafts: false,
      optimization: {
        minifyHTML: false, // Disable for easier testing
        minifyCSS: false,
        minifyJS: false,
        optimizeImages: false,
        generateWebP: false,
        generateSitemap: true,
        generateRSS: true
      }
    },
    feed: {
      rss: {
        enabled: true,
        filename: 'rss.xml',
        maxItems: 20
      },
      atom: {
        enabled: false,
        filename: 'atom.xml',
        maxItems: 20
      },
      json: {
        enabled: false,
        filename: 'feed.json',
        maxItems: 20
      }
    }
  });

  await fs.writeFile(
    join(baseDir, 'config/blog.config.json'),
    JSON.stringify(config, null, 2)
  );
}

/**
 * Read file content as string
 */
export async function readTestFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8');
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all files in directory recursively
 */
export async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await scan(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }
  
  await scan(dir);
  return files;
}

/**
 * Cleanup test directory
 */
export async function cleanupTest(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore cleanup errors
  }
}