import { writeFile, mkdir, readdir, copyFile } from 'fs/promises';
import { join, dirname } from 'path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import { BlogConfig, BlogPost } from '../types/index.js';

export class AssetProcessor {
  private config: BlogConfig;

  constructor(config: BlogConfig) {
    this.config = config;
  }

  async processAssets(posts?: BlogPost[]): Promise<string[]> {
    const generatedFiles: string[] = [];

    const assetsDir = join(this.config.build.outputDir, 'assets');
    await mkdir(assetsDir, { recursive: true });

    generatedFiles.push(await this.processCSSFiles(assetsDir));
    generatedFiles.push(await this.processJSFiles(assetsDir));
    generatedFiles.push(...await this.processStaticAssets(assetsDir));
    
    // Process post images if posts are provided
    if (posts) {
      generatedFiles.push(...await this.processPostImages(posts));
    }

    return generatedFiles;
  }

  private async processCSSFiles(assetsDir: string): Promise<string> {
    const cssContent = this.getDefaultCSS();
    
    const processor = postcss([
      tailwindcss(),
      autoprefixer(),
    ]);

    const result = await processor.process(cssContent, {
      from: undefined,
    });

    const cssDir = join(assetsDir, 'css');
    await mkdir(cssDir, { recursive: true });
    
    const cssPath = join(cssDir, 'main.css');
    await writeFile(cssPath, result.css, 'utf-8');

    return cssPath;
  }

  private async processJSFiles(assetsDir: string): Promise<string> {
    const jsContent = this.getDefaultSearchJS();
    
    const jsDir = join(assetsDir, 'js');
    await mkdir(jsDir, { recursive: true });
    
    const jsPath = join(jsDir, 'search.js');
    await writeFile(jsPath, jsContent, 'utf-8');

    return jsPath;
  }

  private async processStaticAssets(assetsDir: string): Promise<string[]> {
    const generatedFiles: string[] = [];
    const staticAssetsDir = join(this.config.build.inputDir, 'assets');

    try {
      const files = await this.findAssetFiles(staticAssetsDir);
      
      for (const file of files) {
        const relativePath = file.replace(staticAssetsDir + '/', '');
        const outputPath = join(assetsDir, relativePath);
        
        await mkdir(dirname(outputPath), { recursive: true });
        await copyFile(file, outputPath);
        
        generatedFiles.push(outputPath);
      }
    } catch (error) {
      console.warn('No static assets directory found, skipping...');
    }

    return generatedFiles;
  }

  private async findAssetFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findAssetFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }
    
    return files;
  }

  private async processPostImages(posts: BlogPost[]): Promise<string[]> {
    const generatedFiles: string[] = [];
    
    for (const post of posts) {
      // Each post can have a {post.slug}-images directory
      const postImagesDir = join(dirname(post.filePath), `${post.slug}-images`);
      
      try {
        const imageFiles = await this.findAssetFiles(postImagesDir);
        
        for (const imageFile of imageFiles) {
          // Extract the relative path within the post's image directory
          const relativePath = imageFile.replace(postImagesDir + '/', '');
          
          // Copy to posts/{slug}-images/ in the output directory
          const outputDir = join(this.config.build.outputDir, 'posts', `${post.slug}-images`);
          const outputPath = join(outputDir, relativePath);
          
          await mkdir(dirname(outputPath), { recursive: true });
          await copyFile(imageFile, outputPath);
          
          generatedFiles.push(outputPath);
        }
      } catch (error) {
        // Images directory doesn't exist for this post, which is fine
        continue;
      }
    }
    
    return generatedFiles;
  }

  private getDefaultCSS(): string {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply antialiased;
  }
  
  h1, h2, h3, h4, h5, h6 {
    @apply font-bold;
  }
  
  h1 { @apply text-3xl mb-4; }
  h2 { @apply text-2xl mb-3; }
  h3 { @apply text-xl mb-2; }
  h4 { @apply text-lg mb-2; }
  
  p { @apply mb-4; }
  
  a {
    @apply text-blue-600 hover:text-blue-800 underline;
  }
  
  blockquote {
    @apply border-l-4 border-gray-300 pl-4 italic my-4;
  }
  
  code {
    @apply bg-gray-100 px-1 py-0.5 rounded text-sm font-mono;
  }
  
  pre {
    @apply bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-4 relative;
  }
  
  pre code {
    @apply bg-transparent p-0;
  }
  
  /* Syntax highlighting styles */
  .hljs {
    @apply block overflow-x-auto;
  }
  
  .hljs-comment,
  .hljs-quote {
    @apply text-gray-400 italic;
  }
  
  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-subst {
    @apply text-purple-400 font-medium;
  }
  
  .hljs-number,
  .hljs-literal,
  .hljs-variable,
  .hljs-template-variable,
  .hljs-tag .hljs-attr {
    @apply text-blue-300;
  }
  
  .hljs-string,
  .hljs-doctag {
    @apply text-green-300;
  }
  
  .hljs-title,
  .hljs-section,
  .hljs-selector-id {
    @apply text-yellow-300 font-medium;
  }
  
  .hljs-subst {
    @apply font-normal;
  }
  
  .hljs-type,
  .hljs-class .hljs-title,
  .hljs-tag,
  .hljs-name,
  .hljs-attribute {
    @apply text-orange-300;
  }
  
  .hljs-regexp,
  .hljs-link {
    @apply text-pink-300;
  }
  
  .hljs-symbol,
  .hljs-bullet {
    @apply text-cyan-300;
  }
  
  .hljs-built_in,
  .hljs-builtin-name {
    @apply text-indigo-300;
  }
  
  .hljs-meta {
    @apply text-gray-300;
  }
  
  .hljs-deletion {
    @apply bg-red-900 text-red-200;
  }
  
  .hljs-addition {
    @apply bg-green-900 text-green-200;
  }
  
  .hljs-emphasis {
    @apply italic;
  }
  
  .hljs-strong {
    @apply font-bold;
  }
  
  ul, ol {
    @apply mb-4 pl-6;
  }
  
  ul {
    @apply list-disc;
  }
  
  ol {
    @apply list-decimal;
  }
  
  li {
    @apply mb-1;
  }
  
  table {
    @apply w-full border-collapse border border-gray-300 my-4;
  }
  
  th, td {
    @apply border border-gray-300 px-4 py-2;
  }
  
  th {
    @apply bg-gray-100 font-semibold;
  }
  
  img {
    @apply max-w-full h-auto rounded-lg;
  }
}

@layer components {
  .prose {
    @apply text-gray-900 leading-relaxed;
  }
  
  .prose h1 { @apply text-3xl font-bold mb-6 text-gray-900; }
  .prose h2 { @apply text-2xl font-bold mb-4 text-gray-900; }
  .prose h3 { @apply text-xl font-bold mb-3 text-gray-900; }
  .prose h4 { @apply text-lg font-bold mb-2 text-gray-900; }
  
  .prose p { @apply mb-4 text-gray-700; }
  .prose a { @apply text-blue-600 hover:text-blue-800; }
  
  .prose ul { @apply list-disc list-inside mb-4; }
  .prose ol { @apply list-decimal list-inside mb-4; }
  .prose li { @apply mb-1; }
  
  .prose blockquote {
    @apply border-l-4 border-blue-500 pl-4 italic my-6 text-gray-600;
  }
  
  .prose code {
    @apply bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-sm;
  }
  
  .prose pre {
    @apply bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto my-6 relative;
  }
  
  .prose pre code {
    @apply bg-transparent text-gray-100 p-0;
  }
  
  /* Syntax highlighting for prose content */
  .prose .hljs {
    @apply block overflow-x-auto;
  }
  
  .prose .hljs-comment,
  .prose .hljs-quote {
    @apply text-gray-400 italic;
  }
  
  .prose .hljs-keyword,
  .prose .hljs-selector-tag,
  .prose .hljs-subst {
    @apply text-purple-400 font-medium;
  }
  
  .prose .hljs-number,
  .prose .hljs-literal,
  .prose .hljs-variable,
  .prose .hljs-template-variable,
  .prose .hljs-tag .hljs-attr {
    @apply text-blue-300;
  }
  
  .prose .hljs-string,
  .prose .hljs-doctag {
    @apply text-green-300;
  }
  
  .prose .hljs-title,
  .prose .hljs-section,
  .prose .hljs-selector-id {
    @apply text-yellow-300 font-medium;
  }
  
  .prose .hljs-subst {
    @apply font-normal;
  }
  
  .prose .hljs-type,
  .prose .hljs-class .hljs-title,
  .prose .hljs-tag,
  .prose .hljs-name,
  .prose .hljs-attribute {
    @apply text-orange-300;
  }
  
  .prose .hljs-regexp,
  .prose .hljs-link {
    @apply text-pink-300;
  }
  
  .prose .hljs-symbol,
  .prose .hljs-bullet {
    @apply text-cyan-300;
  }
  
  .prose .hljs-built_in,
  .prose .hljs-builtin-name {
    @apply text-indigo-300;
  }
  
  .prose .hljs-meta {
    @apply text-gray-300;
  }
  
  .prose .hljs-deletion {
    @apply bg-red-900 text-red-200;
  }
  
  .prose .hljs-addition {
    @apply bg-green-900 text-green-200;
  }
  
  .prose .hljs-emphasis {
    @apply italic;
  }
  
  .prose .hljs-strong {
    @apply font-bold;
  }
  
  .prose table {
    @apply w-full border-collapse my-6;
  }
  
  .prose th,
  .prose td {
    @apply border border-gray-300 px-4 py-2 text-left;
  }
  
  .prose th {
    @apply bg-gray-50 font-semibold;
  }
  
  .prose img {
    @apply rounded-lg shadow-md;
  }
}`;
  }

  private getDefaultSearchJS(): string {
    return `class BlogSearch {
  constructor() {
    this.searchIndex = null;
    this.isLoading = false;
    this.initializeEventListeners();
    this.initializeCodeCopyButtons();
  }

  initializeEventListeners() {
    const searchToggle = document.getElementById('search-toggle');
    const searchOverlay = document.getElementById('search-overlay');
    const searchClose = document.getElementById('search-close');
    const searchInput = document.getElementById('search-input');
    const toggleFilters = document.getElementById('toggle-filters');
    const filterControls = document.getElementById('filter-controls');
    const tagFilter = document.getElementById('tag-filter');
    const categoryFilter = document.getElementById('category-filter');

    if (searchToggle) {
      searchToggle.addEventListener('click', () => this.openSearch());
    }

    if (searchClose) {
      searchClose.addEventListener('click', () => this.closeSearch());
    }

    if (searchOverlay) {
      searchOverlay.addEventListener('click', (e) => {
        if (e.target === searchOverlay) {
          this.closeSearch();
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.performSearch(e.target.value);
      });
      
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeSearch();
        }
      });
    }

    if (toggleFilters) {
      toggleFilters.addEventListener('click', () => {
        const isHidden = filterControls.classList.contains('hidden');
        if (isHidden) {
          filterControls.classList.remove('hidden');
          filterControls.classList.add('flex');
          toggleFilters.textContent = 'Hide Filters';
        } else {
          filterControls.classList.add('hidden');
          filterControls.classList.remove('flex');
          toggleFilters.textContent = 'Show Filters';
        }
      });
    }

    if (tagFilter) {
      tagFilter.addEventListener('change', () => this.applyFilters());
    }

    if (categoryFilter) {
      categoryFilter.addEventListener('change', () => this.applyFilters());
    }

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.openSearch();
      }
    });
  }

  async openSearch() {
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    
    if (!searchOverlay || !searchInput) return;

    searchOverlay.classList.remove('hidden');
    searchInput.focus();

    if (!this.searchIndex) {
      await this.loadSearchIndex();
    }
  }

  closeSearch() {
    const searchOverlay = document.getElementById('search-overlay');
    const searchInput = document.getElementById('search-input');
    
    if (!searchOverlay || !searchInput) return;

    searchOverlay.classList.add('hidden');
    searchInput.value = '';
    this.clearResults();
  }

  async loadSearchIndex() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoading();

    try {
      // In development, don't use baseUrl as dev server serves from root
      const baseUrl = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
        ? '' 
        : (window.BLOG_BASE_URL || '');
      
      const searchIndexUrl = baseUrl + '/search-index.json';
      console.log('Loading search index from:', searchIndexUrl);
      
      const response = await fetch(searchIndexUrl, {
        cache: 'no-cache',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load search index: ' + response.status + ' ' + response.statusText);
      }
      
      const text = await response.text();
      if (!text.trim()) {
        throw new Error('Search index is empty');
      }
      
      this.searchIndex = JSON.parse(text);
      
      if (!this.searchIndex || !this.searchIndex.posts) {
        throw new Error('Invalid search index format');
      }
      
      console.log('Search index loaded successfully with ' + this.searchIndex.posts.length + ' posts');
      this.populateFilters();
      this.showSearchHelp();
    } catch (error) {
      console.error('Error loading search index:', error);
      this.showError('Failed to load search data: ' + (error.message || error.toString()));
      
      // Retry after 2 seconds in development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        setTimeout(() => {
          console.log('Retrying search index load...');
          this.loadSearchIndex();
        }, 2000);
      }
    } finally {
      this.isLoading = false;
    }
  }

  populateFilters() {
    if (!this.searchIndex) return;

    const tagFilter = document.getElementById('tag-filter');
    const categoryFilter = document.getElementById('category-filter');

    // Populate tags
    if (tagFilter && this.searchIndex.tags) {
      tagFilter.innerHTML = '<option value="">All Tags</option>';
      this.searchIndex.tags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        option.textContent = tag;
        tagFilter.appendChild(option);
      });
    }

    // Populate categories
    if (categoryFilter && this.searchIndex.categories) {
      categoryFilter.innerHTML = '<option value="">All Categories</option>';
      this.searchIndex.categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
      });
    }
  }

  performSearch(query) {
    if (!this.searchIndex) {
      this.showError('Search index not loaded');
      return;
    }

    if (!query.trim()) {
      this.showSearchHelp();
      return;
    }

    const results = this.searchPosts(query);
    this.displayResults(results, query);
  }

  searchPosts(query) {
    const normalizedQuery = query.toLowerCase().trim();
    const queryTerms = normalizedQuery.split(/\\s+/);
    const results = [];

    for (const post of this.searchIndex.posts) {
      const score = this.calculateSearchScore(post, queryTerms);
      if (score > 0) {
        results.push({ post, score });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results.slice(0, 10); // Limit to top 10 results
  }

  calculateSearchScore(post, queryTerms) {
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

  applyFilters() {
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value.trim()) {
      this.performSearch(searchInput.value);
    }
  }

  displayResults(results, query) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;

    if (results.length === 0) {
      resultsContainer.innerHTML = \`
        <div class="text-gray-500 text-center py-8">
          <p>No results found for "<strong>\${this.escapeHtml(query)}</strong>"</p>
          <p class="text-sm mt-2">Try different keywords or check your spelling</p>
        </div>
      \`;
      return;
    }

    const tagFilter = document.getElementById('tag-filter');
    const categoryFilter = document.getElementById('category-filter');
    const selectedTag = tagFilter ? tagFilter.value : '';
    const selectedCategory = categoryFilter ? categoryFilter.value : '';

    // Apply filters
    let filteredResults = results;
    if (selectedTag) {
      filteredResults = filteredResults.filter(result => 
        result.post.tags.some(tag => tag.toLowerCase() === selectedTag.toLowerCase())
      );
    }
    if (selectedCategory) {
      filteredResults = filteredResults.filter(result => 
        result.post.categories.some(cat => cat.toLowerCase() === selectedCategory.toLowerCase())
      );
    }

    if (filteredResults.length === 0) {
      resultsContainer.innerHTML = \`
        <div class="text-gray-500 text-center py-8">
          <p>No results found with the selected filters</p>
          <p class="text-sm mt-2">Try removing filters or using different keywords</p>
        </div>
      \`;
      return;
    }

    const resultsHtml = filteredResults.map(result => {
      const post = result.post;
      const date = new Date(post.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const tags = post.tags.map(tag => 
        \`<span class="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded mr-1">\${this.escapeHtml(tag)}</span>\`
      ).join('');

      return \`
        <div class="border-b border-gray-200 pb-4 mb-4 last:border-b-0 last:mb-0">
          <h3 class="text-lg font-semibold mb-2">
            <a href="\${((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : (window.BLOG_BASE_URL || '')) + '/posts/' + post.slug + '/'}" class="text-gray-900 hover:text-blue-600" onclick="blogSearch.closeSearch()">
              \${this.highlightMatches(post.title, query)}
            </a>
          </h3>
          <div class="text-sm text-gray-500 mb-2">
            <time datetime="\${post.date}">\${date}</time>
            \${tags ? \` • \${tags}\` : ''}
          </div>
          <p class="text-gray-700 text-sm">
            \${this.highlightMatches(post.excerpt, query)}
          </p>
        </div>
      \`;
    }).join('');

    resultsContainer.innerHTML = \`
      <div class="mb-4">
        <p class="text-sm text-gray-600">
          Found \${filteredResults.length} result\${filteredResults.length === 1 ? '' : 's'} for "<strong>\${this.escapeHtml(query)}</strong>"
        </p>
      </div>
      \${resultsHtml}
    \`;
  }

  highlightMatches(text, query) {
    if (!query.trim()) return this.escapeHtml(text);
    
    const queryTerms = query.toLowerCase().trim().split(/\\s+/);
    let highlightedText = this.escapeHtml(text);
    
    for (const term of queryTerms) {
      const regex = new RegExp(\`(\${this.escapeRegex(term)})\`, 'gi');
      highlightedText = highlightedText.replace(regex, '<mark class="bg-yellow-200">$1</mark>');
    }
    
    return highlightedText;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  escapeRegex(string) {
    return string.replace(/[\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|]/g, '\\$&');
  }

  showLoading() {
    const resultsContainer = document.getElementById('search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = \`
        <div class="text-gray-500 text-center py-8">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading search data...</p>
        </div>
      \`;
    }
  }

  showSearchHelp() {
    const resultsContainer = document.getElementById('search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = \`
        <div class="text-gray-500 text-center py-8">
          <p class="mb-2">Start typing to search posts...</p>
          <p class="text-sm">Search across titles, content, tags, and categories</p>
          <p class="text-xs mt-2 text-gray-400">Press Ctrl+K (Cmd+K on Mac) to open search</p>
        </div>
      \`;
    }
  }

  showError(message) {
    const resultsContainer = document.getElementById('search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = \`
        <div class="text-red-500 text-center py-8">
          <p>\${this.escapeHtml(message)}</p>
        </div>
      \`;
    }
  }

  clearResults() {
    this.showSearchHelp();
  }

  initializeCodeCopyButtons() {
    // Add copy buttons to all code blocks
    document.querySelectorAll('pre').forEach((pre) => {
      // Skip if already has a copy button
      if (pre.querySelector('.copy-button')) return;
      
      // Create copy button
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button absolute top-2 right-2 bg-gray-800 hover:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200';
      copyButton.textContent = 'Copy';
      copyButton.setAttribute('aria-label', 'Copy code to clipboard');
      
      // Make pre relative positioned and add group class for hover effect
      pre.style.position = 'relative';
      pre.classList.add('group');
      
      // Add copy functionality
      copyButton.addEventListener('click', async () => {
        const code = pre.querySelector('code');
        const text = code ? code.textContent : pre.textContent;
        
        try {
          await navigator.clipboard.writeText(text);
          
          // Show success feedback
          const originalText = copyButton.textContent;
          copyButton.textContent = 'Copied!';
          copyButton.classList.add('bg-green-600', 'hover:bg-green-500');
          copyButton.classList.remove('bg-gray-800', 'hover:bg-gray-700');
          
          setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove('bg-green-600', 'hover:bg-green-500');
            copyButton.classList.add('bg-gray-800', 'hover:bg-gray-700');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy code:', err);
          
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.select();
          
          try {
            document.execCommand('copy');
            copyButton.textContent = 'Copied!';
            setTimeout(() => {
              copyButton.textContent = 'Copy';
            }, 2000);
          } catch (fallbackErr) {
            console.error('Fallback copy failed:', fallbackErr);
            copyButton.textContent = 'Failed';
            setTimeout(() => {
              copyButton.textContent = 'Copy';
            }, 2000);
          } finally {
            document.body.removeChild(textArea);
          }
        }
      });
      
      pre.appendChild(copyButton);
    });
  }
}

// Initialize search when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.blogSearch = new BlogSearch();
});`;
  }
}