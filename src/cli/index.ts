#!/usr/bin/env node

import { Command } from 'commander';
import { NewPostCommand } from './commands/new.js';
import { BuildCommand } from './commands/build.js';
import { ServeCommand } from './commands/serve.js';
import { ValidateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('fyer-blog-template')
  .description('A personal blog system with static site generation')
  .version('1.0.0');

const newCommand = new NewPostCommand();
const buildCommand = new BuildCommand();
const serveCommand = new ServeCommand();
const validateCommand = new ValidateCommand();

program
  .command('new')
  .description('Create a new blog post')
  .option('-t, --title <title>', 'Post title')
  .option('--template <template>', 'Template to use', 'default')
  .option('--draft', 'Create as draft', false)
  .action(async (options) => {
    await newCommand.execute(options);
  });

program
  .command('build')
  .description('Build the static site')
  .option('-p, --production', 'Production build with optimizations', false)
  .option('--clean', 'Clean output directory before build', false)
  .action(async (options) => {
    await buildCommand.execute(options);
  });

program
  .command('serve')
  .description('Start development server')
  .option('-p, --port <port>', 'Port to run server on', '3000')
  .option('-w, --watch', 'Watch for file changes', true)
  .option('--no-watch', 'Disable file watching')
  .option('--open', 'Open browser automatically', false)
  .option('--no-live-reload', 'Disable live reload')
  .action(async (options) => {
    await serveCommand.execute(options);
  });

program
  .command('validate')
  .description('Validate content and configuration')
  .option('--strict', 'Strict validation mode', false)
  .action(async (options) => {
    await validateCommand.execute(options);
  });

// Deployment Information:
// This blog uses GitHub Actions for automatic deployment.
// To deploy your changes:
// 1. Commit your changes: git add . && git commit -m "Your message"
// 2. Push to main branch: git push origin main
// 3. GitHub Actions will automatically build and deploy to GitHub Pages

program
  .command('help-deploy')
  .description('Show deployment instructions')
  .action(() => {
    console.log('\n📚 Deployment Instructions:');
    console.log('This blog uses GitHub Actions for automatic deployment.');
    console.log('\nTo deploy your changes:');
    console.log('1. Build your site: npm run build');
    console.log('2. Commit changes: git add . && git commit -m "Your message"');
    console.log('3. Push to main: git push origin main');
    console.log('4. GitHub Actions will automatically deploy to GitHub Pages\n');
    console.log('💡 The deployment happens automatically on push - no manual deploy command needed!');
  });


process.on('unhandledRejection', (err) => {
  console.error('Unhandled promise rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

program.parse();