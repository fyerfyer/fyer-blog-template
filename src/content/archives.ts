import { BlogPost, Archive, ArchiveIndex, ArchivesConfig } from '../types/index.js';
import { writeFile } from 'fs/promises';
import { logger } from '../utils/logger.js';

/**
 * ArchiveManager handles content archives and organization
 */
export class ArchiveManager {
  private config: ArchivesConfig;
  private outputDir: string;

  constructor(config: ArchivesConfig, outputDir: string) {
    this.config = config;
    this.outputDir = outputDir;
  }

  /**
   * Generate archive index from posts
   */
  async generateArchives(posts: BlogPost[]): Promise<ArchiveIndex> {
    if (!this.config.enabled) {
      return { yearly: [], monthly: [], total: 0 };
    }

    const sortedPosts = posts
      .filter(post => !post.frontmatter.draft)
      .sort((a, b) => {
        const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
        const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
        return dateB.getTime() - dateA.getTime();
      });

    const yearlyArchives = this.generateYearlyArchives(sortedPosts);
    const monthlyArchives = this.generateMonthlyArchives(sortedPosts);

    const archiveIndex: ArchiveIndex = {
      yearly: yearlyArchives,
      monthly: monthlyArchives,
      total: sortedPosts.length,
    };

    // Save archive index
    await this.saveArchiveIndex(archiveIndex);

    logger.info(`Generated archives with ${yearlyArchives.length} years and ${monthlyArchives.length} months`);
    return archiveIndex;
  }

  /**
   * Generate yearly archives
   */
  private generateYearlyArchives(posts: BlogPost[]): Archive[] {
    const yearGroups = new Map<number, BlogPost[]>();

    posts.forEach(post => {
      const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
      const year = date.getFullYear();
      if (!yearGroups.has(year)) {
        yearGroups.set(year, []);
      }
      yearGroups.get(year)!.push(post);
    });

    const yearlyArchives: Archive[] = [];
    
    Array.from(yearGroups.entries())
      .sort(([a], [b]) => b - a) // Sort years descending
      .forEach(([year, yearPosts]) => {
        yearlyArchives.push({
          year,
          posts: yearPosts,
          count: yearPosts.length,
        });
      });

    return yearlyArchives;
  }

  /**
   * Generate monthly archives
   */
  private generateMonthlyArchives(posts: BlogPost[]): Archive[] {
    const monthGroups = new Map<string, { year: number; month: number; posts: BlogPost[] }>();

    posts.forEach(post => {
      const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-based month
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (!monthGroups.has(key)) {
        monthGroups.set(key, { year, month, posts: [] });
      }
      monthGroups.get(key)!.posts.push(post);
    });

    const monthlyArchives: Archive[] = [];
    
    Array.from(monthGroups.entries())
      .sort(([a], [b]) => b.localeCompare(a)) // Sort months descending
      .forEach(([, { year, month, posts }]) => {
        monthlyArchives.push({
          year,
          month,
          posts,
          count: posts.length,
        });
      });

    return monthlyArchives;
  }

  /**
   * Generate category-based archives
   */
  async generateCategoryArchives(posts: BlogPost[]): Promise<Map<string, Archive[]>> {
    const categoryArchives = new Map<string, Archive[]>();
    
    // Group posts by category
    const categoryGroups = new Map<string, BlogPost[]>();
    
    posts.forEach(post => {
      const categories = post.frontmatter.categories || [];
      categories.forEach(category => {
        if (!categoryGroups.has(category)) {
          categoryGroups.set(category, []);
        }
        categoryGroups.get(category)!.push(post);
      });
    });

    // Generate yearly archives for each category
    categoryGroups.forEach((categoryPosts, category) => {
      const yearlyArchives = this.generateYearlyArchives(categoryPosts);
      categoryArchives.set(category, yearlyArchives);
    });

    return categoryArchives;
  }

  /**
   * Get posts for a specific time period
   */
  async getPostsForPeriod(
    posts: BlogPost[], 
    year: number, 
    month?: number
  ): Promise<BlogPost[]> {
    return posts.filter(post => {
      const postDate = post.frontmatter.date;
      const postYear = postDate.getFullYear();
      const postMonth = postDate.getMonth() + 1;
      
      if (month) {
        return postYear === year && postMonth === month;
      } else {
        return postYear === year;
      }
    }).sort((a, b) => {
      const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
      const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * Get archive statistics
   */
  async getArchiveStats(posts: BlogPost[]): Promise<{
    activeYears: number[];
    postsByYear: Map<number, number>;
    postsByMonth: Map<string, number>;
    mostActiveYear: { year: number; count: number } | null;
    mostActiveMonth: { year: number; month: number; count: number } | null;
    averagePostsPerMonth: number;
    firstPost: Date | null;
    lastPost: Date | null;
  }> {
    const publishedPosts = posts.filter(post => !post.frontmatter.draft);
    
    if (publishedPosts.length === 0) {
      return {
        activeYears: [],
        postsByYear: new Map(),
        postsByMonth: new Map(),
        mostActiveYear: null,
        mostActiveMonth: null,
        averagePostsPerMonth: 0,
        firstPost: null,
        lastPost: null,
      };
    }

    const postsByYear = new Map<number, number>();
    const postsByMonth = new Map<string, number>();
    
    publishedPosts.forEach(post => {
      const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      
      postsByYear.set(year, (postsByYear.get(year) || 0) + 1);
      postsByMonth.set(monthKey, (postsByMonth.get(monthKey) || 0) + 1);
    });

    // Find most active year
    let mostActiveYear: { year: number; count: number } | null = null;
    postsByYear.forEach((count, year) => {
      if (!mostActiveYear || count > mostActiveYear.count) {
        mostActiveYear = { year, count };
      }
    });

    // Find most active month
    let mostActiveMonth: { year: number; month: number; count: number } | null = null;
    postsByMonth.forEach((count, monthKey) => {
      const [year, month] = monthKey.split('-').map(Number);
      if (!mostActiveMonth || count > mostActiveMonth.count) {
        mostActiveMonth = { year: year || 0, month: month || 0, count };
      }
    });

    // Calculate date range
    const sortedDates = publishedPosts
      .map(post => post.frontmatter.date)
      .sort((a, b) => a.getTime() - b.getTime());
    
    const firstPost = sortedDates.length > 0 ? sortedDates[0] : null;
    const lastPost = sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null;
    
    // Calculate average posts per month
    const totalMonths = postsByMonth.size;
    const averagePostsPerMonth = totalMonths > 0 ? publishedPosts.length / totalMonths : 0;

    return {
      activeYears: Array.from(postsByYear.keys()).sort((a, b) => b - a),
      postsByYear,
      postsByMonth,
      mostActiveYear,
      mostActiveMonth,
      averagePostsPerMonth: Math.round(averagePostsPerMonth * 100) / 100,
      firstPost: firstPost || null,
      lastPost: lastPost || null,
    };
  }

  /**
   * Generate archive navigation data
   */
  async generateArchiveNavigation(posts: BlogPost[]): Promise<{
    years: Array<{ year: number; count: number; months: Array<{ month: number; count: number; name: string }> }>;
    categories: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; count: number }>;
  }> {
    const publishedPosts = posts.filter(post => !post.frontmatter.draft);
    
    // Group by year
    const yearGroups = new Map<number, BlogPost[]>();
    publishedPosts.forEach(post => {
      const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
      const year = date.getFullYear();
      if (!yearGroups.has(year)) {
        yearGroups.set(year, []);
      }
      yearGroups.get(year)!.push(post);
    });

    const years = Array.from(yearGroups.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, yearPosts]) => {
        // Group posts by month within the year
        const monthGroups = new Map<number, BlogPost[]>();
        yearPosts.forEach(post => {
          const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
          const month = date.getMonth() + 1;
          if (!monthGroups.has(month)) {
            monthGroups.set(month, []);
          }
          monthGroups.get(month)!.push(post);
        });

        const months = Array.from(monthGroups.entries())
          .sort(([a], [b]) => b - a)
          .map(([month, monthPosts]) => ({
            month,
            count: monthPosts.length,
            name: new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long' }),
          }));

        return {
          year,
          count: yearPosts.length,
          months,
        };
      });

    // Count categories
    const categoryCount = new Map<string, number>();
    publishedPosts.forEach(post => {
      (post.frontmatter.categories || []).forEach(category => {
        categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
      });
    });

    const categories = Array.from(categoryCount.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // Count tags
    const tagCount = new Map<string, number>();
    publishedPosts.forEach(post => {
      (post.frontmatter.tags || []).forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });

    const tags = Array.from(tagCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20) // Top 20 tags
      .map(([name, count]) => ({ name, count }));

    return { years, categories, tags };
  }

  /**
   * Save archive index to file
   */
  private async saveArchiveIndex(archiveIndex: ArchiveIndex): Promise<void> {
    try {
      const archivePath = `${this.outputDir}/archives.json`;
      await writeFile(archivePath, JSON.stringify(archiveIndex, null, 2), 'utf-8');
      
      const navigationPath = `${this.outputDir}/archive-navigation.json`;
      // Note: In a real implementation, you would pass the posts here
      // For now, we'll create a placeholder
      const navigation = { years: [], categories: [], tags: [] };
      await writeFile(navigationPath, JSON.stringify(navigation, null, 2), 'utf-8');
      
      logger.info(`Archive index saved to ${archivePath}`);
    } catch (error) {
      logger.error(`Error saving archive index: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: ArchivesConfig): void {
    this.config = config;
    logger.info('Archive configuration updated', config as unknown as Record<string, unknown>);
  }

  /**
   * Get archive URL for a given year/month
   */
  getArchiveUrl(year: number, month?: number): string {
    if (month) {
      return `/archives/${year}/${month.toString().padStart(2, '0')}/`;
    }
    return `/archives/${year}/`;
  }

  /**
   * Generate archive page data
   */
  async getArchivePageData(
    posts: BlogPost[], 
    year?: number, 
    month?: number
  ): Promise<{
    posts: BlogPost[];
    pagination: {
      currentPage: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
    meta: {
      title: string;
      description: string;
      period: string;
    };
  }> {
    let filteredPosts = posts.filter(post => !post.frontmatter.draft);
    let title = 'All Posts';
    let description = 'Browse all blog posts';
    let period = 'all-time';

    if (year) {
      filteredPosts = await this.getPostsForPeriod(filteredPosts, year, month);
      if (month) {
        const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long' });
        title = `Posts from ${monthName} ${year}`;
        description = `Browse posts from ${monthName} ${year}`;
        period = `${year}-${month.toString().padStart(2, '0')}`;
      } else {
        title = `Posts from ${year}`;
        description = `Browse posts from ${year}`;
        period = year.toString();
      }
    }

    // Simple pagination (could be enhanced)
    const postsPerPage = 10;
    const totalPages = Math.ceil(filteredPosts.length / postsPerPage);
    const currentPage = 1;
    const paginatedPosts = filteredPosts.slice(0, postsPerPage);

    return {
      posts: paginatedPosts,
      pagination: {
        currentPage,
        totalPages,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
      },
      meta: {
        title,
        description,
        period,
      },
    };
  }
}