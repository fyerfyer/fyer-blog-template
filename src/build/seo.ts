import { BlogPost, BlogPage, SEOConfig, SitemapEntry } from '../types/index.js';
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import { logger } from '../utils/logger.js';

/**
 * SEOManager handles SEO optimization, meta tags, and structured data
 */
export class SEOManager {
  private config: SEOConfig;
  private outputDir: string;
  private siteUrl: string;
  private baseUrl: string;

  constructor(config: SEOConfig, outputDir: string, siteUrl: string, baseUrl: string) {
    this.config = config;
    this.outputDir = outputDir;
    this.siteUrl = siteUrl;
    this.baseUrl = baseUrl;
  }

  /**
   * Generate XML sitemap
   */
  async generateSitemap(posts: BlogPost[], pages: BlogPage[]): Promise<void> {
    try {
      const sitemapEntries: SitemapEntry[] = [];

      // Add homepage
      sitemapEntries.push({
        url: this.getFullUrl('/'),
        lastmod: new Date().toISOString(),
        changefreq: 'daily',
        priority: 1.0,
      });

      // Add posts
      posts
        .filter(post => !post.frontmatter.draft)
        .forEach(post => {
          sitemapEntries.push({
            url: this.getFullUrl(`/posts/${post.slug}/`),
            lastmod: post.metadata.lastModified instanceof Date ? post.metadata.lastModified.toISOString() : new Date(post.metadata.lastModified).toISOString(),
            changefreq: 'weekly',
            priority: 0.8,
          });
        });

      // Add pages
      pages.forEach(page => {
        sitemapEntries.push({
          url: this.getFullUrl(`/${page.slug}/`),
          lastmod: page.metadata.lastModified instanceof Date ? page.metadata.lastModified.toISOString() : new Date(page.metadata.lastModified).toISOString(),
          changefreq: 'monthly',
          priority: 0.6,
        });
      });

      // Add archive pages
      const years = new Set(posts.map(post => {
        const date = post.frontmatter.date instanceof Date ? post.frontmatter.date : new Date(post.frontmatter.date);
        return date.getFullYear();
      }));
      years.forEach(year => {
        sitemapEntries.push({
          url: this.getFullUrl(`/archives/${year}/`),
          lastmod: new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.5,
        });
      });

      // Add tag pages
      const allTags = new Set(posts.flatMap(post => post.frontmatter.tags || []));
      allTags.forEach(tag => {
        const encodedTag = encodeURIComponent(tag);
        sitemapEntries.push({
          url: this.getFullUrl(`/tags/${encodedTag}/`),
          lastmod: new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.4,
        });
      });

      // Add category pages
      const allCategories = new Set(posts.flatMap(post => post.frontmatter.categories || []));
      allCategories.forEach(category => {
        const encodedCategory = encodeURIComponent(category);
        sitemapEntries.push({
          url: this.getFullUrl(`/categories/${encodedCategory}/`),
          lastmod: new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.4,
        });
      });

      // Generate sitemap
      const stream = new SitemapStream({ 
        hostname: this.siteUrl + this.baseUrl,
      });
      
      const sitemapXml = await streamToPromise(
        Readable.from(sitemapEntries).pipe(stream)
      );

      const sitemapPath = join(this.outputDir, 'sitemap.xml');
      await this.ensureDir(sitemapPath);
      await writeFile(sitemapPath, sitemapXml.toString(), 'utf-8');

      logger.info(`Generated sitemap with ${sitemapEntries.length} entries`);
    } catch (error) {
      logger.error(`Error generating sitemap: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate meta tags for a post
   */
  generatePostMetaTags(post: BlogPost, siteTitle: string, authorName: string = 'Anonymous'): string {
    const title = `${post.title} | ${siteTitle}`;
    const description = post.frontmatter.description || post.excerpt;
    const url = this.getFullUrl(`/posts/${post.slug}/`);
    const imageUrl = (post.frontmatter as Record<string, unknown>).image;
    const image = typeof imageUrl === 'string' 
      ? this.getFullUrl(imageUrl)
      : this.getFullUrl(this.config.defaultImage || '/assets/images/og-default.jpg');
    
    let metaTags = `
    <title>${this.escapeHtml(title)}</title>
    <meta name="description" content="${this.escapeHtml(description)}">
    <meta name="keywords" content="${(post.frontmatter.tags || []).join(', ')}">
    <link rel="canonical" href="${url}">
    `;

    if (this.config.enableOpenGraph) {
      metaTags += `
    <meta property="og:title" content="${this.escapeHtml(post.title)}">
    <meta property="og:description" content="${this.escapeHtml(description)}">
    <meta property="og:type" content="article">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta property="og:site_name" content="${this.escapeHtml(siteTitle)}">
    <meta property="article:published_time" content="${post.frontmatter.date instanceof Date ? post.frontmatter.date.toISOString() : new Date(post.frontmatter.date).toISOString()}">
    <meta property="article:modified_time" content="${post.metadata.lastModified instanceof Date ? post.metadata.lastModified.toISOString() : new Date(post.metadata.lastModified).toISOString()}">
    <meta property="article:author" content="${this.escapeHtml(authorName)}">
    `;

      // Add article tags
      (post.frontmatter.tags || []).forEach(tag => {
        metaTags += `    <meta property="article:tag" content="${this.escapeHtml(tag)}">\n`;
      });

      // Add article section
      (post.frontmatter.categories || []).forEach(category => {
        metaTags += `    <meta property="article:section" content="${this.escapeHtml(category)}">\n`;
      });
    }

    if (this.config.enableTwitterCard) {
      metaTags += `
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${this.escapeHtml(post.title)}">
    <meta name="twitter:description" content="${this.escapeHtml(description)}">
    <meta name="twitter:image" content="${image}">
    `;
    }

    return metaTags.trim();
  }

  /**
   * Generate meta tags for a page
   */
  generatePageMetaTags(page: BlogPage, siteTitle: string): string {
    const title = page.title === 'Home' ? siteTitle : `${page.title} | ${siteTitle}`;
    const description = page.frontmatter.description || `${page.title} page`;
    const url = this.getFullUrl(page.slug === 'index' ? '/' : `/${page.slug}/`);
    const image = this.getFullUrl(this.config.defaultImage || '/assets/images/og-default.jpg');

    let metaTags = `
    <title>${this.escapeHtml(title)}</title>
    <meta name="description" content="${this.escapeHtml(description)}">
    <link rel="canonical" href="${url}">
    `;

    if (this.config.enableOpenGraph) {
      metaTags += `
    <meta property="og:title" content="${this.escapeHtml(page.title)}">
    <meta property="og:description" content="${this.escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta property="og:site_name" content="${this.escapeHtml(siteTitle)}">
    `;
    }

    if (this.config.enableTwitterCard) {
      metaTags += `
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${this.escapeHtml(page.title)}">
    <meta name="twitter:description" content="${this.escapeHtml(description)}">
    <meta name="twitter:image" content="${image}">
    `;
    }

    return metaTags.trim();
  }

  /**
   * Generate structured data (JSON-LD) for a blog post
   */
  generatePostStructuredData(post: BlogPost, siteTitle: string, authorName: string): string {
    if (!this.config.enableStructuredData) {
      return '';
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.frontmatter.description || post.excerpt,
      author: {
        '@type': 'Person',
        name: authorName,
      },
      publisher: {
        '@type': 'Organization',
        name: siteTitle,
      },
      datePublished: post.frontmatter.date instanceof Date ? post.frontmatter.date.toISOString() : new Date(post.frontmatter.date).toISOString(),
      dateModified: post.metadata.lastModified instanceof Date ? post.metadata.lastModified.toISOString() : new Date(post.metadata.lastModified).toISOString(),
      url: this.getFullUrl(`/posts/${post.slug}/`),
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': this.getFullUrl(`/posts/${post.slug}/`),
      },
      keywords: (post.frontmatter.tags || []).join(','),
      wordCount: post.metadata.wordCount,
      articleBody: this.stripHtml(post.content),
    };

    const structuredImageUrl = (post.frontmatter as Record<string, unknown>).image;
    if (typeof structuredImageUrl === 'string') {
      (structuredData as Record<string, unknown>).image = {
        '@type': 'ImageObject',
        url: this.getFullUrl(structuredImageUrl),
      };
    }

    return `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>`;
  }

  /**
   * Generate structured data for the website
   */
  generateWebsiteStructuredData(siteTitle: string, siteDescription: string, authorName: string): string {
    if (!this.config.enableStructuredData) {
      return '';
    }

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteTitle,
      description: siteDescription,
      url: this.getFullUrl('/'),
      author: {
        '@type': 'Person',
        name: authorName,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: this.getFullUrl('/search?q={search_term_string}'),
        },
        'query-input': 'required name=search_term_string',
      },
    };

    return `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>`;
  }

  /**
   * Generate robots.txt
   */
  async generateRobotsTxt(): Promise<void> {
    try {
      const robotsContent = `User-agent: *
Allow: /

# Sitemaps
Sitemap: ${this.getFullUrl('/sitemap.xml')}
Sitemap: ${this.getFullUrl('/rss.xml')}

# Crawl-delay
Crawl-delay: 1

# Disallow admin areas (if any)
Disallow: /admin/
Disallow: /.git/
Disallow: /node_modules/
`;

      const robotsPath = join(this.outputDir, 'robots.txt');
      await writeFile(robotsPath, robotsContent, 'utf-8');
      
      logger.info('Generated robots.txt');
    } catch (error) {
      logger.error(`Error generating robots.txt: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Generate breadcrumb structured data
   */
  generateBreadcrumbStructuredData(breadcrumbs: Array<{ name: string; url: string }>): string {
    if (!this.config.enableStructuredData || breadcrumbs.length === 0) {
      return '';
    }

    const listItems = breadcrumbs.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: this.getFullUrl(item.url),
    }));

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: listItems,
    };

    return `<script type="application/ld+json">\n${JSON.stringify(structuredData, null, 2)}\n</script>`;
  }

  /**
   * Generate SEO-friendly URL
   */
  generateSEOUrl(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 80); // Limit URL length
  }

  /**
   * Validate and clean meta description
   */
  cleanMetaDescription(description: string): string {
    return description
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 160); // Optimal meta description length
  }

  /**
   * Get performance metrics for SEO
   */
  async getSEOMetrics(posts: BlogPost[]): Promise<{
    totalPages: number;
    postsWithImages: number;
    postsWithDescriptions: number;
    averageContentLength: number;
    duplicateTitles: string[];
    longTitles: string[];
    shortDescriptions: string[];
  }> {
    const publishedPosts = posts.filter(post => !post.frontmatter.draft);
    
    const postsWithImages = publishedPosts.filter(post => {
      const imageUrl = (post.frontmatter as Record<string, unknown>).image;
      return typeof imageUrl === 'string';
    }).length;
    const postsWithDescriptions = publishedPosts.filter(post => post.frontmatter.description).length;
    
    const totalWords = publishedPosts.reduce((sum, post) => sum + post.metadata.wordCount, 0);
    const averageContentLength = publishedPosts.length > 0 ? Math.round(totalWords / publishedPosts.length) : 0;
    
    // Find duplicate titles
    const titleCounts = new Map<string, number>();
    publishedPosts.forEach(post => {
      const title = post.title.toLowerCase();
      titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
    });
    const duplicateTitles = Array.from(titleCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([title]) => title);
    
    // Find long titles (over 60 characters)
    const longTitles = publishedPosts
      .filter(post => post.title.length > 60)
      .map(post => post.title);
    
    // Find short descriptions (under 120 characters)
    const shortDescriptions = publishedPosts
      .filter(post => post.frontmatter.description && post.frontmatter.description.length < 120)
      .map(post => post.title);

    return {
      totalPages: publishedPosts.length,
      postsWithImages,
      postsWithDescriptions,
      averageContentLength,
      duplicateTitles,
      longTitles,
      shortDescriptions,
    };
  }

  /**
   * Helper methods
   */
  private getFullUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.siteUrl}${this.baseUrl}${cleanPath}`.replace(/\/+/g, '/').replace(':/', '://');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
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
  updateConfig(config: SEOConfig): void {
    this.config = config;
    logger.info('SEO configuration updated', config as unknown as Record<string, unknown>);
  }
}