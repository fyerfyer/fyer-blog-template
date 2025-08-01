import { CLIArgs } from '../../types/index.js';
import { ConfigManager } from '../../core/config.js';
import { ContentValidator } from '../../content/validator.js';

export class ValidateCommand {
  private configManager: ConfigManager;

  constructor() {
    this.configManager = new ConfigManager();
  }

  async execute(options: CLIArgs): Promise<void> {
    try {
      console.log('🔍 Validating content and configuration...');
      
      const config = await this.configManager.loadConfig();
      const validator = new ContentValidator(config);
      const strict = options.strict as boolean;

      const results = await validator.validateAll(strict);

      if (results.isValid) {
        console.log('✅ All validation checks passed');
        console.log(`📊 Validated ${results.totalFiles} files`);
        
        if (results.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          results.warnings.forEach((warning) => {
            console.log(`   - ${warning}`);
          });
        }
      } else {
        console.error('❌ Validation failed:');
        results.errors.forEach((error) => {
          console.error(`   - ${error}`);
        });
        
        if (results.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          results.warnings.forEach((warning) => {
            console.log(`   - ${warning}`);
          });
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation error:', error);
      process.exit(1);
    }
  }
}