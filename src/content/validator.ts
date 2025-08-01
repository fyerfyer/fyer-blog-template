import { readFile } from 'fs/promises';
import matter from 'gray-matter';
import { BlogConfig, BlogPost, BlogPage } from '../types/index.js';
import { ContentManager } from './manager.js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalFiles: number;
}

export class ContentValidator {
  private config: BlogConfig;
  private contentManager: ContentManager;

  constructor(config: BlogConfig) {
    this.config = config;
    this.contentManager = new ContentManager(config);
  }

  async validateAll(strict = false): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      totalFiles: 0,
    };

    try {
      await this.validateConfiguration(result);
      await this.validateContent(result, strict);
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation failed: ${error}`);
    }

    return result;
  }

  private async validateConfiguration(result: ValidationResult): Promise<void> {
    if (!this.config.site.title) {
      result.errors.push('Site title is required');
      result.isValid = false;
    }

    if (!this.config.site.url) {
      result.errors.push('Site URL is required');
      result.isValid = false;
    }

    if (!this.config.site.author.name) {
      result.errors.push('Author name is required');
      result.isValid = false;
    }

    if (!this.config.build.inputDir || !this.config.build.outputDir) {
      result.errors.push('Input and output directories are required');
      result.isValid = false;
    }

    try {
      new URL(this.config.site.url);
    } catch {
      result.errors.push('Site URL must be a valid URL');
      result.isValid = false;
    }
  }

  private async validateContent(result: ValidationResult, strict: boolean): Promise<void> {
    try {
      const posts = await this.contentManager.loadPosts();
      const pages = await this.contentManager.loadPages();
      
      result.totalFiles = posts.length + pages.length;

      for (const post of posts) {
        await this.validatePost(post, result, strict);
      }

      for (const page of pages) {
        await this.validatePage(page, result, strict);
      }

      this.validateUniqueSlugs([...posts, ...pages], result);
    } catch (error) {
      result.errors.push(`Content validation failed: ${error}`);
      result.isValid = false;
    }
  }

  private async validatePost(post: BlogPost, result: ValidationResult, strict: boolean): Promise<void> {
    const filePath = post.filePath;

    if (!post.title || post.title === 'Untitled') {
      if (strict) {
        result.errors.push(`${filePath}: Post title is required`);
        result.isValid = false;
      } else {
        result.warnings.push(`${filePath}: Post has no title`);
      }
    }

    const postDate = new Date(post.frontmatter.date);
    if (!post.frontmatter.date || isNaN(postDate.getTime())) {
      result.errors.push(`${filePath}: Valid date is required`);
      result.isValid = false;
    }

    if (postDate > new Date()) {
      result.warnings.push(`${filePath}: Post date is in the future`);
    }

    if (post.content.length < 100) {
      result.warnings.push(`${filePath}: Post content is very short (${post.content.length} characters)`);
    }

    if (!post.frontmatter.description && strict) {
      result.warnings.push(`${filePath}: Post has no description`);
    }

    if (post.frontmatter.tags.length === 0 && strict) {
      result.warnings.push(`${filePath}: Post has no tags`);
    }

    await this.validateFrontmatter(post.filePath, result);
  }

  private async validatePage(page: BlogPage, result: ValidationResult, strict: boolean): Promise<void> {
    const filePath = page.filePath;

    if (!page.title || page.title === 'Untitled') {
      if (strict) {
        result.errors.push(`${filePath}: Page title is required`);
        result.isValid = false;
      } else {
        result.warnings.push(`${filePath}: Page has no title`);
      }
    }

    if (page.content.length < 50) {
      result.warnings.push(`${filePath}: Page content is very short (${page.content.length} characters)`);
    }

    await this.validateFrontmatter(page.filePath, result);
  }

  private async validateFrontmatter(filePath: string, result: ValidationResult): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { data } = matter(content);

      if (typeof data !== 'object' || data === null) {
        result.errors.push(`${filePath}: Invalid frontmatter format`);
        result.isValid = false;
        return;
      }

      if (data.date && typeof data.date === 'string') {
        const date = new Date(data.date);
        if (isNaN(date.getTime())) {
          result.errors.push(`${filePath}: Invalid date format in frontmatter`);
          result.isValid = false;
        }
      }

      if (data.tags && !Array.isArray(data.tags)) {
        result.errors.push(`${filePath}: Tags must be an array`);
        result.isValid = false;
      }

      if (data.categories && !Array.isArray(data.categories)) {
        result.errors.push(`${filePath}: Categories must be an array`);
        result.isValid = false;
      }

    } catch (error) {
      result.errors.push(`${filePath}: Error reading frontmatter: ${error}`);
      result.isValid = false;
    }
  }

  private validateUniqueSlugs(items: Array<{ slug: string; filePath: string }>, result: ValidationResult): void {
    const slugs = new Map<string, string[]>();

    for (const item of items) {
      if (!slugs.has(item.slug)) {
        slugs.set(item.slug, []);
      }
      slugs.get(item.slug)!.push(item.filePath);
    }

    for (const [slug, files] of slugs) {
      if (files.length > 1) {
        result.errors.push(`Duplicate slug "${slug}" found in: ${files.join(', ')}`);
        result.isValid = false;
      }
    }
  }
}