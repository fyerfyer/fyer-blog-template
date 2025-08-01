import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { DraftPost, PostFrontmatter } from '../types/index.js';
import { ContentManager } from './manager.js';
import { logger } from '../utils/logger.js';

/**
 * DraftManager handles draft post management, scheduling, and publishing
 */
export class DraftManager {
  private contentManager: ContentManager;
  private draftDir: string;

  constructor(contentManager: ContentManager, inputDir: string) {
    this.contentManager = contentManager;
    this.draftDir = join(inputDir, 'drafts');
  }

  /**
   * Get all draft posts
   */
  async getDrafts(): Promise<DraftPost[]> {
    try {
      if (!existsSync(this.draftDir)) {
        await mkdir(this.draftDir, { recursive: true });
        return [];
      }

      const files = await readdir(this.draftDir, { recursive: true });
      const markdownFiles = files.filter(file => file.endsWith('.md'));
      
      const drafts = await Promise.all(
        markdownFiles.map(async (file) => {
          const filePath = join(this.draftDir, file);
          return this.loadDraft(filePath);
        })
      );

      return drafts.filter(draft => draft !== null) as DraftPost[];
    } catch (error) {
      logger.error(`Error loading drafts: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Load a single draft post
   */
  async loadDraft(filePath: string): Promise<DraftPost | null> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const { data, content: postContent } = matter(content);
      
      const frontmatter = data as PostFrontmatter & {
        scheduledDate?: string;
        publishStatus?: 'draft' | 'scheduled' | 'published';
        lastPreview?: string;
      };

      // Parse the post manually since parsePost doesn't exist
      const slug = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
      const metadata = {
        wordCount: postContent.split(/\s+/).length,
        readingTime: Math.ceil(postContent.split(/\s+/).length / 200),
        lastModified: new Date(),
        checksum: Buffer.from(content).toString('base64').slice(0, 8),
      };

      const basePost = {
        id: slug,
        slug,
        title: frontmatter.title || 'Untitled',
        content: postContent,
        excerpt: postContent.substring(0, 150) + '...',
        frontmatter: frontmatter as PostFrontmatter,
        metadata,
        filePath,
      };

      const draft: DraftPost = {
        ...basePost,
        publishStatus: frontmatter.publishStatus || 'draft',
      };

      if (frontmatter.scheduledDate) {
        draft.scheduledDate = new Date(frontmatter.scheduledDate);
      }
      
      if (frontmatter.lastPreview) {
        draft.lastPreview = new Date(frontmatter.lastPreview);
      }

      return draft;
    } catch (error) {
      logger.error(`Error loading draft from ${filePath}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Create a new draft post
   */
  async createDraft(title: string, content: string = '', scheduledDate?: Date): Promise<string> {
    try {
      const slug = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const filename = `${slug}.md`;
      const filePath = join(this.draftDir, filename);

      if (!existsSync(this.draftDir)) {
        await mkdir(this.draftDir, { recursive: true });
      }

      const frontmatter = {
        title,
        date: new Date().toISOString(),
        tags: [],
        categories: [],
        draft: true,
        publishStatus: 'draft' as const,
        ...(scheduledDate && { scheduledDate: scheduledDate.toISOString() })
      };

      const fileContent = matter.stringify(content, frontmatter);
      await writeFile(filePath, fileContent, 'utf-8');

      logger.info(`Draft created: ${filename}`);
      return filePath;
    } catch (error) {
      logger.error(`Error creating draft: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Schedule a draft for future publishing
   */
  async scheduleDraft(draftPath: string, scheduledDate: Date): Promise<void> {
    try {
      const content = await readFile(draftPath, 'utf-8');
      const parsed = matter(content);
      
      parsed.data.scheduledDate = scheduledDate.toISOString();
      parsed.data.publishStatus = 'scheduled';
      
      const updatedContent = matter.stringify(parsed.content, parsed.data);
      await writeFile(draftPath, updatedContent, 'utf-8');
      
      logger.info(`Draft scheduled for ${scheduledDate.toISOString()}: ${draftPath}`);
    } catch (error) {
      logger.error(`Error scheduling draft: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Publish a draft to the posts directory
   */
  async publishDraft(draftPath: string, targetDir?: string): Promise<string> {
    try {
      const content = await readFile(draftPath, 'utf-8');
      const parsed = matter(content);
      
      // Update frontmatter for publication
      parsed.data.draft = false;
      parsed.data.publishStatus = 'published';
      parsed.data.date = new Date().toISOString();
      delete parsed.data.scheduledDate;
      
      // Determine target path
      const publishDate = new Date();
      const year = publishDate.getFullYear();
      const month = String(publishDate.getMonth() + 1).padStart(2, '0');
      
      const postsDir = targetDir || join(dirname(this.draftDir), 'posts');
      const targetPath = join(postsDir, year.toString(), month, `${this.getSlugFromPath(draftPath)}.md`);
      
      // Ensure target directory exists
      await mkdir(dirname(targetPath), { recursive: true });
      
      // Write published post
      const publishedContent = matter.stringify(parsed.content, parsed.data);
      await writeFile(targetPath, publishedContent, 'utf-8');
      
      logger.info(`Draft published: ${draftPath} -> ${targetPath}`);
      return targetPath;
    } catch (error) {
      logger.error(`Error publishing draft: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get scheduled drafts ready for publishing
   */
  async getScheduledDrafts(): Promise<DraftPost[]> {
    const drafts = await this.getDrafts();
    const now = new Date();
    
    return drafts.filter(draft => 
      draft.publishStatus === 'scheduled' &&
      draft.scheduledDate &&
      draft.scheduledDate <= now
    );
  }

  /**
   * Auto-publish scheduled drafts
   */
  async processScheduledDrafts(): Promise<string[]> {
    try {
      const scheduledDrafts = await this.getScheduledDrafts();
      const publishedPaths: string[] = [];
      
      for (const draft of scheduledDrafts) {
        try {
          const publishedPath = await this.publishDraft(draft.filePath);
          publishedPaths.push(publishedPath);
        } catch (error) {
          logger.error(`Failed to publish scheduled draft ${draft.filePath}: ${(error as Error).message}`);
        }
      }
      
      if (publishedPaths.length > 0) {
        logger.info(`Published ${publishedPaths.length} scheduled drafts`);
      }
      
      return publishedPaths;
    } catch (error) {
      logger.error(`Error processing scheduled drafts: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Preview a draft (update last preview timestamp)
   */
  async previewDraft(draftPath: string): Promise<void> {
    try {
      const content = await readFile(draftPath, 'utf-8');
      const parsed = matter(content);
      
      parsed.data.lastPreview = new Date().toISOString();
      
      const updatedContent = matter.stringify(parsed.content, parsed.data);
      await writeFile(draftPath, updatedContent, 'utf-8');
    } catch (error) {
      logger.error(`Error updating draft preview: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get draft statistics
   */
  async getDraftStats(): Promise<{
    total: number;
    scheduled: number;
    drafts: number;
    oldestDraft: Date | null;
    newestDraft: Date | null;
  }> {
    const drafts = await this.getDrafts();
    
    const scheduled = drafts.filter(d => d.publishStatus === 'scheduled').length;
    const draftCount = drafts.filter(d => d.publishStatus === 'draft').length;
    
    const dates = drafts.map(d => d.frontmatter.date).filter(Boolean).sort();
    
    return {
      total: drafts.length,
      scheduled,
      drafts: draftCount,
      oldestDraft: dates.length > 0 ? (dates[0] || null) : null,
      newestDraft: dates.length > 0 ? (dates[dates.length - 1] || null) : null,
    };
  }

  private getSlugFromPath(filePath: string): string {
    const filename = filePath.split('/').pop() || '';
    return filename.replace(/\.md$/, '');
  }
}