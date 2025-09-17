import { DatabaseConfig, DatabaseProvider } from '../types';
import { z } from 'zod';

/**
 * Database configuration schema for validation
 */
const DatabaseConfigSchema = z.object({
  provider: z.nativeEnum(DatabaseProvider),
  host: z.string().optional(),
  port: z.number().optional(),
  database: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  url: z.string().optional(),
  schema: z.string().optional(),
  authSource: z.string().optional(),
  ssl: z.boolean().default(false),
  logging: z.boolean().default(false),
  pool: z.object({
    min: z.number().default(0),
    max: z.number().default(10),
    idle: z.number().default(10000),
    acquire: z.number().default(60000),
    evict: z.number().default(1000)
  }).default({
    min: 0,
    max: 10,
    idle: 10000,
    acquire: 60000,
    evict: 1000
  })
});

/**
 * Environment configuration schema
 */
const EnvironmentConfigSchema = z.object({
  DATABASE_PROVIDER: z.nativeEnum(DatabaseProvider),
  DATABASE_URL: z.string().optional(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.string().optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USERNAME: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_SCHEMA: z.string().optional(),
  DATABASE_AUTH_SOURCE: z.string().optional(),
  DATABASE_SSL: z.string().optional(),
  DATABASE_LOGGING: z.string().optional(),
  DATABASE_POOL_MIN: z.string().optional(),
  DATABASE_POOL_MAX: z.string().optional(),
  DATABASE_POOL_IDLE: z.string().optional(),
  DATABASE_POOL_ACQUIRE: z.string().optional(),
  DATABASE_POOL_EVICT: z.string().optional()
});

/**
 * Database configuration manager
 */
export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;
  private config: DatabaseConfig | null = null;
  private envConfig: Record<string, string> = {};

  private constructor() {
    this.loadEnvironmentVariables();
  }

  /**
   * Gets singleton instance
   */
  static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  /**
   * Gets database configuration
   */
  getConfig(): DatabaseConfig {
    if (!this.config) {
      this.config = this.createConfigFromEnvironment();
    }
    return this.config;
  }

  /**
   * Sets database configuration
   */
  setConfig(config: DatabaseConfig): void {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validates database configuration
   */
  validateConfig(config: DatabaseConfig): void {
    try {
      DatabaseConfigSchema.parse(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        throw new Error(`Invalid database configuration: ${issues}`);
      }
      throw error;
    }

    // Additional validation based on provider
    this.validateProviderSpecificConfig(config);
  }

  /**
   * Creates configuration from environment variables
   */
  createConfigFromEnvironment(): DatabaseConfig {
    const env = this.getValidatedEnvironment();
    const provider = env.DATABASE_PROVIDER as DatabaseProvider;

    const baseConfig = {
      provider,
      ssl: this.parseBoolean(env.DATABASE_SSL, false),
      logging: this.parseBoolean(env.DATABASE_LOGGING, false),
      pool: {
        min: this.parseNumber(env.DATABASE_POOL_MIN, 0),
        max: this.parseNumber(env.DATABASE_POOL_MAX, 10),
        idle: this.parseNumber(env.DATABASE_POOL_IDLE, 10000),
        acquire: this.parseNumber(env.DATABASE_POOL_ACQUIRE, 60000),
        evict: this.parseNumber(env.DATABASE_POOL_EVICT, 1000)
      }
    };

    let config: DatabaseConfig;

    switch (provider) {
      case DatabaseProvider.POSTGRESQL:
        config = {
          ...baseConfig,
          host: env.DATABASE_HOST || 'localhost',
          port: this.parseNumber(env.DATABASE_PORT, 5432),
          database: env.DATABASE_NAME || 'nextauth',
          username: env.DATABASE_USERNAME || 'postgres',
          password: env.DATABASE_PASSWORD || '',
          schema: env.DATABASE_SCHEMA || 'public'
        };
        break;

      case DatabaseProvider.MYSQL:
        config = {
          ...baseConfig,
          host: env.DATABASE_HOST || 'localhost',
          port: this.parseNumber(env.DATABASE_PORT, 3306),
          database: env.DATABASE_NAME || 'nextauth',
          username: env.DATABASE_USERNAME || 'root',
          password: env.DATABASE_PASSWORD || ''
        };
        break;

      case DatabaseProvider.MONGODB:
        if (env.DATABASE_URL) {
          config = {
            ...baseConfig,
            url: env.DATABASE_URL
          };
        } else {
          config = {
            ...baseConfig,
            host: env.DATABASE_HOST || 'localhost',
            port: this.parseNumber(env.DATABASE_PORT, 27017),
            database: env.DATABASE_NAME || 'nextauth',
            username: env.DATABASE_USERNAME,
            password: env.DATABASE_PASSWORD,
            authSource: env.DATABASE_AUTH_SOURCE || 'admin'
          };
        }
        break;

      default:
        throw new Error(`Unsupported database provider: ${provider}`);
    }

    this.validateConfig(config);
    return config;
  }

  /**
   * Gets connection string for the database
   */
  getConnectionString(config?: DatabaseConfig): string {
    const dbConfig = config || this.getConfig();

    switch (dbConfig.provider) {
      case DatabaseProvider.POSTGRESQL:
        return this.buildPostgreSQLConnectionString(dbConfig);
      
      case DatabaseProvider.MYSQL:
        return this.buildMySQLConnectionString(dbConfig);
      
      case DatabaseProvider.MONGODB:
        return this.buildMongoDBConnectionString(dbConfig);
      
      default:
        throw new Error(`Unsupported database provider: ${dbConfig.provider}`);
    }
  }

  /**
   * Gets database configuration for different environments
   */
  getEnvironmentConfig(environment: 'development' | 'test' | 'production'): DatabaseConfig {
    const baseConfig = this.getConfig();
    
    switch (environment) {
      case 'development':
        return {
          ...baseConfig,
          logging: true,
          pool: {
            ...baseConfig.pool,
            max: 5
          }
        };
      
      case 'test':
        return {
          ...baseConfig,
          database: `${baseConfig.database}_test`,
          logging: false,
          pool: {
            ...baseConfig.pool,
            min: 0,
            max: 3
          }
        };
      
      case 'production':
        return {
          ...baseConfig,
          ssl: true,
          logging: false,
          pool: {
            ...baseConfig.pool,
            min: 2,
            max: 20
          }
        };
      
      default:
        return baseConfig;
    }
  }

  /**
   * Creates configuration for multiple databases
   */
  getMultiDatabaseConfig(): Record<string, DatabaseConfig> {
    const configs: Record<string, DatabaseConfig> = {};
    
    // Primary database
    configs.primary = this.getConfig();
    
    // Read replica (if configured)
    if (this.envConfig.DATABASE_READ_HOST) {
      configs.read = {
        ...configs.primary,
        host: this.envConfig.DATABASE_READ_HOST,
        port: this.parseNumber(this.envConfig.DATABASE_READ_PORT, configs.primary.port || 5432),
        username: this.envConfig.DATABASE_READ_USERNAME || configs.primary.username,
        password: this.envConfig.DATABASE_READ_PASSWORD || configs.primary.password
      };
    }
    
    // Cache database (Redis/MongoDB)
    if (this.envConfig.CACHE_DATABASE_URL) {
      configs.cache = {
        provider: DatabaseProvider.MONGODB, // or Redis when supported
        url: this.envConfig.CACHE_DATABASE_URL,
        ssl: false,
        logging: false,
        pool: {
          min: 0,
          max: 5,
          idle: 10000,
          acquire: 60000,
          evict: 1000
        }
      };
    }
    
    return configs;
  }

  /**
   * Loads environment variables
   */
  private loadEnvironmentVariables(): void {
    this.envConfig = {
      DATABASE_PROVIDER: process.env.DATABASE_PROVIDER || '',
      DATABASE_URL: process.env.DATABASE_URL || '',
      DATABASE_HOST: process.env.DATABASE_HOST || '',
      DATABASE_PORT: process.env.DATABASE_PORT || '',
      DATABASE_NAME: process.env.DATABASE_NAME || '',
      DATABASE_USERNAME: process.env.DATABASE_USERNAME || '',
      DATABASE_PASSWORD: process.env.DATABASE_PASSWORD || '',
      DATABASE_SCHEMA: process.env.DATABASE_SCHEMA || '',
      DATABASE_AUTH_SOURCE: process.env.DATABASE_AUTH_SOURCE || '',
      DATABASE_SSL: process.env.DATABASE_SSL || '',
      DATABASE_LOGGING: process.env.DATABASE_LOGGING || '',
      DATABASE_POOL_MIN: process.env.DATABASE_POOL_MIN || '',
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX || '',
      DATABASE_POOL_IDLE: process.env.DATABASE_POOL_IDLE || '',
      DATABASE_POOL_ACQUIRE: process.env.DATABASE_POOL_ACQUIRE || '',
      DATABASE_POOL_EVICT: process.env.DATABASE_POOL_EVICT || '',
      DATABASE_READ_HOST: process.env.DATABASE_READ_HOST || '',
      DATABASE_READ_PORT: process.env.DATABASE_READ_PORT || '',
      DATABASE_READ_USERNAME: process.env.DATABASE_READ_USERNAME || '',
      DATABASE_READ_PASSWORD: process.env.DATABASE_READ_PASSWORD || '',
      CACHE_DATABASE_URL: process.env.CACHE_DATABASE_URL || ''
    };
  }

  /**
   * Validates environment variables
   */
  private getValidatedEnvironment(): Record<string, string> {
    try {
      return EnvironmentConfigSchema.parse(this.envConfig) as Record<string, string>;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
        throw new Error(`Invalid environment configuration: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Validates provider-specific configuration
   */
  private validateProviderSpecificConfig(config: DatabaseConfig): void {
    switch (config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        if (!config.host || !config.port || !config.database || !config.username) {
          throw new Error('Host, port, database, and username are required for SQL databases');
        }
        break;
      
      case DatabaseProvider.MONGODB:
        if (!config.url && (!config.host || !config.database)) {
          throw new Error('Either URL or host and database are required for MongoDB');
        }
        break;
    }
  }

  /**
   * Builds PostgreSQL connection string
   */
  private buildPostgreSQLConnectionString(config: DatabaseConfig): string {
    const { host, port, database, username, password, ssl, schema } = config;
    let connectionString = `postgresql://${username}`;
    
    if (password) {
      connectionString += `:${password}`;
    }
    
    connectionString += `@${host}:${port}/${database}`;
    
    const params: string[] = [];
    if (ssl) params.push('sslmode=require');
    if (schema && schema !== 'public') params.push(`schema=${schema}`);
    
    if (params.length > 0) {
      connectionString += `?${params.join('&')}`;
    }
    
    return connectionString;
  }

  /**
   * Builds MySQL connection string
   */
  private buildMySQLConnectionString(config: DatabaseConfig): string {
    const { host, port, database, username, password, ssl } = config;
    let connectionString = `mysql://${username}`;
    
    if (password) {
      connectionString += `:${password}`;
    }
    
    connectionString += `@${host}:${port}/${database}`;
    
    const params: string[] = [];
    if (ssl) params.push('ssl=true');
    
    if (params.length > 0) {
      connectionString += `?${params.join('&')}`;
    }
    
    return connectionString;
  }

  /**
   * Builds MongoDB connection string
   */
  private buildMongoDBConnectionString(config: DatabaseConfig): string {
    if (config.url) {
      return config.url;
    }
    
    const { host, port, database, username, password, ssl, authSource } = config;
    let connectionString = 'mongodb://';
    
    if (username) {
      connectionString += username;
      if (password) {
        connectionString += `:${password}`;
      }
      connectionString += '@';
    }
    
    connectionString += `${host}:${port}/${database}`;
    
    const params: string[] = [];
    if (ssl) params.push('ssl=true');
    if (authSource) params.push(`authSource=${authSource}`);
    
    if (params.length > 0) {
      connectionString += `?${params.join('&')}`;
    }
    
    return connectionString;
  }

  /**
   * Parses boolean from string
   */
  private parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
    if (!value) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  /**
   * Parses number from string
   */
  private parseNumber(value: string | undefined, defaultValue: number): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
}

/**
 * Default database configuration manager instance
 */
export const databaseConfig = DatabaseConfigManager.getInstance();

/**
 * Helper functions for common configuration operations
 */
export function getDatabaseConfig(): DatabaseConfig {
  return databaseConfig.getConfig();
}

export function getConnectionString(config?: DatabaseConfig): string {
  return databaseConfig.getConnectionString(config);
}

export function getEnvironmentConfig(environment: 'development' | 'test' | 'production'): DatabaseConfig {
  return databaseConfig.getEnvironmentConfig(environment);
}

export function getMultiDatabaseConfig(): Record<string, DatabaseConfig> {
  return databaseConfig.getMultiDatabaseConfig();
}

export function validateDatabaseConfig(config: DatabaseConfig): void {
  return databaseConfig.validateConfig(config);
}

/**
 * Environment-specific configuration presets
 */
export const DatabasePresets = {
  development: {
    postgresql: {
      provider: DatabaseProvider.POSTGRESQL,
      host: 'localhost',
      port: 5432,
      database: 'nextauth_dev',
      username: 'postgres',
      password: 'password',
      ssl: false,
      logging: true,
      pool: { min: 0, max: 5, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig,
    
    mysql: {
      provider: DatabaseProvider.MYSQL,
      host: 'localhost',
      port: 3306,
      database: 'nextauth_dev',
      username: 'root',
      password: 'password',
      ssl: false,
      logging: true,
      pool: { min: 0, max: 5, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig,
    
    mongodb: {
      provider: DatabaseProvider.MONGODB,
      host: 'localhost',
      port: 27017,
      database: 'nextauth_dev',
      ssl: false,
      logging: true,
      pool: { min: 0, max: 5, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig
  },
  
  test: {
    postgresql: {
      provider: DatabaseProvider.POSTGRESQL,
      host: 'localhost',
      port: 5432,
      database: 'nextauth_test',
      username: 'postgres',
      password: 'password',
      ssl: false,
      logging: false,
      pool: { min: 0, max: 3, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig,
    
    mysql: {
      provider: DatabaseProvider.MYSQL,
      host: 'localhost',
      port: 3306,
      database: 'nextauth_test',
      username: 'root',
      password: 'password',
      ssl: false,
      logging: false,
      pool: { min: 0, max: 3, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig,
    
    mongodb: {
      provider: DatabaseProvider.MONGODB,
      host: 'localhost',
      port: 27017,
      database: 'nextauth_test',
      ssl: false,
      logging: false,
      pool: { min: 0, max: 3, idle: 10000, acquire: 60000, evict: 1000 }
    } as DatabaseConfig
  }
};