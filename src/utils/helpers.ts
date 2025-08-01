import slugify from 'slugify';

export function generateSlug(title: string): string {
  // First try with transliteration enabled for better Chinese support
  let slug = slugify(title, {
    lower: true,
    strict: false,  // Keep some special characters for better readability
    remove: /[*+~.()'"!:@]/g  // Remove specific unwanted characters
  });
  
  // If slugify produces an empty string or very short string,
  // try with a more permissive approach or fall back to timestamp
  if (!slug || slug.trim().length < 2) {
    // Try a more permissive approach
    slug = title
      .toLowerCase()
      .replace(/\s+/g, '-')           // Replace spaces with hyphens
      .replace(/[^\w\u4e00-\u9fff-]/g, '') // Keep letters, numbers, Chinese characters, and hyphens
      .replace(/--+/g, '-')           // Replace multiple hyphens with single
      .replace(/^-+|-+$/g, '');       // Remove leading/trailing hyphens
    
    // If still empty, use timestamp fallback
    if (!slug || slug.trim() === '') {
      slug = `post-${Date.now()}`;
    }
  }
  
  return slug;
}

export function formatDate(date: Date): string {
  return date.toISOString();
}

export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const words = content.split(/\s+/).length;
  return Math.ceil(words / wordsPerMinute);
}

export function extractExcerpt(content: string, maxLength = 160): string {
  const strippedContent = content
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();

  if (strippedContent.length <= maxLength) {
    return strippedContent;
  }

  const truncated = strippedContent.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

export function createId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export function sanitizePath(path: string): string {
  return path.replace(/[<>:"|?*]/g, '');
}

export function validatePath(path: string): boolean {
  if (path.includes('..')) return false;
  if (path.includes('//')) return false;
  return true;
}