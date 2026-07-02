import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger/logger';

class RedisManager {
  public client!: Redis;
  public subClient!: Redis;
  private scriptShaMap = new Map<string, string>();
  private scriptContentMap = new Map<string, string>();

  constructor() {
    this.initializeClients();
  }

  private initializeClients() {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    const config = {
      maxRetriesPerRequest: null, // Required by BullMQ
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 100, 3000);
        logger.warn(`Redis connection retry attempt ${times} after ${delay}ms`);
        return delay;
      },
    };

    this.client = new Redis(redisUrl, config);
    this.subClient = new Redis(redisUrl, config);

    this.client.on('connect', () => logger.info('Redis main client connected.'));
    this.client.on('error', (err) => logger.error('Redis main client error:', err));

    this.subClient.on('connect', () => logger.info('Redis subscription client connected.'));
    this.subClient.on('error', (err) => logger.error('Redis subscription client error:', err));
  }

  /**
   * Reads a Lua script from file, attempting several paths for robustness.
   */
  private readScript(filename: string): string {
    const pathsToTry = [
      path.join(__dirname, 'scripts', filename), // adjacent compiled path
      path.join(__dirname, '..', '..', 'infra', 'redis', 'scripts', filename), // relative source path
      path.join(process.cwd(), 'src', 'infra', 'redis', 'scripts', filename), // absolute source path
      path.join(process.cwd(), 'dist', 'infra', 'redis', 'scripts', filename), // absolute compiled path
    ];

    for (const p of pathsToTry) {
      try {
        if (fs.existsSync(p)) {
          return fs.readFileSync(p, 'utf8');
        }
      } catch (e) {
        // Continue searching
      }
    }
    throw new Error(`Could not locate Lua script: ${filename}`);
  }

  /**
   * Preloads all rate-limiting Lua scripts into Redis.
   */
  public async loadScripts() {
    const scripts = [
      'fixed-window.lua',
      'sliding-window-counter.lua',
      'sliding-window-log.lua',
      'token-bucket.lua',
      'leaky-bucket.lua',
    ];

    for (const scriptName of scripts) {
      const content = this.readScript(scriptName);
      const nameWithoutExt = path.basename(scriptName, '.lua');
      this.scriptContentMap.set(nameWithoutExt, content);

      try {
        const sha = await this.client.script('LOAD', content);
        if (typeof sha === 'string') {
          this.scriptShaMap.set(nameWithoutExt, sha);
          logger.info(`Loaded Redis script: ${nameWithoutExt} -> SHA: ${sha}`);
        }
      } catch (err) {
        logger.error(`Failed to load Redis script ${scriptName}:`, err);
        throw err;
      }
    }
  }

  /**
   * Atomically executes a rate limit script.
   * Uses evalsha and falls back to eval if the script is not cached.
   */
  public async runScript(
    scriptName: string,
    numKeys: number,
    keys: string[],
    args: (string | number)[]
  ): Promise<[number, number, number]> {
    const sha = this.scriptShaMap.get(scriptName);
    if (!sha) {
      throw new Error(`Script SHA not found for ${scriptName}`);
    }

    try {
      // Execute cached script
      const result = await this.client.evalsha(sha, numKeys, ...keys, ...args) as [number, number, number];
      return result;
    } catch (err: any) {
      if (err.message && err.message.includes('NOSCRIPT')) {
        logger.warn(`Script cache miss for ${scriptName}. Reloading and executing via EVAL...`);
        const content = this.scriptContentMap.get(scriptName);
        if (!content) {
          throw new Error(`Lua code content not found for ${scriptName}`);
        }
        // Fallback to EVAL
        const result = await this.client.eval(content, numKeys, ...keys, ...args) as [number, number, number];
        
        // Reload SHA
        const newSha = await this.client.script('LOAD', content);
        if (typeof newSha === 'string') {
          this.scriptShaMap.set(scriptName, newSha);
        }
        return result;
      }
      throw err;
    }
  }

  /**
   * Graceful shutdown of Redis clients
   */
  public async disconnect() {
    await this.client.quit();
    await this.subClient.quit();
    logger.info('Redis connections disconnected.');
  }
}

export const redisManager = new RedisManager();
export const redisClient = redisManager.client;
export const redisSubClient = redisManager.subClient;
