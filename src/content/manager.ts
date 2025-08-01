import { readFile, readdir } from 'fs/promises';
import { join, extname } from 'path';
import { BlogPost, BlogPage, BlogConfig } from '../types/index.js';
import { ContentParser } from './parser.js';
import { validatePath } from '../utils/helpers.js';

export class ContentManager {
  private parser: ContentParser;
  private config: BlogConfig;

  constructor(config: BlogConfig, isProduction?: boolean) {
    this.config = config;
    this.parser = new ContentParser(config.build.baseUrl, isProduction);
  }

  async loadPosts(): Promise<BlogPost[]> {
    const postsDir = join(this.config.build.inputDir, 'posts');
    const postFiles = await this.findMarkdownFiles(postsDir);
    
    const posts = await Promise.all(
      postFiles.map(file => this.loadPost(file))
    );

    return posts
      .filter(post => post !== null)
      .filter(post => !post.frontmatter.draft || this.config.build.includeDrafts)
      .sort((a, b) => {
        // Pinned posts come first
        if (a.frontmatter.pinned && !b.frontmatter.pinned) return -1;
        if (!a.frontmatter.pinned && b.frontmatter.pinned) return 1;
        // Within pinned or non-pinned posts, sort by date descending
        return new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime();
      }) as BlogPost[];
  }

  async loadPages(): Promise<BlogPage[]> {
    const pagesDir = join(this.config.build.inputDir, 'pages');
    
    try {
      const pageFiles = await this.findMarkdownFiles(pagesDir);
      const pages = await Promise.all(
        pageFiles.map(file => this.loadPage(file))
      );
      
      return pages.filter(page => page !== null) as BlogPage[];
    } catch (error) {
      console.warn('Pages directory not found, skipping pages loading');
      return [];
    }
  }

  private async loadPost(filePath: string): Promise<BlogPost | null> {
    try {
      if (!validatePath(filePath)) {
        console.warn(`Skipping invalid path: ${filePath}`);
        return null;
      }

      const content = await readFile(filePath, 'utf-8');
      return await this.parser.parsePost(content, filePath);
    } catch (error) {
      console.error(`Error loading post ${filePath}:`, error);
      return null;
    }
  }

  private async loadPage(filePath: string): Promise<BlogPage | null> {
    try {
      if (!validatePath(filePath)) {
        console.warn(`Skipping invalid path: ${filePath}`);
        return null;
      }

      const content = await readFile(filePath, 'utf-8');
      const post = await this.parser.parsePost(content, filePath);
      
      return {
        id: post.id,
        slug: post.slug,
        title: post.title,
        content: post.content,
        frontmatter: {
          title: post.frontmatter.title,
          description: post.frontmatter.description || 'No description',
          layout: (post.frontmatter.layout as string) || 'page',
        },
        metadata: post.metadata,
        filePath,
      };
    } catch (error) {
      console.error(`Error loading page ${filePath}:`, error);
      return null;
    }
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findMarkdownFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && extname(entry.name) === '.md') {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`Could not read directory ${dir}:`, error);
    }
    
    return files;
  }

  async getPostBySlug(slug: string): Promise<BlogPost | null> {
    const posts = await this.loadPosts();
    return posts.find(post => post.slug === slug) || null;
  }

  async getPostsByTag(tag: string): Promise<BlogPost[]> {
    const posts = await this.loadPosts();
    return posts.filter(post => post.frontmatter.tags.includes(tag));
  }

  async getPostsByCategory(category: string): Promise<BlogPost[]> {
    const posts = await this.loadPosts();
    return posts.filter(post => post.frontmatter.categories.includes(category));
  }

  async getAllTags(): Promise<string[]> {
    const posts = await this.loadPosts();
    const allTags = posts.flatMap(post => post.frontmatter.tags);
    return [...new Set(allTags)].sort();
  }

  async getAllCategories(): Promise<string[]> {
    const posts = await this.loadPosts();
    const allCategories = posts.flatMap(post => post.frontmatter.categories);
    return [...new Set(allCategories)].sort();
  }
}