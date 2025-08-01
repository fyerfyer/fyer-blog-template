import { BlogPost, PostRelation, RelatedPostsConfig } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * RelatedPostsManager handles finding and ranking related posts
 */
export class RelatedPostsManager {
  private config: RelatedPostsConfig;

  constructor(config: RelatedPostsConfig) {
    this.config = config;
  }

  /**
   * Find related posts for a given post
   */
  async findRelatedPosts(currentPost: BlogPost, allPosts: BlogPost[]): Promise<PostRelation[]> {
    if (!this.config.enabled) {
      return [];
    }

    const otherPosts = allPosts.filter(post => post.id !== currentPost.id);
    const relations: PostRelation[] = [];

    for (const post of otherPosts) {
      const relation = this.calculateRelation(currentPost, post);
      if (relation.score > 0) {
        relations.push(relation);
      }
    }

    // Sort by score descending and limit results
    relations.sort((a, b) => b.score - a.score);
    return relations.slice(0, this.config.maxCount);
  }

  /**
   * Calculate the relationship score between two posts
   */
  private calculateRelation(currentPost: BlogPost, candidatePost: BlogPost): PostRelation {
    let score = 0;
    const commonTags: string[] = [];
    const commonCategories: string[] = [];

    const currentTags = (currentPost.frontmatter.tags || []).map(tag => tag.toLowerCase());
    const candidateTags = (candidatePost.frontmatter.tags || []).map(tag => tag.toLowerCase());
    
    const currentCategories = (currentPost.frontmatter.categories || []).map(cat => cat.toLowerCase());
    const candidateCategories = (candidatePost.frontmatter.categories || []).map(cat => cat.toLowerCase());

    switch (this.config.method) {
      case 'tags':
        score = this.calculateTagSimilarity(currentTags, candidateTags, commonTags);
        break;
      
      case 'categories':
        score = this.calculateCategorySimilarity(currentCategories, candidateCategories, commonCategories);
        break;
      
      case 'content': {
        score = this.calculateContentSimilarity(currentPost, candidatePost);
        // Also include tag/category similarity for content method
        const tagScore = this.calculateTagSimilarity(currentTags, candidateTags, commonTags);
        const categoryScore = this.calculateCategorySimilarity(currentCategories, candidateCategories, commonCategories);
        score += (tagScore * 0.3) + (categoryScore * 0.2);
        break;
      }
    }

    // Bonus for recent posts (within last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (candidatePost.frontmatter.date > sixMonthsAgo) {
      score *= 1.1;
    }

    return {
      post: candidatePost,
      score: Math.round(score * 100) / 100, // Round to 2 decimal places
      commonTags,
      commonCategories,
    };
  }

  /**
   * Calculate similarity based on tags
   */
  private calculateTagSimilarity(currentTags: string[], candidateTags: string[], commonTags: string[]): number {
    const intersection = currentTags.filter(tag => candidateTags.includes(tag));
    commonTags.push(...intersection);
    
    if (intersection.length === 0) return 0;
    
    const union = new Set([...currentTags, ...candidateTags]);
    return (intersection.length / union.size) * 10; // Scale to make it meaningful
  }

  /**
   * Calculate similarity based on categories
   */
  private calculateCategorySimilarity(currentCategories: string[], candidateCategories: string[], commonCategories: string[]): number {
    const intersection = currentCategories.filter(cat => candidateCategories.includes(cat));
    commonCategories.push(...intersection);
    
    if (intersection.length === 0) return 0;
    
    const union = new Set([...currentCategories, ...candidateCategories]);
    return (intersection.length / union.size) * 15; // Categories are weighted higher than tags
  }

  /**
   * Calculate similarity based on content analysis
   */
  private calculateContentSimilarity(currentPost: BlogPost, candidatePost: BlogPost): number {
    // Simple content similarity based on word frequency
    const currentWords = this.extractKeywords(currentPost.content + ' ' + currentPost.title);
    const candidateWords = this.extractKeywords(candidatePost.content + ' ' + candidatePost.title);
    
    if (currentWords.length === 0 || candidateWords.length === 0) return 0;
    
    // Calculate word overlap
    const currentWordSet = new Set(currentWords);
    const candidateWordSet = new Set(candidateWords);
    
    const intersection = [...currentWordSet].filter(word => candidateWordSet.has(word));
    const union = new Set([...currentWordSet, ...candidateWordSet]);
    
    if (intersection.length === 0) return 0;
    
    return (intersection.length / union.size) * 8;
  }

  /**
   * Extract keywords from text content
   */
  private extractKeywords(text: string): string[] {
    // Remove HTML tags and normalize text
    const cleanText = text
      .replace(/<[^>]*>/g, ' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Common stop words to filter out
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'this', 'these', 'they', 'we', 'you',
      'i', 'me', 'my', 'myself', 'our', 'ours', 'ourselves', 'your', 'yours',
      'yourself', 'yourselves', 'him', 'his', 'himself', 'she', 'her', 'hers',
      'herself', 'them', 'their', 'theirs', 'themselves', 'what', 'which',
      'who', 'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'any',
      'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
      'very', 'can', 'will', 'just', 'should', 'now'
    ]);

    const words = cleanText.split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

    // Count word frequency and return most common words
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Return words that appear more than once, sorted by frequency
    return Array.from(wordCount.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20) // Top 20 keywords
      .map(([word]) => word);
  }

  /**
   * Get related posts with caching
   */
  async getRelatedPostsWithCache(
    currentPost: BlogPost, 
    allPosts: BlogPost[]
  ): Promise<PostRelation[]> {
    // In a real implementation, you might want to add caching here
    // For now, we'll just calculate directly
    return this.findRelatedPosts(currentPost, allPosts);
  }

  /**
   * Get statistics about related posts relationships
   */
  async getRelationshipStats(allPosts: BlogPost[]): Promise<{
    totalPosts: number;
    averageRelations: number;
    mostConnectedPost: { post: BlogPost; connections: number } | null;
    leastConnectedPost: { post: BlogPost; connections: number } | null;
    commonTags: string[];
    commonCategories: string[];
  }> {
    if (allPosts.length === 0) {
      return {
        totalPosts: 0,
        averageRelations: 0,
        mostConnectedPost: null,
        leastConnectedPost: null,
        commonTags: [],
        commonCategories: [],
      };
    }

    const connectionCounts: Map<string, number> = new Map();
    let totalConnections = 0;

    // Calculate connections for each post
    for (const post of allPosts) {
      const relations = await this.findRelatedPosts(post, allPosts);
      const connectionCount = relations.length;
      connectionCounts.set(post.id, connectionCount);
      totalConnections += connectionCount;
    }

    // Find most and least connected posts
    let mostConnected: { post: BlogPost; connections: number } | null = null;
    let leastConnected: { post: BlogPost; connections: number } | null = null;

    for (const post of allPosts) {
      const connections = connectionCounts.get(post.id) || 0;
      
      if (!mostConnected || connections > mostConnected.connections) {
        mostConnected = { post, connections };
      }
      
      if (!leastConnected || connections < leastConnected.connections) {
        leastConnected = { post, connections };
      }
    }

    // Get common tags and categories
    const allTags = allPosts.flatMap(p => p.frontmatter.tags || []);
    const allCategories = allPosts.flatMap(p => p.frontmatter.categories || []);
    
    const tagCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    
    allTags.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    allCategories.forEach(cat => categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1));
    
    const commonTags = Array.from(tagCounts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);
    
    const commonCategories = Array.from(categoryCounts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cat]) => cat);

    return {
      totalPosts: allPosts.length,
      averageRelations: totalConnections / allPosts.length,
      mostConnectedPost: mostConnected,
      leastConnectedPost: leastConnected,
      commonTags,
      commonCategories,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: RelatedPostsConfig): void {
    this.config = config;
    logger.info('Related posts configuration updated', config as unknown as Record<string, unknown>);
  }
}