import { createServer } from 'http';
import http from 'http';
import { readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { lookup } from 'mime-types';
import { watch } from 'chokidar';
import { WebSocketServer, WebSocket } from 'ws';
import { CLIArgs, BlogConfig } from '../../types/index.js';
import { ConfigManager } from '../../core/config.js';
import { BuildPipeline } from '../../build/pipeline.js';
import { logger } from '../../utils/logger.js';
import ora from 'ora';

export class ServeCommand {
  private configManager: ConfigManager;
  private buildPipeline: BuildPipeline | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();

  constructor() {
    this.configManager = new ConfigManager();
  }

  async execute(options: CLIArgs): Promise<void> {
    const spinner = ora('Starting development server...').start();
    
    try {
      const config = await this.configManager.loadConfig();
      this.buildPipeline = new BuildPipeline(config, false); // Development mode
      
      const port = parseInt(options.port as string) || 3000;
      const shouldWatch = options.watch !== false; // Default to true
      const liveReload = options.liveReload !== false; // Default to true

      spinner.text = 'Building site for development...';
      await this.buildPipeline.build({ production: false });

      // Enhanced server with better error handling and logging
      const server = createServer(async (req, res) => {
        await this.handleRequest(req, res, config.build.outputDir, liveReload);
      });

      if (shouldWatch) {
        spinner.text = 'Setting up file watching...';
        this.setupFileWatcher(config);
      }

      server.listen(port, () => {
        spinner.succeed('Development server started successfully');

        // Set up WebSocket server for live reload
        if (liveReload) {
          this.setupWebSocketServer(server);
        }
        
        logger.success('Development server running', {
          url: `http://localhost:${port}`,
          outputDir: config.build.outputDir,
          watching: shouldWatch,
          liveReload
        });

        console.log(`\n🌍 Development server running at http://localhost:${port}`);
        console.log(`📁 Serving from: ${config.build.outputDir}`);
        
        if (shouldWatch) {
          console.log('👀 Watching for file changes...');
        }
        
        if (liveReload) {
          console.log('⚡ Live reload enabled');
        }
        
        console.log('\nPress Ctrl+C to stop');

        // Open browser if requested
        if (options.open) {
          this.openBrowser(`http://localhost:${port}`);
        }
      });

      server.on('error', (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
          spinner.fail(`Port ${port} is already in use`);
          logger.error(`Port ${port} is already in use. Try a different port with --port <number>`);
        } else {
          spinner.fail('Server error');
          logger.error('Server error', error);
        }
        process.exit(1);
      });

      const gracefulShutdown = (): void => {
        console.log('\n👋 Shutting down development server...');
        
        // Close WebSocket server first
        if (this.wss) {
          this.wss.close(() => {
            logger.debug('WebSocket server closed');
          });
        }
        
        // Close all WebSocket clients
        for (const client of this.clients) {
          if (client.readyState === WebSocket.OPEN) {
            client.close();
          }
        }
        this.clients.clear();
        
        // Close HTTP server
        server.close((error) => {
          if (error) {
            logger.error('Error closing server', error);
            process.exit(1);
          } else {
            logger.info('Development server stopped');
            process.exit(0);
          }
        });
        
        // Force exit after 5 seconds if graceful shutdown fails
        setTimeout(() => {
          logger.warn('Force shutting down server...');
          process.exit(0);
        }, 5000);
      };

      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

    } catch (error) {
      spinner.fail('Failed to start development server');
      logger.error(`Failed to start development server: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    outputDir: string,
    liveReload: boolean = false
  ): Promise<void> {
    try {
      let filePath = req.url || '/';
      
      // Remove query parameters and hash fragments
      const urlParts = filePath.split('?')[0]?.split('#')[0];
      filePath = urlParts || '/';
      
      // Decode URL to handle Chinese/Unicode characters
      try {
        filePath = decodeURIComponent(filePath);
      } catch (error) {
        // If decoding fails, use the original path
        logger.warn('Failed to decode URL', { url: filePath, error });
      }
      
      // Handle root path
      if (filePath === '/') {
        filePath = '/index.html';
      }
      // Handle paths ending with slash (directory-style URLs)
      else if (filePath.endsWith('/')) {
        filePath += 'index.html';
      }
      // Handle paths without extension
      else if (!extname(filePath)) {
        filePath += '.html';
      }

      const fullPath = join(outputDir, filePath);
      
      try {
        const stats = await stat(fullPath);
        
        if (stats.isFile()) {
          let content = await readFile(fullPath);
          const mimeType = lookup(fullPath) || 'application/octet-stream';
          
          // Inject live reload script for HTML files
          if (liveReload && mimeType === 'text/html') {
            const liveReloadScript = `
<script>
(function() {
  const ws = new WebSocket('ws://localhost:${req.socket?.localPort || 3000}/ws');
  
  ws.onopen = function() {
    console.log('Live reload connected');
  };
  
  ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'reload') {
      console.log('Reloading page due to file changes...');
      window.location.reload();
    }
  };
  
  ws.onclose = function() {
    console.log('Live reload disconnected. Attempting to reconnect...');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };
  
  ws.onerror = function(error) {
    console.warn('Live reload error:', error);
  };
})();
</script>
</body>`;
            
            content = Buffer.from(
              content.toString().replace('</body>', liveReloadScript)
            );
          }
          
          const headers: Record<string, string> = {
            'Content-Type': mimeType,
            'Content-Length': content.length.toString(),
            'Last-Modified': stats.mtime.toUTCString()
          };
          
          // Add CORS headers for development
          if (req.headers.origin) {
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Access-Control-Allow-Methods'] = 'GET, HEAD, OPTIONS';
            headers['Access-Control-Allow-Headers'] = 'Content-Type';
          }
          
          res.writeHead(200, headers);
          res.end(content);
          return;
        }
      } catch (error) {
        // File not found, try 404.html
        try {
          const notFoundPath = join(outputDir, '404.html');
          const notFoundContent = await readFile(notFoundPath);
          
          res.writeHead(404, {
            'Content-Type': 'text/html',
            'Content-Length': notFoundContent.length,
          });
          res.end(notFoundContent);
          return;
        } catch {
          // Fallback to basic 404
          const fallback404 = `
            <!DOCTYPE html>
            <html>
            <head><title>404 - Page Not Found</title></head>
            <body>
              <h1>404 - Page Not Found</h1>
              <p>The requested page could not be found.</p>
            </body>
            </html>
          `;
          
          res.writeHead(404, {
            'Content-Type': 'text/html',
            'Content-Length': Buffer.byteLength(fallback404),
          });
          res.end(fallback404);
        }
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  private setupFileWatcher(config: BlogConfig): void {
    const watcher = watch([
      config.build.inputDir,
      'src/**/*',
      'themes/**/*',
      'config/**/*',
    ], {
      ignored: ['node_modules', '.git', config.build.outputDir, '**/*.tmp', '**/.DS_Store'],
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    });

    let rebuilding = false;
    let rebuildQueued = false;

    const rebuild = async (changedPath?: string): Promise<void> => {
      if (rebuilding) {
        rebuildQueued = true;
        return;
      }
      
      rebuilding = true;
      rebuildQueued = false;
      
      const spinner = ora('Files changed, rebuilding...').start();
      
      try {
        const startTime = Date.now();
        await this.buildPipeline!.build({ production: false });
        const duration = Date.now() - startTime;
        
        spinner.succeed(`Rebuild completed in ${duration}ms`);
        
        logger.info('Hot reload: rebuild completed', {
          changedFile: changedPath,
          duration: `${duration}ms`
        });

        // Broadcast reload message to all connected clients
        this.broadcastReload();
      } catch (error) {
        spinner.fail('Rebuild failed');
        logger.error(`Hot reload: rebuild failed: ${(error as Error).message}`);
      } finally {
        rebuilding = false;
        
        // If another rebuild was queued while we were rebuilding, do it now
        if (rebuildQueued) {
          setTimeout(() => rebuild(), 100);
        }
      }
    };

    watcher.on('change', (path) => {
      logger.debug('File changed', { path });
      rebuild(path);
    });
    
    watcher.on('add', (path) => {
      logger.debug('File added', { path });
      rebuild(path);
    });
    
    watcher.on('unlink', (path) => {
      logger.debug('File removed', { path });
      rebuild(path);
    });

    watcher.on('error', error => {
      logger.error('File watcher error', error);
    });
  }

  /**
   * Open browser to the development server
   */
  private async openBrowser(url: string): Promise<void> {
    try {
      const { default: open } = await import('open');
      await open(url);
      logger.info('Opened browser', { url });
    } catch (error) {
      logger.warn(`Could not open browser automatically: ${(error as Error).message}`);
    }
  }

  /**
   * Set up WebSocket server for live reload
   */
  private setupWebSocketServer(httpServer: http.Server): void {
    this.wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.debug('Live reload client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        logger.debug('Live reload client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.warn('WebSocket error', { error: error.message });
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', { error: error.message });
    });
  }

  /**
   * Broadcast reload message to all connected clients
   */
  private broadcastReload(): void {
    const message = JSON.stringify({ type: 'reload', timestamp: Date.now() });
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          logger.warn('Failed to send reload message to client', { error });
          this.clients.delete(client);
        }
      } else {
        this.clients.delete(client);
      }
    }

    if (this.clients.size > 0) {
      logger.debug(`Sent reload message to ${this.clients.size} clients`);
    }
  }
}