import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';
import matter from 'gray-matter';
import { visit } from 'unist-util-visit';
import type { Node } from 'unist';
import type { Image } from 'mdast';
import { BlogPost, PostFrontmatter, PostMetadata } from '../types/index.js';
import { calculateReadingTime, extractExcerpt, createId, generateSlug } from '../utils/helpers.js';
import { createHash } from 'crypto';

/**
 * Remark plugin to transform relative image paths to absolute paths
 * Converts {slug}-images/filename.jpg to /posts/{slug}-images/filename.jpg
 * In production, applies baseUrl prefix for GitHub Pages deployment
 */
function remarkImagePaths(slug?: string, baseUrl?: string, isProduction?: boolean): (tree: Node) => void {
  return (tree: Node): void => {
    if (!slug) return;
    
    visit(tree, 'image', (node: Image) => {
      if (node.url && typeof node.url === 'string') {
        const imagePathPattern = new RegExp(`^${slug}-images/(.+)$`);
        const match = node.url.match(imagePathPattern);
        
        if (match) {
          // Build the image path
          const imagePath = `/posts/${slug}-images/${match[1]}`;
          
          // Apply baseUrl only in production mode
          if (isProduction && baseUrl) {
            node.url = `${baseUrl}${imagePath}`;
          } else {
            node.url = imagePath;
          }
        }
      }
    });
  };
}

export class ContentParser {
  private processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype)
    .use(rehypeKatex)
    .use(rehypeHighlight, {
      detect: true, // Enable automatic language detection
      subset: ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash', 'shell', 'sql', 'php', 'java', 'c', 'cpp', 'rust', 'go', 'ruby', 'yaml', 'xml', 'markdown'],
      ignoreMissing: true, // Don't throw errors for unknown languages
      plainText: ['txt', 'text']
    })
    .use(rehypeStringify);

  private baseUrl?: string;
  private isProduction: boolean = false;

  constructor(baseUrl?: string, isProduction?: boolean) {
    if (baseUrl !== undefined) {
      this.baseUrl = baseUrl;
    }
    this.isProduction = isProduction || false;
  }

  async parsePost(content: string, filePath: string): Promise<BlogPost> {
    const { data: frontmatter, content: markdownContent } = matter(content);
    
    // Extract slug from file path or frontmatter, ensuring uniqueness
    const slug = this.generateUniqueSlug(filePath, frontmatter.slug, frontmatter.title);
    
    // Create a custom processor with image path transformation for this post
    const postProcessor = unified()
      .use(remarkParse)
      .use(remarkFrontmatter, ['yaml'])
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkImagePaths, slug, this.baseUrl, this.isProduction) // Add our custom image path plugin
      .use(remarkRehype)
      .use(rehypeKatex)
      .use(rehypeHighlight, {
        detect: true, // Enable automatic language detection
        subset: ['javascript', 'typescript', 'python', 'html', 'css', 'json', 'bash', 'shell', 'sql', 'php', 'java', 'c', 'cpp', 'rust', 'go', 'ruby', 'yaml', 'xml', 'markdown'],
        ignoreMissing: true, // Don't throw errors for unknown languages
        plainText: ['txt', 'text']
      })
      .use(rehypeStringify);
    
    const processedContent = await postProcessor.process(markdownContent);
    const htmlContent = String(processedContent);

    const metadata = this.generateMetadata(content, markdownContent);
    const excerpt = frontmatter.excerpt || extractExcerpt(markdownContent);

    return {
      id: createId(),
      slug,
      title: frontmatter.title || 'Untitled',
      content: htmlContent,
      excerpt,
      frontmatter: this.validateFrontmatter(frontmatter),
      metadata,
      filePath,
    };
  }

  private validateFrontmatter(frontmatter: Record<string, unknown>): PostFrontmatter {
    return {
      title: (frontmatter.title as string) || 'Untitled',
      date: new Date((frontmatter.date as string | Date) || Date.now()),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [],
      categories: Array.isArray(frontmatter.categories) ? frontmatter.categories as string[] : [],
      draft: Boolean(frontmatter.draft),
      description: (frontmatter.description as string) || '',
      pinned: Boolean(frontmatter.pinned || frontmatter.sticky),
      ...frontmatter,
    };
  }

  private generateMetadata(rawContent: string, markdownContent: string): PostMetadata {
    const wordCount = markdownContent.split(/\s+/).length;
    const readingTime = calculateReadingTime(markdownContent);
    const checksum = createHash('md5').update(rawContent).digest('hex');

    return {
      wordCount,
      readingTime,
      lastModified: new Date(),
      checksum,
    };
  }

  private extractSlugFromPath(filePath: string): string {
    const fileName = filePath.split('/').pop() || '';
    return fileName.replace(/\.md$/, '');
  }

  private generateUniqueSlug(filePath: string, frontmatterSlug?: string, title?: string): string {
    // If frontmatter has a slug, use it
    if (frontmatterSlug) {
      return frontmatterSlug;
    }

    // Extract filename without extension as base slug
    const fileSlug = this.extractSlugFromPath(filePath);
    
    // If filename is already unique, use it
    if (fileSlug && fileSlug !== 'untitled') {
      return fileSlug;
    }

    // Generate slug from title if available
    if (title) {
      const titleSlug = generateSlug(title);
      
      // Add a hash based on file path to ensure uniqueness
      const pathHash = createHash('md5').update(filePath).digest('hex').substring(0, 8);
      return `${titleSlug}-${pathHash}`;
    }

    // Fallback: use filename with path hash
    const pathHash = createHash('md5').update(filePath).digest('hex').substring(0, 8);
    return `${fileSlug || 'post'}-${pathHash}`;
  }

  async parseMarkdownToHtml(markdown: string): Promise<string> {
    const processed = await this.processor.process(markdown);
    return String(processed);
  }
}