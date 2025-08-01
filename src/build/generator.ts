import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import Handlebars from 'handlebars';
type HandlebarsTemplateDelegate = Handlebars.TemplateDelegate;
import { BlogConfig, BlogPost, BlogPage } from '../types/index.js';
import { SEOManager } from './seo.js';

export class SiteGenerator {
  private config: BlogConfig;
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private seoManager: SEOManager | undefined;
  private isProduction: boolean = false;

  constructor(config: BlogConfig, seoManager?: SEOManager) {
    this.config = config;
    this.seoManager = seoManager;
    this.registerHelpers();
  }

  setProductionMode(isProduction: boolean): void {
    this.isProduction = isProduction;
    // Re-register helpers with updated production mode
    this.registerHelpers();
  }

  async generateSite(posts: BlogPost[], pages: BlogPage[]): Promise<string[]> {
    const generatedFiles: string[] = [];

    await this.loadTemplates();

    generatedFiles.push(await this.generateHomePage(posts));
    
    for (const post of posts) {
      generatedFiles.push(await this.generatePostPage(post));
    }

    for (const page of pages) {
      generatedFiles.push(await this.generatePage(page));
    }

    generatedFiles.push(await this.generatePostsIndex(posts));
    generatedFiles.push(await this.generateTagsIndex(posts));
    generatedFiles.push(...await this.generateIndividualTagPages(posts));
    generatedFiles.push(await this.generateCategoriesIndex(posts));
    generatedFiles.push(...await this.generateIndividualCategoryPages(posts));
    generatedFiles.push(await this.generate404Page());

    return generatedFiles;
  }

  private async loadTemplates(): Promise<void> {
    const templates = [
      { name: 'layout', content: this.getDefaultLayout() },
      { name: 'home', content: this.getDefaultHomeTemplate() },
      { name: 'post', content: this.getDefaultPostTemplate() },
      { name: 'page', content: this.getDefaultPageTemplate() },
      { name: 'posts-index', content: this.getDefaultPostsIndexTemplate() },
      { name: '404', content: this.getDefault404Template() },
    ];

    for (const template of templates) {
      this.templates.set(template.name, Handlebars.compile(template.content));
    }
  }

  private registerHelpers(): void {
    Handlebars.registerHelper('formatDate', (date: string | Date) => {
      const d = new Date(date);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);
    Handlebars.registerHelper('gt', (a: number, b: number) => a > b);
    Handlebars.registerHelper('lt', (a: number, b: number) => a < b);

    Handlebars.registerHelper('join', (array: string[], separator = ', ') => {
      if (!Array.isArray(array)) return '';
      // Ensure all elements are strings and filter out non-string values
      const stringArray = array.filter(item => typeof item === 'string' || typeof item === 'number');
      return stringArray.join(separator);
    });

    Handlebars.registerHelper('truncate', (str: string, length = 100) => {
      if (!str || str.length <= length) return str;
      return str.substring(0, length) + '...';
    });

    // Helper to generate URLs with baseUrl (only in production)
    Handlebars.registerHelper('url', (path: string) => {
      const baseUrl = this.isProduction ? (this.config.build.baseUrl || '') : '';
      if (!path) return baseUrl || '/';
      
      // Ensure path starts with /
      const cleanPath = path.startsWith('/') ? path : `/${path}`;
      
      // Combine baseUrl with path, avoiding double slashes
      const fullPath = `${baseUrl}${cleanPath}`.replace(/\/+/g, '/');
      
      // Ensure it starts with / if baseUrl is empty
      return fullPath.startsWith('/') ? fullPath : `/${fullPath}`;
    });

    // Helper to concatenate strings
    Handlebars.registerHelper('concat', (...args: unknown[]) => {
      // Remove the options object that Handlebars passes as the last argument
      const strings = args.slice(0, -1);
      return strings.join('');
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  private async generateHomePage(posts: BlogPost[]): Promise<string> {
    const template = this.templates.get('home')!;
    const layout = this.templates.get('layout')!;
    
    const recentPosts = posts.slice(0, 10);
    
    const content = template({
      posts: recentPosts,
      site: this.config.site,
    });

    // Generate meta tags for homepage
    let metaTags = `<title>${this.escapeHtml(this.config.site.title)}</title>
    <meta name="description" content="${this.escapeHtml(this.config.site.description)}">
    <meta name="author" content="${this.escapeHtml(this.config.site.author.name)}">
    <link rel="canonical" href="${this.config.site.url}${this.config.build.baseUrl}/">`;

    if (this.seoManager) {
      const structuredData = this.seoManager.generateWebsiteStructuredData(
        this.config.site.title,
        this.config.site.description,
        this.config.site.author.name
      );
      if (structuredData) {
        metaTags += '\n    ' + structuredData;
      }
    }

    const html = layout({
      content,
      metaTags,
      site: this.config.site,
      build: this.config.build,
    });

    const filePath = join(this.config.build.outputDir, 'index.html');
    await writeFile(filePath, html, 'utf-8');
    
    return filePath;
  }

  private async generatePostPage(post: BlogPost): Promise<string> {
    const template = this.templates.get('post')!;
    const layout = this.templates.get('layout')!;

    const content = template({
      post,
      site: this.config.site,
    });

    // Generate meta tags for post
    let metaTags = '';
    if (this.seoManager) {
      metaTags = this.seoManager.generatePostMetaTags(post, this.config.site.title, this.config.site.author.name);
      
      const structuredData = this.seoManager.generatePostStructuredData(
        post,
        this.config.site.title,
        this.config.site.author.name
      );
      if (structuredData) {
        metaTags += '\n    ' + structuredData;
      }
    } else {
      // Fallback essential meta tags
      const title = `${post.title} | ${this.config.site.title}`;
      const description = post.frontmatter.description || post.excerpt;
      metaTags = `<title>${this.escapeHtml(title)}</title>
    <meta name="description" content="${this.escapeHtml(description)}">
    <meta name="author" content="${this.escapeHtml(this.config.site.author.name)}">
    <link rel="canonical" href="${this.config.site.url}${this.generatePostUrl(post.slug)}">`;
    }

    const html = layout({
      content,
      metaTags,
      site: this.config.site,
      build: this.config.build,
    });

    const postDir = join(this.config.build.outputDir, 'posts', post.slug);
    await mkdir(postDir, { recursive: true });
    
    const filePath = join(postDir, 'index.html');
    await writeFile(filePath, html, 'utf-8');
    
    return filePath;
  }

  private async generatePage(page: BlogPage): Promise<string> {
    const template = this.templates.get('page')!;
    const layout = this.templates.get('layout')!;

    const content = template({
      page,
      site: this.config.site,
    });

    // Generate meta tags for page
    let metaTags = '';
    if (this.seoManager) {
      metaTags = this.seoManager.generatePageMetaTags(page, this.config.site.title);
    } else {
      // Fallback essential meta tags
      const title = page.title === 'Home' ? this.config.site.title : `${page.title} | ${this.config.site.title}`;
      const description = page.frontmatter.description || this.config.site.description;
      const url = page.slug === 'index' ? '/' : `/${page.slug}/`;
      metaTags = `<title>${this.escapeHtml(title)}</title>
    <meta name="description" content="${this.escapeHtml(description)}">
    <meta name="author" content="${this.escapeHtml(this.config.site.author.name)}">
    <link rel="canonical" href="${this.config.site.url}${this.config.build.baseUrl}${url}">`;
    }

    const html = layout({
      content,
      metaTags,
      site: this.config.site,
      build: this.config.build,
    });

    const pageDir = join(this.config.build.outputDir, page.slug);
    await mkdir(pageDir, { recursive: true });
    
    const filePath = join(pageDir, 'index.html');
    await writeFile(filePath, html, 'utf-8');
    
    return filePath;
  }

  private async generatePostsIndex(posts: BlogPost[]): Promise<string> {
    const template = this.templates.get('posts-index')!;
    const layout = this.templates.get('layout')!;

    const content = template({
      posts,
      site: this.config.site,
    });

    const html = layout({
      content,
      title: `Posts - ${this.config.site.title}`,
      description: `All posts from ${this.config.site.title}`,
      site: this.config.site,
      build: this.config.build,
    });

    const postsDir = join(this.config.build.outputDir, 'posts');
    await mkdir(postsDir, { recursive: true });
    
    const filePath = join(postsDir, 'index.html');
    await writeFile(filePath, html, 'utf-8');
    
    return filePath;
  }

  private async generateTagsIndex(posts: BlogPost[]): Promise<string> {
    const allTags = new Set<string>();
    posts.forEach(post => {
      post.frontmatter.tags.forEach(tag => allTags.add(tag));
    });

    const tagsDir = join(this.config.build.outputDir, 'tags');
    await mkdir(tagsDir, { recursive: true });

    const filePath = join(tagsDir, 'index.html');
    const tagsArray = Array.from(allTags).sort();
    
    const layout = this.templates.get('layout')!;
    const content = `
      <div class="max-w-4xl mx-auto py-8">
        <h1 class="text-3xl font-bold mb-8">Tags</h1>
        <div class="flex flex-wrap gap-2">
          ${tagsArray.map(tag => `
            <a href="${this.config.build.baseUrl}/tags/${tag}/" class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm hover:bg-blue-200">
              ${tag}
            </a>
          `).join('')}
        </div>
      </div>
    `;

    const html = layout({
      content,
      title: `Tags - ${this.config.site.title}`,
      description: 'All tags',
      site: this.config.site,
      build: this.config.build,
    });

    await writeFile(filePath, html, 'utf-8');
    return filePath;
  }

  private async generateCategoriesIndex(posts: BlogPost[]): Promise<string> {
    const allCategories = new Set<string>();
    posts.forEach(post => {
      post.frontmatter.categories.forEach(category => allCategories.add(category));
    });

    const categoriesDir = join(this.config.build.outputDir, 'categories');
    await mkdir(categoriesDir, { recursive: true });

    const filePath = join(categoriesDir, 'index.html');
    const categoriesArray = Array.from(allCategories).sort();
    
    // Group posts by category for the expandable content
    const categoryData = categoriesArray.map(category => {
      const categoryPosts = posts.filter(post => post.frontmatter.categories.includes(category));
      return {
        name: category,
        count: categoryPosts.length,
        posts: categoryPosts
      };
    });
    
    const layout = this.templates.get('layout')!;
    const content = `
      <div class="max-w-4xl mx-auto py-8">
        <h1 class="text-3xl font-bold mb-8">Categories</h1>
        <div class="space-y-2">
          ${categoryData.map(category => `
            <div class="border-b border-gray-200 pb-2">
              <div class="flex items-center cursor-pointer hover:bg-gray-50 p-2 rounded" onclick="toggleCategory('${category.name}')">
                <svg class="w-4 h-4 mr-3 transform transition-transform category-arrow" id="arrow-${category.name.replace(/[^a-zA-Z0-9]/g, '-')}" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                </svg>
                <span class="text-lg font-medium text-gray-900">${category.name}</span>
                <span class="ml-2 text-sm text-gray-500">(${category.count} posts)</span>
              </div>
              <div class="category-content hidden ml-7 mt-2 space-y-2" id="content-${category.name.replace(/[^a-zA-Z0-9]/g, '-')}">
                ${category.posts.map(post => `
                  <div class="py-2 pl-4 border-l-2 border-gray-200">
                    <a href="${this.generatePostUrl(post.slug)}" class="text-blue-600 hover:text-blue-800 font-medium">
                      ${post.title}
                    </a>
                    <div class="text-sm text-gray-500 mt-1">
                      <time datetime="${post.frontmatter.date}">${this.formatDate(post.frontmatter.date)}</time>
                    </div>
                    <p class="text-sm text-gray-700 mt-1">${post.excerpt}</p>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <script>
        function toggleCategory(categoryName) {
          const safeId = categoryName.replace(/[^a-zA-Z0-9]/g, '-');
          const content = document.getElementById('content-' + safeId);
          const arrow = document.getElementById('arrow-' + safeId);
          
          if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            arrow.style.transform = 'rotate(180deg)';
          } else {
            content.classList.add('hidden');
            arrow.style.transform = 'rotate(0deg)';
          }
        }
      </script>
      
      <style>
        .category-arrow {
          transition: transform 0.2s ease;
        }
      </style>
    `;

    const html = layout({
      content,
      title: `Categories - ${this.config.site.title}`,
      description: 'All categories',
      site: this.config.site,
      build: this.config.build,
    });

    await writeFile(filePath, html, 'utf-8');
    return filePath;
  }

  private async generateIndividualTagPages(posts: BlogPost[]): Promise<string[]> {
    const allTags = new Set<string>();
    posts.forEach(post => {
      post.frontmatter.tags.forEach(tag => allTags.add(tag));
    });

    const generatedFiles: string[] = [];
    const layout = this.templates.get('layout')!;

    for (const tag of allTags) {
      const tagPosts = posts.filter(post => post.frontmatter.tags.includes(tag));
      
      const content = `
        <div class="max-w-4xl mx-auto px-4 py-8">
          <h1 class="text-3xl font-bold mb-8">Posts tagged "${tag}"</h1>
          
          <div class="space-y-6">
            ${tagPosts.map(post => `
              <article class="border-b pb-6 last:border-b-0">
                <h2 class="text-xl font-semibold mb-2">
                  <a href="${this.generatePostUrl(post.slug)}" class="text-gray-900 hover:text-blue-600">${post.title}</a>
                </h2>
                <div class="text-sm text-gray-500 mb-3">
                  <time datetime="${post.frontmatter.date}">${this.formatDate(post.frontmatter.date)}</time>
                  ${post.frontmatter.tags.length > 0 ? '• ' + post.frontmatter.tags.join(', ') : ''}
                </div>
                <p class="text-gray-700">${post.excerpt}</p>
              </article>
            `).join('')}
          </div>
          
          <div class="mt-8">
            <a href="${this.config.build.baseUrl}/tags/" class="text-blue-600 hover:text-blue-800">← Back to all tags</a>
          </div>
        </div>
      `;

      const html = layout({
        content,
        title: `Posts tagged "${tag}" - ${this.config.site.title}`,
        description: `All posts tagged with ${tag}`,
        site: this.config.site,
        build: this.config.build,
      });

      const tagDir = join(this.config.build.outputDir, 'tags', tag);
      await mkdir(tagDir, { recursive: true });
      
      const filePath = join(tagDir, 'index.html');
      await writeFile(filePath, html, 'utf-8');
      generatedFiles.push(filePath);
    }

    return generatedFiles;
  }

  private async generateIndividualCategoryPages(posts: BlogPost[]): Promise<string[]> {
    const allCategories = new Set<string>();
    posts.forEach(post => {
      post.frontmatter.categories.forEach(category => allCategories.add(category));
    });

    const generatedFiles: string[] = [];
    const layout = this.templates.get('layout')!;

    for (const category of allCategories) {
      const categoryPosts = posts.filter(post => post.frontmatter.categories.includes(category));
      
      const content = `
        <div class="max-w-4xl mx-auto px-4 py-8">
          <h1 class="text-3xl font-bold mb-8">Posts in "${category}"</h1>
          
          <div class="space-y-6">
            ${categoryPosts.map(post => `
              <article class="border-b pb-6 last:border-b-0">
                <h2 class="text-xl font-semibold mb-2">
                  <a href="${this.generatePostUrl(post.slug)}" class="text-gray-900 hover:text-blue-600">${post.title}</a>
                </h2>
                <div class="text-sm text-gray-500 mb-3">
                  <time datetime="${post.frontmatter.date}">${this.formatDate(post.frontmatter.date)}</time>
                  ${post.frontmatter.tags.length > 0 ? '• ' + post.frontmatter.tags.join(', ') : ''}
                </div>
                <p class="text-gray-700">${post.excerpt}</p>
              </article>
            `).join('')}
          </div>
          
          <div class="mt-8">
            <a href="${this.config.build.baseUrl}/categories/" class="text-blue-600 hover:text-blue-800">← Back to all categories</a>
          </div>
        </div>
      `;

      const html = layout({
        content,
        title: `Posts in "${category}" - ${this.config.site.title}`,
        description: `All posts in category ${category}`,
        site: this.config.site,
        build: this.config.build,
      });

      const categoryDir = join(this.config.build.outputDir, 'categories', category);
      await mkdir(categoryDir, { recursive: true });
      
      const filePath = join(categoryDir, 'index.html');
      await writeFile(filePath, html, 'utf-8');
      generatedFiles.push(filePath);
    }

    return generatedFiles;
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  private async generate404Page(): Promise<string> {
    const template = this.templates.get('404')!;
    const layout = this.templates.get('layout')!;

    const content = template({
      site: this.config.site,
    });

    const html = layout({
      content,
      title: `404 - Page Not Found - ${this.config.site.title}`,
      description: 'Page not found',
      site: this.config.site,
      build: this.config.build,
    });

    const filePath = join(this.config.build.outputDir, '404.html');
    await writeFile(filePath, html, 'utf-8');
    
    return filePath;
  }

  private getDefaultLayout(): string {
    return `<!DOCTYPE html>
<html lang="{{site.language}}" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  {{{metaTags}}}
  <link href="{{url '/assets/css/main.css'}}" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" integrity="sha384-n8MVd4RsNIU0tAv4ct0nTaAbDJwPJzDEaqSD1odI+WdtXRGWt2kTvGFasHpSy3SV" crossorigin="anonymous">
  <script>
    window.BLOG_BASE_URL = '{{#if build.baseUrl}}{{build.baseUrl}}{{/if}}';
  </script>
</head>
<body class="min-h-full bg-white text-gray-900">
  <header class="bg-white shadow-sm border-b">
    <div class="max-w-4xl mx-auto px-4 py-4">
      <nav class="flex items-center justify-between">
        <a href="{{url '/'}}" class="text-xl font-bold text-gray-900">{{site.title}}</a>
        <div class="flex items-center space-x-6">
          <a href="{{url '/'}}" class="text-gray-600 hover:text-gray-900">Home</a>
          <a href="{{url '/posts/'}}" class="text-gray-600 hover:text-gray-900">Posts</a>
          <a href="{{url '/categories/'}}" class="text-gray-600 hover:text-gray-900">Categories</a>
          <a href="{{url '/about/'}}" class="text-gray-600 hover:text-gray-900">About</a>
          <button id="search-toggle" class="text-gray-600 hover:text-gray-900">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>
        </div>
      </nav>
    </div>
  </header>

  <!-- Search Overlay -->
  <div id="search-overlay" class="fixed inset-0 z-50 hidden bg-black bg-opacity-50">
    <div class="flex items-start justify-center min-h-screen pt-16 px-4">
      <div class="bg-white rounded-lg shadow-lg w-full max-w-2xl">
        <div class="p-4 border-b">
          <div class="flex items-center space-x-2">
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              id="search-input"
              type="text"
              placeholder="Search posts..."
              class="flex-1 border-none outline-none text-lg"
              autocomplete="off"
            />
            <button id="search-close" class="text-gray-400 hover:text-gray-600">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="p-4">
          <!-- Search Filters -->
          <div id="search-filters" class="mb-4">
            <div id="filter-controls" class="hidden flex-wrap gap-2 mb-2">
              <select id="tag-filter" class="text-sm border border-gray-300 rounded px-2 py-1">
                <option value="">All Tags</option>
              </select>
              <select id="category-filter" class="text-sm border border-gray-300 rounded px-2 py-1">
                <option value="">All Categories</option>
              </select>
            </div>
            <button id="toggle-filters" class="text-sm text-blue-600 hover:text-blue-800">Show Filters</button>
          </div>
          
          <!-- Search Results -->
          <div id="search-results" class="max-h-96 overflow-y-auto">
            <div id="search-help" class="text-gray-500 text-center py-8">
              Start typing to search posts...
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <main class="flex-1">
    {{{content}}}
  </main>

  <footer class="bg-gray-50 mt-16">
    <div class="max-w-4xl mx-auto px-4 py-8">
      <p class="text-center text-gray-600">
        © {{site.author.name}} • Built with fyer-blog-template
      </p>
    </div>
  </footer>

  <script src="{{url '/assets/js/search.js'}}"></script>
</body>
</html>`;
  }

  private getDefaultHomeTemplate(): string {
    return `<div class="max-w-4xl mx-auto px-4 py-8">
  <div class="text-center mb-12">
    <h1 class="text-4xl font-bold mb-4">{{site.title}}</h1>
    <p class="text-xl text-gray-600">{{site.description}}</p>
  </div>

  <div class="space-y-8">
    <h2 class="text-2xl font-bold mb-6">Recent Posts</h2>
    {{#each posts}}
    <article class="border-b pb-6 last:border-b-0{{#if frontmatter.pinned}} border-yellow-200 bg-yellow-50{{/if}}">
      <h3 class="text-xl font-semibold mb-2">
        <a href="{{url (concat '/posts/' slug '/')}}" class="text-gray-900 hover:text-blue-600">
          {{#if frontmatter.pinned}}<span class="inline-block bg-yellow-500 text-white text-xs px-2 py-1 rounded mr-2">📌 PINNED</span>{{/if}}{{title}}
        </a>
      </h3>
      <div class="text-sm text-gray-500 mb-3">
        <time datetime="{{frontmatter.date}}">{{formatDate frontmatter.date}}</time>
        {{#if frontmatter.tags.length}}
        • {{#each frontmatter.tags}}<span class="text-gray-600">{{this}}</span>{{#unless @last}}, {{/unless}}{{/each}}
        {{/if}}
      </div>
      <p class="text-gray-700">{{#if frontmatter.description}}{{frontmatter.description}}{{else}}{{excerpt}}{{/if}}</p>
    </article>
    {{/each}}
  </div>

  <div class="text-center mt-8">
    <a href="{{url '/posts/'}}" class="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
      View All Posts
    </a>
  </div>
</div>`;
  }

  private getDefaultPostTemplate(): string {
    return `<article class="max-w-4xl mx-auto px-4 py-8">
  <header class="mb-8">
    <h1 class="text-4xl font-bold mb-4">{{post.title}}</h1>
    <div class="text-gray-600 mb-4">
      <time datetime="{{post.frontmatter.date}}">{{formatDate post.frontmatter.date}}</time>
      • {{post.metadata.readingTime}} min read
      {{#if post.frontmatter.tags.length}}
      <div class="mt-2">
        Tags: 
        {{#each post.frontmatter.tags}}
        <span class="inline-block bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded mr-2">{{this}}</span>
        {{/each}}
      </div>
      {{/if}}
      {{#if post.frontmatter.categories.length}}
      <div class="mt-2">
        Categories: 
        {{#each post.frontmatter.categories}}
        <span class="inline-block bg-green-100 text-green-800 text-sm px-2 py-1 rounded mr-2">{{this}}</span>
        {{/each}}
      </div>
      {{/if}}
    </div>
  </header>

  <div class="prose prose-lg max-w-none">
    {{{post.content}}}
  </div>
</article>`;
  }

  private getDefaultPageTemplate(): string {
    return `<div class="max-w-4xl mx-auto px-4 py-8">
  <header class="mb-8">
    <h1 class="text-4xl font-bold">{{page.title}}</h1>
  </header>

  <div class="prose prose-lg max-w-none">
    {{{page.content}}}
  </div>
</div>`;
  }

  private getDefaultPostsIndexTemplate(): string {
    return `<div class="max-w-4xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">All Posts</h1>

  <div class="space-y-6">
    {{#each posts}}
    <article class="border-b pb-6 last:border-b-0{{#if frontmatter.pinned}} border-yellow-200 bg-yellow-50{{/if}}">
      <h2 class="text-xl font-semibold mb-2">
        <a href="{{url (concat '/posts/' slug '/')}}" class="text-gray-900 hover:text-blue-600">
          {{#if frontmatter.pinned}}<span class="inline-block bg-yellow-500 text-white text-xs px-2 py-1 rounded mr-2">📌 PINNED</span>{{/if}}{{title}}
        </a>
      </h2>
      <div class="text-sm text-gray-500 mb-3">
        <time datetime="{{frontmatter.date}}">{{formatDate frontmatter.date}}</time>
        {{#if frontmatter.tags.length}}
        • {{#each frontmatter.tags}}<span class="text-gray-600">{{this}}</span>{{#unless @last}}, {{/unless}}{{/each}}
        {{/if}}
      </div>
      <p class="text-gray-700">{{#if frontmatter.description}}{{frontmatter.description}}{{else}}{{excerpt}}{{/if}}</p>
    </article>
    {{/each}}
  </div>
</div>`;
  }

  private generatePostUrl(slug: string): string {
    const baseUrl = this.isProduction ? (this.config.build.baseUrl || '') : '';
    return `${baseUrl}/posts/${slug}/`;
  }

  private getDefault404Template(): string {
    return `<div class="max-w-4xl mx-auto px-4 py-16 text-center">
  <h1 class="text-6xl font-bold text-gray-900 mb-4">404</h1>
  <h2 class="text-2xl font-semibold text-gray-700 mb-4">Page Not Found</h2>
  <p class="text-gray-600 mb-8">The page you're looking for doesn't exist.</p>
  <a href="{{url '/'}}" class="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
    Go Home
  </a>
</div>`;
  }
}