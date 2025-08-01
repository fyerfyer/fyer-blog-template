import { BlogPost, SearchIndex, SearchablePost, SearchResult, SearchMatch } from '../types/index.js';
import { writeFile, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from '../utils/logger.js';

/**
 * SearchManager handles content search and filtering functionality
 */
export class SearchManager {
  private searchIndex: SearchIndex | null = null;
  private indexPath: string;

  constructor(outputDir: string) {
    this.indexPath = `${outputDir}/search-index.json`;
  }

  /**
   * Build search index from posts
   */
  async buildSearchIndex(posts: BlogPost[]): Promise<SearchIndex> {
    try {
      const searchablePosts: SearchablePost[] = posts.map(post => ({
        id: post.id,
        title: post.title,
        content: this.stripHtml(post.content),
        excerpt: post.excerpt,
        tags: post.frontmatter.tags || [],
        categories: post.frontmatter.categories || [],
        date: this.formatDate(post.frontmatter.date),
        slug: post.slug,
      }));

      const allTags = Array.from(new Set(posts.flatMap(p => p.frontmatter.tags || [])));
      const allCategories = Array.from(new Set(posts.flatMap(p => p.frontmatter.categories || [])));

      const index: SearchIndex = {
        posts: searchablePosts,
        tags: allTags.sort(),
        categories: allCategories.sort(),
      };

      this.searchIndex = index;
      
      // Save index to file
      await writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
      
      logger.info(`Search index built with ${searchablePosts.length} posts`);
      return index;
    } catch (error) {
      logger.error(`Error building search index: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Load existing search index
   */
  async loadSearchIndex(): Promise<SearchIndex | null> {
    try {
      if (!existsSync(this.indexPath)) {
        return null;
      }

      const indexContent = await readFile(this.indexPath, 'utf-8');
      this.searchIndex = JSON.parse(indexContent);
      return this.searchIndex;
    } catch (error) {
      logger.error(`Error loading search index: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Simple text search across posts
   */
  async searchPosts(query: string, maxResults = 10): Promise<SearchResult[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
      if (!this.searchIndex) {
        return [];
      }
    }

    const normalizedQuery = query.toLowerCase().trim();
    if (!normalizedQuery) {
      return [];
    }

    const results: SearchResult[] = [];
    const queryTerms = normalizedQuery.split(/\s+/);

    for (const post of this.searchIndex.posts) {
      const score = this.calculateSearchScore(post, queryTerms);
      if (score > 0) {
        const matches = this.findMatches(post, queryTerms);
        results.push({ post, score, matches });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, maxResults);
  }

  /**
   * Filter posts by tags
   */
  async filterByTags(tags: string[]): Promise<SearchablePost[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
      if (!this.searchIndex) {
        return [];
      }
    }

    const normalizedTags = tags.map(tag => tag.toLowerCase());
    
    return this.searchIndex.posts.filter(post =>
      post.tags.some(tag => normalizedTags.includes(tag.toLowerCase()))
    );
  }

  /**
   * Filter posts by categories
   */
  async filterByCategories(categories: string[]): Promise<SearchablePost[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
      if (!this.searchIndex) {
        return [];
      }
    }

    const normalizedCategories = categories.map(cat => cat.toLowerCase());
    
    return this.searchIndex.posts.filter(post =>
      post.categories.some(cat => normalizedCategories.includes(cat.toLowerCase()))
    );
  }

  /**
   * Get all available tags
   */
  async getTags(): Promise<string[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
    }
    return this.searchIndex?.tags || [];
  }

  /**
   * Get all available categories
   */
  async getCategories(): Promise<string[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
    }
    return this.searchIndex?.categories || [];
  }

  /**
   * Get posts by date range
   */
  async filterByDateRange(startDate: Date, endDate: Date): Promise<SearchablePost[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
      if (!this.searchIndex) {
        return [];
      }
    }

    return this.searchIndex.posts.filter(post => {
      const postDate = new Date(post.date);
      return postDate >= startDate && postDate <= endDate;
    });
  }

  /**
   * Advanced search with multiple filters
   */
  async advancedSearch(options: {
    query?: string;
    tags?: string[];
    categories?: string[];
    startDate?: Date;
    endDate?: Date;
    maxResults?: number;
  }): Promise<SearchResult[]> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
      if (!this.searchIndex) {
        return [];
      }
    }

    let filteredPosts = [...this.searchIndex.posts];

    // Apply filters
    if (options.tags && options.tags.length > 0) {
      const tagFiltered = await this.filterByTags(options.tags);
      filteredPosts = filteredPosts.filter(post => 
        tagFiltered.some(tp => tp.id === post.id)
      );
    }

    if (options.categories && options.categories.length > 0) {
      const categoryFiltered = await this.filterByCategories(options.categories);
      filteredPosts = filteredPosts.filter(post => 
        categoryFiltered.some(cp => cp.id === post.id)
      );
    }

    if (options.startDate || options.endDate) {
      const start = options.startDate || new Date('1970-01-01');
      const end = options.endDate || new Date();
      filteredPosts = filteredPosts.filter(post => {
        const postDate = new Date(post.date);
        return postDate >= start && postDate <= end;
      });
    }

    // Apply text search if query provided
    if (options.query && options.query.trim()) {
      const queryTerms = options.query.toLowerCase().trim().split(/\s+/);
      const results: SearchResult[] = [];

      for (const post of filteredPosts) {
        const score = this.calculateSearchScore(post, queryTerms);
        if (score > 0) {
          const matches = this.findMatches(post, queryTerms);
          results.push({ post, score, matches });
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, options.maxResults || 10);
    }

    // Return all filtered posts without search scoring
    const results: SearchResult[] = filteredPosts.map(post => ({
      post,
      score: 1,
      matches: [],
    }));

    return results.slice(0, options.maxResults || 10);
  }

  /**
   * Calculate search score for a post
   */
  private calculateSearchScore(post: SearchablePost, queryTerms: string[]): number {
    let score = 0;
    const title = post.title.toLowerCase();
    const content = post.content.toLowerCase();
    const excerpt = post.excerpt.toLowerCase();

    for (const term of queryTerms) {
      // Title matches are worth more
      if (title.includes(term)) {
        score += 10;
      }
      
      // Excerpt matches
      if (excerpt.includes(term)) {
        score += 5;
      }
      
      // Content matches
      const contentMatches = (content.match(new RegExp(term, 'g')) || []).length;
      score += contentMatches * 1;
      
      // Tag matches
      if (post.tags.some(tag => tag.toLowerCase().includes(term))) {
        score += 8;
      }
      
      // Category matches  
      if (post.categories.some(cat => cat.toLowerCase().includes(term))) {
        score += 6;
      }
    }

    return score;
  }

  /**
   * Find matches in post content for highlighting
   */
  private findMatches(post: SearchablePost, queryTerms: string[]): SearchMatch[] {
    const matches: SearchMatch[] = [];

    for (const term of queryTerms) {
      // Check title
      const titleMatches = this.findTermMatches(post.title.toLowerCase(), term);
      if (titleMatches.length > 0) {
        matches.push({
          field: 'title',
          indices: titleMatches,
          value: post.title,
        });
      }

      // Check excerpt
      const excerptMatches = this.findTermMatches(post.excerpt.toLowerCase(), term);
      if (excerptMatches.length > 0) {
        matches.push({
          field: 'excerpt',
          indices: excerptMatches,
          value: post.excerpt,
        });
      }

      // Check content (limited to first few matches for performance)
      const contentMatches = this.findTermMatches(post.content.toLowerCase(), term).slice(0, 3);
      if (contentMatches.length > 0) {
        matches.push({
          field: 'content',
          indices: contentMatches,
          value: post.content,
        });
      }
    }

    return matches;
  }

  /**
   * Find all occurrences of a term in text
   */
  private findTermMatches(text: string, term: string): [number, number][] {
    const matches: [number, number][] = [];
    let index = 0;

    while (index < text.length) {
      const foundIndex = text.indexOf(term, index);
      if (foundIndex === -1) break;
      
      matches.push([foundIndex, foundIndex + term.length]);
      index = foundIndex + 1;
    }

    return matches;
  }

  /**
   * Format date safely for search index
   */
  private formatDate(date: Date | string | unknown): string {
    try {
      if (date instanceof Date) {
        if (isNaN(date.getTime())) {
          return new Date().toISOString();
        }
        return date.toISOString();
      }
      
      if (typeof date === 'string') {
        const parsed = new Date(date);
        if (isNaN(parsed.getTime())) {
          return new Date().toISOString();
        }
        return parsed.toISOString();
      }
      
      return new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Strip HTML tags from content
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();
  }

  /**
   * Get search statistics
   */
  async getSearchStats(): Promise<{
    totalPosts: number;
    totalTags: number;
    totalCategories: number;
    indexSize: number;
    lastUpdated: Date | null;
  }> {
    if (!this.searchIndex) {
      await this.loadSearchIndex();
    }

    if (!this.searchIndex) {
      return {
        totalPosts: 0,
        totalTags: 0,
        totalCategories: 0,
        indexSize: 0,
        lastUpdated: null,
      };
    }

    const indexSizeBytes = JSON.stringify(this.searchIndex).length;

    return {
      totalPosts: this.searchIndex.posts.length,
      totalTags: this.searchIndex.tags.length,
      totalCategories: this.searchIndex.categories.length,
      indexSize: indexSizeBytes,
      lastUpdated: existsSync(this.indexPath) ? new Date() : null,
    };
  }
}