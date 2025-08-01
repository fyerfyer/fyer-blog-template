import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Global test configuration
export const TEST_CONFIG = {
  tempDir: join(tmpdir(), 'fyer-blog-template-tests'),
  fixtures: join(__dirname, 'fixtures'),
  timeout: 10000
};

// Setup test environment
beforeAll(async () => {
  // Create temp directory for tests
  await fs.mkdir(TEST_CONFIG.tempDir, { recursive: true });
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
});

// Cleanup after tests
afterAll(async () => {
  // Clean up temp directory
  try {
    await fs.rm(TEST_CONFIG.tempDir, { recursive: true, force: true });
  } catch (error) {
    console.warn('Failed to clean up test directory:', error);
  }
});

// Setup for each test
beforeEach(async () => {
  // Create fresh test directory for each test
  const testDir = join(TEST_CONFIG.tempDir, `test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });
  process.env.TEST_DIR = testDir;
});

// Cleanup after each test
afterEach(async () => {
  // Clean up individual test directory
  if (process.env.TEST_DIR) {
    try {
      await fs.rm(process.env.TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
    delete process.env.TEST_DIR;
  }
});