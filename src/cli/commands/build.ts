import { CLIArgs } from '../../types/index.js';
import { ConfigManager } from '../../core/config.js';
import { BuildPipeline } from '../../build/pipeline.js';
import { logger } from '../../utils/logger.js';
import ora from 'ora';

export class BuildCommand {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async execute(options: CLIArgs): Promise<void> {
    const spinner = ora('Starting build process...').start();
    
    try {
      logger.info('🚀 Starting build process...');
      
      const config = await this.configManager.loadConfig();
      const buildPipeline = new BuildPipeline(config, options.production as boolean);

      if (options.clean) {
        spinner.text = 'Cleaning output directory...';
        await buildPipeline.clean();
      }

      spinner.text = 'Building site...';
      const result = await buildPipeline.build({
        production: options.production as boolean,
        clean: options.clean as boolean,
      });

      if (result.success) {
        spinner.succeed(`Build completed successfully in ${result.buildTime}ms`);
        
        logger.success(`Build completed`, {
          buildTime: `${result.buildTime}ms`,
          generatedFiles: result.generatedFiles.length,
          outputDir: config.build.outputDir
        });

        // Show optimization results if available
        if (result.optimization) {
          const opt = result.optimization;
          const totalSavings = this.formatBytes(opt.totalSavings);
          
          console.log('\n📊 Optimization Results:');
          console.log(`   HTML: ${this.formatBytes(opt.html.savings)} saved`);
          console.log(`   CSS:  ${this.formatBytes(opt.css.savings)} saved`);
          console.log(`   JS:   ${this.formatBytes(opt.js.savings)} saved`);
          console.log(`   Images: ${this.formatBytes(opt.images.savings)} saved`);
          console.log(`   Total: ${totalSavings} saved`);
        }
        
        console.log(`\n📦 Generated ${result.generatedFiles.length} files`);
        console.log(`📁 Output directory: ${config.build.outputDir}`);
        
        if (options.production) {
          console.log('\n🎯 Production build optimizations applied');
        }
      } else {
        spinner.fail('Build failed');
        logger.error('Build failed with errors:');
        result.errors?.forEach((error) => {
          console.error(`   - ${error}`);
        });
        process.exit(1);
      }
    } catch (error) {
      spinner.fail('Build error');
      logger.error(`Build error: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}