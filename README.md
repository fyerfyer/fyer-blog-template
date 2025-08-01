# Fyer Blog

A modern, TypeScript-based static site generator optimized for performance and developer experience. Built with incremental building, hot reload, and comprehensive SEO features.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm 9+
- Git for version control

### 1. Clone the Repository

```bash
git clone https://github.com/fyerfyer/fyer-blog-template.git
cd fyer-blog-template
npm install
```

### 2. Configure Your Blog

Edit `config/blog.config.json` to set up your blog:

```json
{
  "site": {
    "title": "Your Blog Title",
    "description": "Your blog description",
    "url": "https://yourusername.github.io/your-repo-name",
    "author": {
      "name": "Your Name",
      "email": "your@email.com",
      "url": "https://github.com/yourusername"
    }
  },
  "build": {
    "baseUrl": "/your-repo-name"
  }
}
```

### 3. Set Up GitHub Actions (Recommended)

**⚠️ Important: Use GitHub Actions for deployment, NOT `npm run deploy`**

1. Go to your GitHub repository → Settings → Pages
2. Set Source to "GitHub Actions"
3. Push to main branch to trigger automatic deployment

The included GitHub Actions workflow will automatically:
- Build your site
- Run tests and performance checks
- Deploy to GitHub Pages
- Monitor with Lighthouse

## 📝 Creating Content

### ⚠️ Always Use NPM Commands

**NEVER manually create Markdown files.** Always use the CLI commands:

```bash
# Create a new blog post
npm run new

# Create with specific title
npm run new -- --title "My Post Title"

# Create as draft
npm run new -- --title "Draft Post" --draft
```

### ⚠️ Avoid Duplicate Names

**Do NOT create posts with the same name** - this will cause bugs and conflicts. The CLI will prevent duplicates and show an error if you try.

## 🏗️ Development Commands

```bash
# Start development server with hot reload
npm run dev

# Build for production
npm run build

# Validate content and configuration
npm run validate

# Run tests
npm run test

# Type checking
npm run type-check

# Linting
npm run lint
```

## 📄 Blog Post Structure

### Frontmatter Fields

Every post includes metadata in YAML frontmatter:

```yaml
---
title: "Your Post Title"
date: "2025-01-15T10:00:00.000Z"
slug: "your-post-title"
description: "Post description for SEO"
tags: ["typescript", "blog"]
categories: ["tech"]
image: "your-post-title-images/featured.jpg"
draft: false
---
```

### Content Components

**Text Content:**
- Standard Markdown syntax
- GitHub Flavored Markdown (GFM)
- Math expressions with KaTeX (`$inline$` and `$$block$$`)
- Syntax highlighting for code blocks

**Images:**
When you create a post, an images directory is automatically created:

```
content/posts/2025/01/your-post-title-images/
```

**Image Rendering Logic:**
1. Copy images to the `{slug}-images/` directory
2. Reference in Markdown: `![Alt text]({slug}-images/filename.jpg)`
3. Set the `image` field in frontmatter for social sharing
4. Images are automatically optimized during build:
   - JPEG/PNG compression
   - WebP generation (if enabled)
   - Responsive image generation

**Example:**
```markdown
![My Image](my-post-title-images/example.jpg)
```

## 🏛️ Project Architecture

### Core Structure

```
├── src/
│   ├── cli/           # Command-line interface
│   ├── build/         # Build pipeline and optimization
│   ├── content/       # Content processing and management
│   ├── core/          # Configuration management
│   ├── types/         # TypeScript definitions
│   └── utils/         # Utility functions
├── content/           # Your blog content
│   ├── posts/         # Blog posts (organized by date)
│   ├── pages/         # Static pages
│   └── drafts/        # Draft posts
├── config/            # Configuration files
└── dist/              # Generated static site
```

### Key Features

- **Incremental Building**: Only rebuilds changed content
- **Hot Reload**: Instant updates during development
- **Search**: Full-text search with indexing
- **SEO Optimization**: Structured data, sitemaps, meta tags
- **Performance**: Image optimization, minification, compression
- **Feeds**: RSS, Atom, and JSON feeds
- **Related Posts**: Automatic content recommendations
- **Archives**: Organized by date and category

## 🔧 Configuration

### Build Settings

```json
{
  "build": {
    "inputDir": "./content",
    "outputDir": "./dist",
    "includeDrafts": false,
    "optimization": {
      "minifyHTML": true,
      "minifyCSS": true,
      "minifyJS": true,
      "optimizeImages": true,
      "generateWebP": true,
      "generateSitemap": true,
      "generateRSS": true
    }
  }
}
```

### Feature Configuration

```json
{
  "features": {
    "search": { "enabled": true, "engine": "simple" },
    "relatedPosts": { "enabled": true, "maxCount": 3, "method": "tags" },
    "archives": { "enabled": true, "groupBy": "year" },
    "drafts": { "enabled": true, "previewMode": true }
  }
}
```

## 🚀 Deployment

### GitHub Actions (Recommended)

The blog automatically deploys via GitHub Actions when you push to main:

1. **Build Stage**: Compiles, tests, and validates content
2. **Deploy Stage**: Publishes to GitHub Pages
3. **Performance Testing**: Runs Lighthouse audits
4. **Notification**: Reports deployment status

### Local Development Testing

```bash
# Test the full build locally
npm run build
npx http-server dist -p 8080
```

### Performance Standards

The GitHub Actions workflow enforces:
- Performance: ≥80%
- Accessibility: ≥90%
- SEO: ≥90%
- Best Practices: ≥85%

## 📚 Content Management

### Post Organization

Posts are automatically organized by date:
```
content/posts/
├── 2025/
│   ├── 01/
│   │   ├── my-first-post.md
│   │   └── my-first-post-images/
│   └── 02/
└── drafts/
    └── work-in-progress.md
```

### Draft Management

- Drafts are stored in `content/drafts/`
- Enable draft preview in development: `"includeDrafts": true`
- Publish drafts by moving to the posts directory (use CLI)

## 🛠️ Troubleshooting

### Common Issues

**Build Failures:**
- Run `npm run lint:fix` for linting issues
- Run `npm run type-check` for TypeScript errors
- Run `npm run test` to check for test failures

**Duplicate Post Error:**
- Choose a different title
- Never rename `.md` files manually
- Always use `npm run new` to create posts

**Images Not Loading:**
- Verify images are in the correct `{slug}-images/` directory
- Check image file extensions are supported
- Ensure proper markdown syntax for image references

**GitHub Pages 404:**
- Verify `baseUrl` matches your repository name
- Check `site.url` is set correctly
- Ensure GitHub Pages source is set to "GitHub Actions"

## 📄 License

MIT License - see LICENSE file for details.
