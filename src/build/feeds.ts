import { BlogPost, FeedConfig } from '../types/index.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { Feed } from 'feed';
import { logger } from '../utils/logger.js';

/**
 * FeedManager handles RSS, Atom, and JSON feed generation
 */
export class FeedManager {
  private config: FeedConfig;
  private outputDir: string;
  private siteUrl: string;
  private baseUrl: string;

  constructor(config: FeedConfig, outputDir: string, siteUrl: string, baseUrl: string) {
    this.config = config;
    this.outputDir = outputDir;
    this.siteUrl = siteUrl;
    this.baseUrl = baseUrl;
  }

  /**
   * Generate all enabled feeds
   */
  async generateFeeds(
    posts: BlogPost[], 
    siteTitle: string, 
    siteDescription: string, 
    authorName: string, 
    authorEmail: string
  ): Promise<void> {
    try {
      const feedPosts = posts
        .filter(post => !post.frontmatter.draft)
        .sort((a, b) => {
          const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
          const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
          return dateB.getTime() - dateA.getTime();
        });

      const feed = this.createBaseFeed(siteTitle, siteDescription, authorName, authorEmail);
      
      // Add posts to feed
      const maxItems = Math.max(
        this.config.rss.maxItems,
        this.config.atom.maxItems,
        this.config.json.maxItems
      );
      
      feedPosts.slice(0, maxItems).forEach(post => {
        const feedItem = this.createFeedItem(post, authorName);
        feed.addItem(feedItem);
      });

      // Generate RSS feed
      if (this.config.rss.enabled) {
        await this.generateRSSFeed(feed);
      }

      // Generate Atom feed
      if (this.config.atom.enabled) {
        await this.generateAtomFeed(feed);
      }

      // Generate JSON feed
      if (this.config.json.enabled) {
        await this.generateJSONFeed(feed);
      }

      logger.info(`Generated feeds for ${feedPosts.length} posts`);
    } catch (error) {
      logger.error(`Error generating feeds: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Create base feed configuration
   */
  private createBaseFeed(siteTitle: string, siteDescription: string, authorName: string, authorEmail: string): Feed {
    return new Feed({
      title: siteTitle,
      description: siteDescription,
      id: this.getFullUrl('/'),
      link: this.getFullUrl('/'),
      language: 'en',
      favicon: this.getFullUrl('/favicon.ico'),
      copyright: `© ${new Date().getFullYear()} ${authorName}`,
      updated: new Date(),
      generator: 'Fyer Blog Static Site Generator',
      feedLinks: {
        rss2: this.getFullUrl(`/${this.config.rss.filename}`),
        atom: this.getFullUrl(`/${this.config.atom.filename}`),
        json: this.getFullUrl(`/${this.config.json.filename}`),
      },
      author: {
        name: authorName,
        email: authorEmail,
        link: this.getFullUrl('/'),
      },
    });
  }

  /**
   * Create feed item from blog post
   */
  private createFeedItem(post: BlogPost, authorName: string): {
    title: string;
    id: string;
    link: string;
    description: string;
    content: string;
    author: Array<{ name: string; email: string; link: string }>;
    date: Date;
    category: Array<{ name: string }>;
    image?: string;
  } {
    const postUrl = this.getFullUrl(`/posts/${post.slug}/`);
    
    const feedItem = {
      title: post.title,
      id: postUrl,
      link: postUrl,
      description: post.frontmatter.description || post.excerpt,
      content: post.content,
      author: [
        {
          name: authorName,
          email: '', // Don't expose email in feeds
          link: this.getFullUrl('/'),
        },
      ],
      date: post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date),
      category: post.frontmatter.categories?.map(cat => ({ name: cat })) || [],
    };
    
    const imageUrl = (post.frontmatter as Record<string, unknown>).image;
    if (typeof imageUrl === 'string') {
      return {
        ...feedItem,
        image: this.getFullUrl(imageUrl),
      };
    }
    
    return feedItem;
  }

  /**
   * Generate RSS 2.0 feed
   */
  private async generateRSSFeed(feed: Feed): Promise<void> {
    try {
      const rssContent = feed.rss2();
      const rssPath = join(this.outputDir, this.config.rss.filename);
      
      await this.ensureDir(rssPath);
      await writeFile(rssPath, rssContent, 'utf-8');
      
      logger.info(`Generated RSS feed: ${this.config.rss.filename}`);
    } catch (error) {
      logger.error(`Error generating RSS feed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate Atom feed
   */
  private async generateAtomFeed(feed: Feed): Promise<void> {
    try {
      const atomContent = feed.atom1();
      const atomPath = join(this.outputDir, this.config.atom.filename);
      
      await this.ensureDir(atomPath);
      await writeFile(atomPath, atomContent, 'utf-8');
      
      logger.info(`Generated Atom feed: ${this.config.atom.filename}`);
    } catch (error) {
      logger.error(`Error generating Atom feed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate JSON feed
   */
  private async generateJSONFeed(
    feed: Feed
  ): Promise<void> {
    try {
      const jsonContent = feed.json1();
      const jsonPath = join(this.outputDir, this.config.json.filename);
      
      await this.ensureDir(jsonPath);
      await writeFile(jsonPath, jsonContent, 'utf-8');
      
      logger.info(`Generated JSON feed: ${this.config.json.filename}`);
    } catch (error) {
      logger.error(`Error generating JSON feed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate category-specific feeds
   */
  async generateCategoryFeeds(
    posts: BlogPost[], 
    siteTitle: string, 
    siteDescription: string, 
    authorName: string, 
    authorEmail: string
  ): Promise<void> {
    try {
      const publishedPosts = posts.filter(post => !post.frontmatter.draft);
      const categories = new Set(publishedPosts.flatMap(post => post.frontmatter.categories || []));

      for (const category of categories) {
        const categoryPosts = publishedPosts
          .filter(post => post.frontmatter.categories?.includes(category))
          .sort((a, b) => {
            const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
            const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, this.config.rss.maxItems);

        if (categoryPosts.length === 0) continue;

        const categoryFeed = new Feed({
          title: `${siteTitle} - ${category}`,
          description: `${siteDescription} - Posts about ${category}`,
          id: this.getFullUrl(`/categories/${encodeURIComponent(category)}/`),
          link: this.getFullUrl(`/categories/${encodeURIComponent(category)}/`),
          language: 'en',
          favicon: this.getFullUrl('/favicon.ico'),
          copyright: `© ${new Date().getFullYear()} ${authorName}`,
          updated: new Date(),
          generator: 'Fyer Blog Static Site Generator',
          feedLinks: {
            rss2: this.getFullUrl(`/feeds/${encodeURIComponent(category)}.xml`),
          },
          author: {
            name: authorName,
            email: authorEmail,
            link: this.getFullUrl('/'),
          },
        });

        categoryPosts.forEach(post => {
          const feedItem = this.createFeedItem(post, authorName);
          categoryFeed.addItem(feedItem);
        });

        // Save category feed
        const categoryFeedPath = join(this.outputDir, 'feeds', `${encodeURIComponent(category)}.xml`);
        await this.ensureDir(categoryFeedPath);
        const rssContent = categoryFeed.rss2();
        await writeFile(categoryFeedPath, rssContent, 'utf-8');
      }

      logger.info(`Generated ${categories.size} category feeds`);
    } catch (error) {
      logger.error(`Error generating category feeds: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate tag-specific feeds
   */
  async generateTagFeeds(
    posts: BlogPost[], 
    siteTitle: string, 
    siteDescription: string, 
    authorName: string, 
    authorEmail: string
  ): Promise<void> {
    try {
      const publishedPosts = posts.filter(post => !post.frontmatter.draft);
      
      // Get tags with at least 3 posts
      const tagCounts = new Map<string, number>();
      publishedPosts.forEach(post => {
        (post.frontmatter.tags || []).forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });
      
      const popularTags = Array.from(tagCounts.entries())
        .filter(([, count]) => count >= 3)
        .map(([tag]) => tag);

      for (const tag of popularTags) {
        const tagPosts = publishedPosts
          .filter(post => post.frontmatter.tags?.includes(tag))
          .sort((a, b) => {
            const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
            const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
            return dateB.getTime() - dateA.getTime();
          })
          .slice(0, this.config.rss.maxItems);

        if (tagPosts.length === 0) continue;

        const tagFeed = new Feed({
          title: `${siteTitle} - #${tag}`,
          description: `${siteDescription} - Posts tagged with ${tag}`,
          id: this.getFullUrl(`/tags/${encodeURIComponent(tag)}/`),
          link: this.getFullUrl(`/tags/${encodeURIComponent(tag)}/`),
          language: 'en',
          favicon: this.getFullUrl('/favicon.ico'),
          copyright: `© ${new Date().getFullYear()} ${authorName}`,
          updated: new Date(),
          generator: 'Fyer Blog Static Site Generator',
          feedLinks: {
            rss2: this.getFullUrl(`/feeds/tags/${encodeURIComponent(tag)}.xml`),
          },
          author: {
            name: authorName,
            email: authorEmail,
            link: this.getFullUrl('/'),
          },
        });

        tagPosts.forEach(post => {
          const feedItem = this.createFeedItem(post, authorName);
          tagFeed.addItem(feedItem);
        });

        // Save tag feed
        const tagFeedPath = join(this.outputDir, 'feeds', 'tags', `${encodeURIComponent(tag)}.xml`);
        await this.ensureDir(tagFeedPath);
        const rssContent = tagFeed.rss2();
        await writeFile(tagFeedPath, rssContent, 'utf-8');
      }

      logger.info(`Generated ${popularTags.length} tag feeds`);
    } catch (error) {
      logger.error(`Error generating tag feeds: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate feed index page
   */
  async generateFeedIndex(
    posts: BlogPost[], 
    siteTitle: string
  ): Promise<void> {
    try {
      const publishedPosts = posts.filter(post => !post.frontmatter.draft);
      
      // Get categories and tags for feed index
      const categories = Array.from(new Set(publishedPosts.flatMap(post => post.frontmatter.categories || [])));
      const tagCounts = new Map<string, number>();
      
      publishedPosts.forEach(post => {
        (post.frontmatter.tags || []).forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      });
      
      const popularTags = Array.from(tagCounts.entries())
        .filter(([, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag);

      const feedIndex = {
        title: `${siteTitle} - Feed Directory`,
        description: 'Available RSS, Atom, and JSON feeds',
        updated: new Date().toISOString(),
        feeds: {
          main: {
            rss: this.config.rss.enabled ? this.getFullUrl(`/${this.config.rss.filename}`) : null,
            atom: this.config.atom.enabled ? this.getFullUrl(`/${this.config.atom.filename}`) : null,
            json: this.config.json.enabled ? this.getFullUrl(`/${this.config.json.filename}`) : null,
          },
          categories: categories.map(category => ({
            name: category,
            rss: this.getFullUrl(`/feeds/${encodeURIComponent(category)}.xml`),
            count: publishedPosts.filter(p => p.frontmatter.categories?.includes(category)).length,
          })),
          tags: popularTags.map(tag => ({
            name: tag,
            rss: this.getFullUrl(`/feeds/tags/${encodeURIComponent(tag)}.xml`),
            count: tagCounts.get(tag) || 0,
          })),
        },
      };

      const feedIndexPath = join(this.outputDir, 'feeds', 'index.json');
      await this.ensureDir(feedIndexPath);
      await writeFile(feedIndexPath, JSON.stringify(feedIndex, null, 2), 'utf-8');
      
      logger.info('Generated feed index');
    } catch (error) {
      logger.error(`Error generating feed index: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Get feed statistics
   */
  async getFeedStats(posts: BlogPost[]): Promise<{
    totalPosts: number;
    feedsGenerated: number;
    latestPost: Date | null;
    avgPostsPerMonth: number;
    topCategories: Array<{ name: string; count: number }>;
    topTags: Array<{ name: string; count: number }>;
  }> {
    const publishedPosts = posts.filter(post => !post.frontmatter.draft);
    
    let feedsGenerated = 0;
    if (this.config.rss.enabled) feedsGenerated++;
    if (this.config.atom.enabled) feedsGenerated++;
    if (this.config.json.enabled) feedsGenerated++;

    const latestPost = publishedPosts.length > 0 
      ? publishedPosts.sort((a, b) => {
          const dateA = a.frontmatter.date instanceof Date ? a.frontmatter.date : new Date(a.frontmatter.date);
          const dateB = b.frontmatter.date instanceof Date ? b.frontmatter.date : new Date(b.frontmatter.date);
          return dateB.getTime() - dateA.getTime();
        })[0]?.frontmatter?.date || null
      : null;

    // Calculate average posts per month
    const dates = publishedPosts.map(p => p.frontmatter.date).sort();
    const monthsSpan = dates.length > 1 
      ? ((dates[dates.length - 1]?.getTime() || 0) - (dates[0]?.getTime() || 0)) / (1000 * 60 * 60 * 24 * 30)
      : 1;
    const avgPostsPerMonth = Math.round((publishedPosts.length / monthsSpan) * 100) / 100;

    // Top categories
    const categoryCount = new Map<string, number>();
    publishedPosts.forEach(post => {
      (post.frontmatter.categories || []).forEach(cat => {
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
      });
    });
    
    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Top tags
    const tagCount = new Map<string, number>();
    publishedPosts.forEach(post => {
      (post.frontmatter.tags || []).forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });
    
    const topTags = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    return {
      totalPosts: publishedPosts.length,
      feedsGenerated,
      latestPost,
      avgPostsPerMonth,
      topCategories,
      topTags,
    };
  }

  /**
   * Helper methods
   */
  private getFullUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.siteUrl}${this.baseUrl}${cleanPath}`.replace(/\/+/g, '/').replace(':/', '://');
  }

  private async ensureDir(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: FeedConfig): void {
    this.config = config;
    logger.info('Feed configuration updated');
  }
}