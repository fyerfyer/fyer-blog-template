export interface BlogConfig {
  site: SiteConfig;
  build: BuildConfig;
  theme: ThemeConfig;
  seo?: SEOConfig;
  features?: FeaturesConfig;
  feed?: FeedConfig;
  plugins?: PluginConfig[];
}

export interface SiteConfig {
  title: string;
  description: string;
  url: string;
  author: AuthorConfig;
  language: string;
  timezone: string;
}

export interface AuthorConfig {
  name: string;
  email: string;
  url?: string;
  avatar?: string;
}

export interface BuildConfig {
  inputDir: string;
  outputDir: string;
  baseUrl: string;
  includeDrafts: boolean;
  optimization: OptimizationConfig;
}

export interface OptimizationConfig {
  minifyHTML: boolean;
  minifyCSS: boolean;
  minifyJS: boolean;
  optimizeImages: boolean;
  generateWebP: boolean;
  generateSitemap: boolean;
  generateRSS: boolean;
}

export interface ThemeConfig {
  name: string;
  customization: Record<string, unknown>;
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  frontmatter: PostFrontmatter;
  metadata: PostMetadata;
  filePath: string;
  relatedPosts?: PostRelation[];
}

export interface PostFrontmatter {
  title: string;
  date: Date;
  tags: string[];
  categories: string[];
  draft?: boolean;
  description?: string;
  pinned?: boolean;
  [key: string]: unknown;
}

export interface PostMetadata {
  wordCount: number;
  readingTime: number;
  lastModified: Date;
  checksum: string;
  characterCount?: number;
  paragraphCount?: number;
  headingCount?: number;
  codeBlockCount?: number;
  linkCount?: number;
}

export interface BlogPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  frontmatter: PageFrontmatter;
  metadata: PostMetadata;
  filePath: string;
}

export interface PageFrontmatter {
  title: string;
  description?: string;
  layout?: string;
  [key: string]: unknown;
}

export interface BuildResult {
  success: boolean;
  buildTime: number;
  generatedFiles: string[];
  optimization?: OptimizationResult;
  errors?: string[];
}

export interface CLIArgs {
  [key: string]: string | boolean | undefined;
}

export interface PostTemplate {
  name: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export abstract class BlogError extends Error {
  abstract code: string;
  abstract statusCode: number;
}

export class ContentError extends BlogError {
  code = 'CONTENT_ERROR';
  statusCode = 400;
}

export class BuildError extends BlogError {
  code = 'BUILD_ERROR';
  statusCode = 500;
}

export class ValidationError extends BlogError {
  code = 'VALIDATION_ERROR';
  statusCode = 400;
  
  constructor(
    message: string,
    public field: string,
    public value: unknown
  ) {
    super(message);
  }
}

export class DeployError extends BlogError {
  code = 'DEPLOY_ERROR';
  statusCode = 502;
}

// Deployment is handled by GitHub Actions
// No manual deployment interfaces needed

// Optimization interfaces
export interface OptimizationResult {
  html: AssetOptimization;
  css: AssetOptimization;
  js: AssetOptimization;
  images: AssetOptimization;
  totalSavings: number;
}

export interface AssetOptimization {
  originalSize: number;
  optimizedSize: number;
  savings: number;
}

// SEO and Features Configuration
export interface SEOConfig {
  enableStructuredData: boolean;
  enableOpenGraph: boolean;
  enableTwitterCard: boolean;
  defaultImage?: string;
}

export interface FeaturesConfig {
  search: SearchConfig;
  relatedPosts: RelatedPostsConfig;
  archives: ArchivesConfig;
  drafts: DraftsConfig;
}

export interface SearchConfig {
  enabled: boolean;
  engine: 'simple' | 'fuse';
}

export interface RelatedPostsConfig {
  enabled: boolean;
  maxCount: number;
  method: 'tags' | 'categories' | 'content';
}

export interface ArchivesConfig {
  enabled: boolean;
  groupBy: 'year' | 'month' | 'category';
}

export interface DraftsConfig {
  enabled: boolean;
  previewMode: boolean;
}

export interface FeedConfig {
  rss: FeedItemConfig;
  atom: FeedItemConfig;
  json: FeedItemConfig;
}

export interface FeedItemConfig {
  enabled: boolean;
  filename: string;
  maxItems: number;
}

// Archive interfaces
export interface Archive {
  year: number;
  month?: number;
  posts: BlogPost[];
  count: number;
}

export interface ArchiveIndex {
  yearly: Archive[];
  monthly: Archive[];
  total: number;
}

// Search interfaces
export interface SearchIndex {
  posts: SearchablePost[];
  tags: string[];
  categories: string[];
}

export interface SearchablePost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  categories: string[];
  date: string;
  slug: string;
}

export interface SearchResult {
  post: SearchablePost;
  score: number;
  matches: SearchMatch[];
}

export interface SearchMatch {
  field: string;
  indices: [number, number][];
  value: string;
}

// Related posts interface
export interface PostRelation {
  post: BlogPost;
  score: number;
  commonTags: string[];
  commonCategories: string[];
}

// Sitemap interfaces
export interface SitemapEntry {
  url: string;
  lastmod: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: number;
}

// RSS/Feed interfaces
export interface FeedItem {
  title: string;
  description: string;
  url: string;
  date: Date;
  author: string;
  categories: string[];
  content: string;
}

// Draft management
export interface DraftPost extends BlogPost {
  scheduledDate?: Date;
  publishStatus: 'draft' | 'scheduled' | 'published';
  lastPreview?: Date;
}