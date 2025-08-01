import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { CLIArgs, PostTemplate } from '../../types/index.js';
import { ConfigManager } from '../../core/config.js';
import { generateSlug, formatDate } from '../../utils/helpers.js';

export class NewPostCommand {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async execute(options: CLIArgs): Promise<void> {
    try {
      const config = await this.configManager.loadConfig();
      
      const title = await this.getTitle(options.title as string);
      const template = await this.getTemplate(options.template as string);
      const isDraft = options.draft as boolean;

      const post = await this.createPost(title, template, isDraft);
      const filePath = await this.savePost(post, config.build.inputDir, isDraft);

      console.log(`✅ Created new post: ${filePath}`);
      console.log(`📝 Title: ${title}`);
      console.log(`🔗 Slug: ${post.slug}`);
      
      if (isDraft) {
        console.log('📄 Status: Draft');
      }
    } catch (error) {
      console.error('❌ Error creating post:', error);
      process.exit(1);
    }
  }

  private async getTitle(providedTitle?: string): Promise<string> {
    if (providedTitle) {
      return providedTitle;
    }

    const { createPromptModule } = await import('inquirer');
    const prompt = createPromptModule();
    
    const { title } = await prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Enter post title:',
        validate: (input: string): string | boolean => {
          if (input.trim().length === 0) {
            return 'Title cannot be empty';
          }
          return true;
        },
      },
    ]);

    return title;
  }

  private async getTemplate(templateName: string): Promise<PostTemplate> {
    const templates: Record<string, PostTemplate> = {
      default: {
        name: 'default',
        content: `Write your blog post content here using Markdown.

## Introduction

Add your introduction here.

## Main Content

Add your main content here.

<!-- Image Handling -->
<!-- To add images to your post: -->
<!-- 1. Copy images to the '{slug}-images/' directory -->
<!-- 2. Reference them like: ![Alt text]({slug}-images/filename.jpg) -->
<!-- 3. Set the 'image' field in frontmatter to the main image for social sharing -->

## Conclusion

Add your conclusion here.`,
        frontmatter: {
          tags: [],
          categories: [],
          draft: false,
          description: '',
        },
      },
    };

    const template = templates[templateName];
    if (!template) {
      throw new Error(`Template '${templateName}' not found`);
    }

    return template;
  }

  private async createPost(
    title: string,
    template: PostTemplate,
    isDraft: boolean
  ): Promise<{ slug: string; content: string; frontmatter: Record<string, unknown> }> {
    const slug = generateSlug(title);
    const now = new Date();

    const frontmatter = {
      ...template.frontmatter,
      title,
      date: formatDate(now),
      slug,
      draft: isDraft,
    };

    const frontmatterYaml = this.generateFrontmatter(frontmatter);
    const content = `---\n${frontmatterYaml}\n---\n\n${template.content}`;

    return {
      slug,
      content,
      frontmatter,
    };
  }

  private generateFrontmatter(frontmatter: Record<string, unknown>): string {
    const lines: string[] = [];
    
    for (const [key, value] of Object.entries(frontmatter)) {
      if (Array.isArray(value)) {
        if (value.length === 0) {
          lines.push(`${key}: []`);
        } else {
          lines.push(`${key}:`);
          value.forEach((item) => {
            lines.push(`  - ${item}`);
          });
        }
      } else if (typeof value === 'string') {
        lines.push(`${key}: "${value}"`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }

    return lines.join('\n');
  }

  private async savePost(
    post: { slug: string; content: string },
    inputDir: string,
    isDraft: boolean
  ): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    const subDir = isDraft ? 'drafts' : `posts/${year}/${month}`;
    const postsDir = join(inputDir, subDir);
    
    // Check if post already exists - throw error immediately instead of generating unique name
    await this.checkForDuplicatePost(post.slug, postsDir);
    const filePath = join(postsDir, `${post.slug}.md`);

    // Create the post directory
    await mkdir(dirname(filePath), { recursive: true });
    
    // Create images directory for the post
    const imagesDir = join(dirname(filePath), `${post.slug}-images`);
    await mkdir(imagesDir, { recursive: true });
    
    await writeFile(filePath, post.content, 'utf-8');

    return filePath;
  }

  private async checkForDuplicatePost(slug: string, directory: string): Promise<void> {
    const { access } = await import('fs/promises');
    const filePath = join(directory, `${slug}.md`);
    
    try {
      await access(filePath);
      // File exists - throw error immediately
      const relativePath = filePath.replace(process.cwd(), '.');
      throw new Error(
        `Post with name "${slug}" already exists at ${relativePath}.\n\n` +
        `ERROR: Duplicate post names are not allowed.\n` +
        `Please choose a different title for your post.\n\n` +
        `WARNING: Do not manually rename .md files created by npm, as this can cause conflicts.\n` +
        `Always use the npm command to create new posts.`
      );
    } catch (error) {
      // If it's not a file access error, re-throw it
      if ((error as Error & { code?: string }).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist - we can proceed
    }
  }
}