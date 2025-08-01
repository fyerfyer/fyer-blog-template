import readingTime from 'reading-time';
import { logger } from '../utils/logger.js';
import { generateSlug } from '../utils/helpers.js';
import type { BlogPost, BlogPage, PostMetadata } from '../types/index.js';

/**
 * Enhanced content processor for Phase 2 features
 * Adds syntax highlighting, reading time, excerpts, and metadata
 */
export class ContentEnhancer {

  /**
   * Enhance blog post with additional metadata and processing
   */
  async enhancePost(post: BlogPost): Promise<BlogPost> {
    const startTime = Date.now();
    
    try {
      // Note: post.content is already HTML from the parser, so we don't reprocess it
      
      // Generate enhanced metadata using the original markdown content for analysis
      const metadata = await this.generateMetadata(post.content);
      
      // Generate excerpt if not provided
      let excerpt = post.excerpt;
      if (!excerpt || excerpt.trim() === '') {
        excerpt = this.generateExcerpt(post.content);
      }
      
      // Ensure slug is properly formatted using the standardized helper
      const slug = post.slug && post.slug.trim() !== '' ? post.slug : generateSlug(post.title);
      
      // Extract and categorize tags
      const enhancedTags = this.categorizeTags(post.frontmatter.tags || []);
      
      const enhancedPost: BlogPost = {
        ...post,
        content: post.content, // Keep the HTML content as-is
        excerpt,
        slug,
        metadata: {
          ...post.metadata,
          ...metadata
        },
        frontmatter: {
          ...post.frontmatter,
          tags: enhancedTags
        }
      };
      
      const duration = Date.now() - startTime;
      logger.debug(`Enhanced post "${post.title}"`, { duration: `${duration}ms` });
      
      return enhancedPost;
    } catch (error) {
      logger.error(`Failed to enhance post "${post.title}": ${(error as Error).message}`);
      return post; // Return original post if enhancement fails
    }
  }

  /**
   * Enhance blog page with processing
   */
  async enhancePage(page: BlogPage): Promise<BlogPage> {
    try {
      // Note: page.content is already HTML from the parser, so we don't reprocess it
      const metadata = await this.generateMetadata(page.content);
      
      return {
        ...page,
        content: page.content, // Keep the HTML content as-is
        metadata: {
          ...page.metadata,
          ...metadata
        }
      };
    } catch (error) {
      logger.error(`Failed to enhance page "${page.title}": ${(error as Error).message}`);
      return page;
    }
  }


  /**
   * Generate enhanced metadata
   */
  private async generateMetadata(content: string): Promise<Partial<PostMetadata>> {
    const readingStats = readingTime(content);
    
    return {
      wordCount: readingStats.words,
      readingTime: Math.ceil(readingStats.minutes),
      characterCount: content.length,
      paragraphCount: this.countParagraphs(content),
      headingCount: this.countHeadings(content),
      codeBlockCount: this.countCodeBlocks(content),
      linkCount: this.countLinks(content)
    };
  }

  /**
   * Generate excerpt from content if not provided
   */
  private generateExcerpt(content: string, maxLength: number = 160): string {
    // Remove markdown formatting for excerpt
    const plainText = content
      .replace(/#{1,6}\s+/g, '') // Remove headings
      .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
      .replace(/\*(.*?)\*/g, '$1') // Remove italic
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // Remove links
      .replace(/`(.*?)`/g, '$1') // Remove inline code
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .trim();
    
    if (plainText.length <= maxLength) {
      return plainText;
    }
    
    // Find the last complete sentence within the limit
    const truncated = plainText.substring(0, maxLength);
    const lastSentence = truncated.lastIndexOf('. ');
    
    if (lastSentence > maxLength * 0.6) {
      return truncated.substring(0, lastSentence + 1);
    }
    
    // If no sentence break found, truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace) + '...';
  }


  /**
   * Categorize and normalize tags
   */
  private categorizeTags(tags: string[]): string[] {
    return tags
      .map(tag => tag.toLowerCase().trim())
      .filter(tag => tag.length > 0)
      .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
      .sort();
  }

  /**
   * Count paragraphs in content
   */
  private countParagraphs(content: string): number {
    return content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;
  }

  /**
   * Count headings in content
   */
  private countHeadings(content: string): number {
    const headings = content.match(/^#{1,6}\s+.+$/gm);
    return headings ? headings.length : 0;
  }

  /**
   * Count code blocks in content
   */
  private countCodeBlocks(content: string): number {
    const codeBlocks = content.match(/```[\s\S]*?```/g);
    const inlineCode = content.match(/`[^`\n]+`/g);
    return (codeBlocks ? codeBlocks.length : 0) + (inlineCode ? inlineCode.length : 0);
  }

  /**
   * Count links in content
   */
  private countLinks(content: string): number {
    const links = content.match(/\[.*?\]\(.*?\)/g);
    return links ? links.length : 0;
  }

  /**
   * Extract table of contents from content
   */
  extractTableOfContents(content: string): Array<{ level: number; title: string; slug: string }> {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const toc: Array<{ level: number; title: string; slug: string }> = [];
    let match;
    
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1]?.length || 1;
      const title = match[2]?.trim() || '';
      const slug = generateSlug(title);
      
      toc.push({ level, title, slug });
    }
    
    return toc;
  }

  /**
   * Generate related posts based on tags and categories
   */
  findRelatedPosts(currentPost: BlogPost, allPosts: BlogPost[], limit: number = 3): BlogPost[] {
    const currentTags = new Set(currentPost.frontmatter.tags || []);
    const currentCategories = new Set(currentPost.frontmatter.categories || []);
    
    const scored = allPosts
      .filter(post => post.id !== currentPost.id)
      .map(post => {
        let score = 0;
        const postTags = new Set(post.frontmatter.tags || []);
        const postCategories = new Set(post.frontmatter.categories || []);
        
        // Score based on shared tags
        for (const tag of currentTags) {
          if (postTags.has(tag)) score += 2;
        }
        
        // Score based on shared categories
        for (const category of currentCategories) {
          if (postCategories.has(category)) score += 3;
        }
        
        // Bonus for recent posts
        const daysSincePublished = (Date.now() - post.frontmatter.date.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSincePublished < 30) score += 1;
        
        return { post, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    
    return scored.map(item => item.post);
  }
}