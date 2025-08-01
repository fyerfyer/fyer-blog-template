import { readFile, writeFile } from 'fs/promises';
import { BlogConfig } from '../types/index.js';

export class ConfigManager {
  private config: BlogConfig | null = null;
  private configPath: string;

  constructor(configPath = './config/blog.config.json') {
    this.configPath = configPath;
  }

  async loadConfig(): Promise<BlogConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const configContent = await readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configContent);
      return this.config!;
    } catch (error) {
      console.warn(`Config file not found at ${this.configPath}, using defaults`);
      this.config = this.getDefaultConfig();
      return this.config;
    }
  }

  getConfig(): BlogConfig | null {
    return this.config;
  }

  async saveConfig(config: BlogConfig): Promise<void> {
    this.config = config;
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private getDefaultConfig(): BlogConfig {
    return {
      site: {
        title: 'My Personal Blog',
        description: 'A blog about technology and life',
        url: 'https://example.github.io/blog',
        author: {
          name: 'Blog Author',
          email: 'author@example.com',
        },
        language: 'en',
        timezone: 'UTC',
      },
      build: {
        inputDir: './content',
        outputDir: './dist',
        baseUrl: '/',
        includeDrafts: false,
        optimization: {
          minifyHTML: true,
          minifyCSS: true,
          minifyJS: true,
          optimizeImages: true,
          generateWebP: true,
          generateSitemap: true,
          generateRSS: true,
        },
      },
      theme: {
        name: 'default',
        customization: {
          primaryColor: '#3b82f6',
          fontFamily: 'Inter, sans-serif',
          darkMode: true,
        },
      },
    };
  }
}