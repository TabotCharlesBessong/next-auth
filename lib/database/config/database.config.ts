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
  // General DATABASE_PROVIDER is optional if specific provider variables are used
  DATABASE_PROVIDER: z.nativeEnum(DatabaseProvider).optional(),

  // PostgreSQL Specific
  DATABASE_PROVIDER_PG: z.nativeEnum(DatabaseProvider).optional(),
  DATABASE_HOST_PG: z.string().optional(),
  DATABASE_PORT_PG: z.string().optional(),
  DATABASE_NAME_PG: z.string().optional(),
  DATABASE_USERNAME_PG: z.string().optional(),
  DATABASE_PASSWORD_PG: z.string().optional(),
  DATABASE_SCHEMA_PG: z.string().optional(),
  DATABASE_SSL_PG: z.string().optional(),
  DATABASE_LOGGING_PG: z.string().optional(),
  DATABASE_POOL_MIN_PG: z.string().optional(),
  DATABASE_POOL_MAX_PG: z.string().optional(),
  DATABASE_POOL_IDLE_PG: z.string().optional(),
  DATABASE_POOL_ACQUIRE_PG: z.string().optional(),
  DATABASE_POOL_EVICT_PG: z.string().optional(),

  // MySQL Specific (placeholder for future expansion if needed, using generic prefixes for now)
  DATABASE_PROVIDER_MYSQL: z.nativeEnum(DatabaseProvider).optional(),
  DATABASE_HOST_MYSQL: z.string().optional(),
  DATABASE_PORT_MYSQL: z.string().optional(),
  DATABASE_NAME_MYSQL: z.string().optional(),
  DATABASE_USERNAME_MYSQL: z.string().optional(),
  DATABASE_PASSWORD_MYSQL: z.string().optional(),
  DATABASE_SCHEMA_MYSQL: z.string().optional(),
  DATABASE_SSL_MYSQL: z.string().optional(),
  DATABASE_LOGGING_MYSQL: z.string().optional(),
  DATABASE_POOL_MIN_MYSQL: z.string().optional(),
  DATABASE_POOL_MAX_MYSQL: z.string().optional(),
  DATABASE_POOL_IDLE_MYSQL: z.string().optional(),
  DATABASE_POOL_ACQUIRE_MYSQL: z.string().optional(),
  DATABASE_POOL_EVICT_MYSQL: z.string().optional(),

  // MongoDB Specific
  DATABASE_PROVIDER_MONGODB: z.nativeEnum(DatabaseProvider).optional(),
  DATABASE_URL_MONGODB: z.string().optional(),
  DATABASE_HOST_MONGODB: z.string().optional(),
  DATABASE_PORT_MONGODB: z.string().optional(),
  DATABASE_NAME_MONGODB: z.string().optional(),
  DATABASE_USERNAME_MONGODB: z.string().optional(),
  DATABASE_PASSWORD_MONGODB: z.string().optional(),
  DATABASE_AUTH_SOURCE_MONGODB: z.string().optional(),
  DATABASE_SSL_MONGODB: z.string().optional(),
  DATABASE_LOGGING_MONGODB: z.string().optional(),
  DATABASE_POOL_MIN_MONGODB: z.string().optional(),
  DATABASE_POOL_MAX_MONGODB: z.string().optional(),
  DATABASE_POOL_IDLE_MONGODB: z.string().optional(),
  DATABASE_POOL_ACQUIRE_MONGODB: z.string().optional(),
  DATABASE_POOL_EVICT_MONGODB: z.string().optional(),

  // Read Replica specific
  DATABASE_READ_HOST: z.string().optional(),
  DATABASE_READ_PORT: z.string().optional(),
  DATABASE_READ_USERNAME: z.string().optional(),
  DATABASE_READ_PASSWORD: z.string().optional(),

  // Cache Database specific
  CACHE_DATABASE_URL: z.string().optional(),
});

/**
 * Database configuration manager
 */
export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;
  private config: DatabaseConfig | null = null;
  // Change envConfig type to allow for string | undefined to match process.env
  private envConfig: Record<string, string | undefined> = {};

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
    
    // Determine the primary database provider based on explicitly set provider or inference
    let provider: DatabaseProvider | undefined = env.DATABASE_PROVIDER as DatabaseProvider;
    
    // If a general DATABASE_PROVIDER is not set, try to infer from specific providers
    if (!provider) {
      if (env.DATABASE_PROVIDER_PG) {
        provider = DatabaseProvider.POSTGRESQL;
      } else if (env.DATABASE_PROVIDER_MONGODB) {
        provider = DatabaseProvider.MONGODB;
      } else if (env.DATABASE_PROVIDER_MYSQL) {
        provider = DatabaseProvider.MYSQL;
      }
    }

    if (!provider) {
      throw new Error('No database provider specified in environment variables.');
    }

    // Now call the new helper method to create the specific config
    const config = this.createConfigFromEnvironmentForProvider(provider);
    
    this.validateConfig(config);
    return config;
  }

  /**
   * Gets connection string for the database
   */
  getConnectionString(config?: DatabaseConfig): string {
    const dbConfig = config || this.getConfig();

    // Handle cases where DATABASE_PROVIDER is not set, but specific provider variables are
    let currentProvider = dbConfig.provider;
    if (!currentProvider) {
      // Attempt to infer provider from available specific configs in the environment
      if (this.envConfig.DATABASE_PROVIDER_PG) {
        currentProvider = DatabaseProvider.POSTGRESQL;
      } else if (this.envConfig.DATABASE_PROVIDER_MONGODB) {
        currentProvider = DatabaseProvider.MONGODB;
      } else if (this.envConfig.DATABASE_PROVIDER_MYSQL) {
        currentProvider = DatabaseProvider.MYSQL;
      }
    }

    if (!currentProvider) {
      throw new Error('Cannot determine database provider for connection string.');
    }

    switch (currentProvider) {
      case DatabaseProvider.POSTGRESQL:
        return this.buildPostgreSQLConnectionString(dbConfig);
      
      case DatabaseProvider.MYSQL:
        return this.buildMySQLConnectionString(dbConfig);
      
      case DatabaseProvider.MONGODB:
        return this.buildMongoDBConnectionString(dbConfig);
      
      default:
        throw new Error(`Unsupported database provider: ${currentProvider}`);
    }
  }

  /**
   * Gets database configuration for different environments
   */
  getEnvironmentConfig(environment: 'development' | 'test' | 'production'): DatabaseConfig {
    // This method needs to be revisited for multi-database configurations if different environment settings are desired per DB.
    // For now, it will return a single primary config, or default if no specific provider is set.
    const baseConfig = this.getConfig();

    // Determine which provider's environment variables to prioritize for general settings
    // For simplicity, we prioritize PG, then Mongo, then MySQL for general env configs if multiple exist
    // This logic might need refinement based on exact multi-DB usage patterns.
    let selectedEnv = this.envConfig.DATABASE_PROVIDER_PG ? 'PG' :
                      this.envConfig.DATABASE_PROVIDER_MONGODB ? 'MONGODB' :
                      this.envConfig.DATABASE_PROVIDER_MYSQL ? 'MYSQL' : '';

    switch (environment) {
      case 'development':
        const devLogging = selectedEnv === 'PG' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_PG, true) :
                             selectedEnv === 'MONGODB' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MONGODB, true) :
                             selectedEnv === 'MYSQL' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MYSQL, true) : true;
        const devMaxPool = selectedEnv === 'PG' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_PG, 5) :
                           selectedEnv === 'MONGODB' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MONGODB, 5) :
                           selectedEnv === 'MYSQL' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MYSQL, 5) : 5;
        return {
          ...baseConfig,
          logging: devLogging,
          pool: {
            ...baseConfig.pool,
            max: devMaxPool
          }
        };
      
      case 'test':
        const testLogging = selectedEnv === 'PG' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_PG, false) :
                              selectedEnv === 'MONGODB' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MONGODB, false) :
                              selectedEnv === 'MYSQL' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MYSQL, false) : false;
        const testMinPool = selectedEnv === 'PG' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_PG, 0) :
                            selectedEnv === 'MONGODB' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_MONGODB, 0) :
                            selectedEnv === 'MYSQL' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_MYSQL, 0) : 0;
        const testMaxPool = selectedEnv === 'PG' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_PG, 3) :
                            selectedEnv === 'MONGODB' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MONGODB, 3) :
                            selectedEnv === 'MYSQL' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MYSQL, 3) : 3;
        return {
          ...baseConfig,
          database: `${baseConfig.database}_test`,
          logging: testLogging,
          pool: {
            ...baseConfig.pool,
            min: testMinPool,
            max: testMaxPool
          }
        };
      
      case 'production':
        const prodSsl = selectedEnv === 'PG' ? this.parseBoolean(this.envConfig.DATABASE_SSL_PG, true) :
                            selectedEnv === 'MONGODB' ? this.parseBoolean(this.envConfig.DATABASE_SSL_MONGODB, true) :
                            selectedEnv === 'MYSQL' ? this.parseBoolean(this.envConfig.DATABASE_SSL_MYSQL, true) : true;
        const prodLogging = selectedEnv === 'PG' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_PG, false) :
                              selectedEnv === 'MONGODB' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MONGODB, false) :
                              selectedEnv === 'MYSQL' ? this.parseBoolean(this.envConfig.DATABASE_LOGGING_MYSQL, false) : false;
        const prodMinPool = selectedEnv === 'PG' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_PG, 2) :
                            selectedEnv === 'MONGODB' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_MONGODB, 2) :
                            selectedEnv === 'MYSQL' ? this.parseNumber(this.envConfig.DATABASE_POOL_MIN_MYSQL, 2) : 2;
        const prodMaxPool = selectedEnv === 'PG' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_PG, 20) :
                            selectedEnv === 'MONGODB' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MONGODB, 20) :
                            selectedEnv === 'MYSQL' ? this.parseNumber(this.envConfig.DATABASE_POOL_MAX_MYSQL, 20) : 20;
        return {
          ...baseConfig,
          ssl: prodSsl,
          logging: prodLogging,
          pool: {
            ...baseConfig.pool,
            min: prodMinPool,
            max: prodMaxPool
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
    
    // Primary PostgreSQL database (if configured)
    if (this.envConfig.DATABASE_PROVIDER_PG || this.envConfig.DATABASE_HOST_PG) {
      try {
        configs.postgresql = this.createConfigFromEnvironmentForProvider(DatabaseProvider.POSTGRESQL);
      } catch (error) {
        console.warn(`⚠️ Could not create PostgreSQL config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Primary MongoDB database (if configured)
    if (this.envConfig.DATABASE_PROVIDER_MONGODB || this.envConfig.DATABASE_URL_MONGODB || this.envConfig.DATABASE_HOST_MONGODB) {
      try {
        configs.mongodb = this.createConfigFromEnvironmentForProvider(DatabaseProvider.MONGODB);
      } catch (error) {
        console.warn(`⚠️ Could not create MongoDB config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Primary MySQL database (if configured)
    if (this.envConfig.DATABASE_PROVIDER_MYSQL || this.envConfig.DATABASE_HOST_MYSQL) {
      try {
        configs.mysql = this.createConfigFromEnvironmentForProvider(DatabaseProvider.MYSQL);
      } catch (error) {
        console.warn(`⚠️ Could not create MySQL config: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Determine which config to set as the 'primary' if multiple are configured.
    // This logic can be adjusted based on specific application requirements.
    const configuredProviders = Object.keys(configs);

    if (configuredProviders.length === 1) {
      configs.primary = configs[configuredProviders[0]];
    } else if (configuredProviders.length > 1) {
      // If DATABASE_PROVIDER is explicitly set, use that as primary
      if (this.envConfig.DATABASE_PROVIDER && configs[this.envConfig.DATABASE_PROVIDER]) {
        configs.primary = configs[this.envConfig.DATABASE_PROVIDER];
      } else if (configs.postgresql) {
        configs.primary = configs.postgresql; // Default to PostgreSQL if multiple and no general provider
      } else if (configs.mongodb) {
        configs.primary = configs.mongodb; // Default to MongoDB if multiple and no general provider
      } else if (configs.mysql) {
        configs.primary = configs.mysql; // Default to MySQL if multiple and no general provider
      } 
    }

    // Read replica (apply to the determined primary if configured)
    if (configs.primary && this.envConfig.DATABASE_READ_HOST) {
      configs.read = {
        ...configs.primary,
        host: this.envConfig.DATABASE_READ_HOST as string,
        port: this.parseNumber(this.envConfig.DATABASE_READ_PORT, configs.primary.port || 5432),
        username: this.envConfig.DATABASE_READ_USERNAME || configs.primary.username,
        password: this.envConfig.DATABASE_READ_PASSWORD || configs.primary.password
      };
    }

    // Cache database (Redis/MongoDB)
    if (this.envConfig.CACHE_DATABASE_URL) {
      configs.cache = {
        provider: DatabaseProvider.MONGODB, // or Redis when supported
        url: this.envConfig.CACHE_DATABASE_URL as string,
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
   * Helper to create a specific provider's config from environment variables.
   * This helps in `getMultiDatabaseConfig` to build configs for each provider independently.
   */
  private createConfigFromEnvironmentForProvider(provider: DatabaseProvider): DatabaseConfig {
    const env = this.envConfig; // Use raw envConfig here, validation happens at the end

    const baseConfig: Partial<DatabaseConfig> = {
      provider,
      pool: {
        min: 0,
        max: 10,
        idle: 10000,
        acquire: 60000,
        evict: 1000
      }
    };

    let config: DatabaseConfig;

    switch (provider) {
      case DatabaseProvider.POSTGRESQL:
        config = {
          ...baseConfig,
          host: env.DATABASE_HOST_PG || 'localhost',
          port: this.parseNumber(env.DATABASE_PORT_PG, 5432),
          database: env.DATABASE_NAME_PG || 'nextauth',
          username: env.DATABASE_USERNAME_PG || 'postgres',
          password: env.DATABASE_PASSWORD_PG || '',
          schema: env.DATABASE_SCHEMA_PG || 'public',
          ssl: this.parseBoolean(env.DATABASE_SSL_PG, false),
          logging: this.parseBoolean(env.DATABASE_LOGGING_PG, false),
          pool: {
            min: this.parseNumber(env.DATABASE_POOL_MIN_PG, 0),
            max: this.parseNumber(env.DATABASE_POOL_MAX_PG, 10),
            idle: this.parseNumber(env.DATABASE_POOL_IDLE_PG, 10000),
            acquire: this.parseNumber(env.DATABASE_POOL_ACQUIRE_PG, 60000),
            evict: this.parseNumber(env.DATABASE_POOL_EVICT_PG, 1000)
          }
        } as DatabaseConfig;
        break;

      case DatabaseProvider.MYSQL:
        config = {
          ...baseConfig,
          host: env.DATABASE_HOST_MYSQL || 'localhost',
          port: this.parseNumber(env.DATABASE_PORT_MYSQL, 3306),
          database: env.DATABASE_NAME_MYSQL || 'nextauth',
          username: env.DATABASE_USERNAME_MYSQL || 'root',
          password: env.DATABASE_PASSWORD_MYSQL || '',
          schema: env.DATABASE_SCHEMA_MYSQL || undefined, // MySQL schema is optional and often corresponds to database name
          ssl: this.parseBoolean(env.DATABASE_SSL_MYSQL, false),
          logging: this.parseBoolean(env.DATABASE_LOGGING_MYSQL, false),
          pool: {
            min: this.parseNumber(env.DATABASE_POOL_MIN_MYSQL, 0),
            max: this.parseNumber(env.DATABASE_POOL_MAX_MYSQL, 10),
            idle: this.parseNumber(env.DATABASE_POOL_IDLE_MYSQL, 10000),
            acquire: this.parseNumber(env.DATABASE_POOL_ACQUIRE_MYSQL, 60000),
            evict: this.parseNumber(env.DATABASE_POOL_EVICT_MYSQL, 1000)
          }
        } as DatabaseConfig;
        break;

      case DatabaseProvider.MONGODB:
        if (env.DATABASE_URL_MONGODB) {
          config = {
            ...baseConfig,
            url: env.DATABASE_URL_MONGODB,
            ssl: this.parseBoolean(env.DATABASE_SSL_MONGODB, false),
            logging: this.parseBoolean(env.DATABASE_LOGGING_MONGODB, false),
            pool: {
              min: this.parseNumber(env.DATABASE_POOL_MIN_MONGODB, 0),
              max: this.parseNumber(env.DATABASE_POOL_MAX_MONGODB, 10),
              idle: this.parseNumber(env.DATABASE_POOL_IDLE_MONGODB, 10000),
              acquire: this.parseNumber(env.DATABASE_POOL_ACQUIRE_MONGODB, 60000),
              evict: this.parseNumber(env.DATABASE_POOL_EVICT_MONGODB, 1000)
            }
          } as DatabaseConfig;
        } else {
          config = {
            ...baseConfig,
            host: env.DATABASE_HOST_MONGODB || 'localhost',
            port: this.parseNumber(env.DATABASE_PORT_MONGODB, 27017),
            database: env.DATABASE_NAME_MONGODB || 'nextauth',
            username: env.DATABASE_USERNAME_MONGODB,
            password: env.DATABASE_PASSWORD_MONGODB,
            authSource: env.DATABASE_AUTH_SOURCE_MONGODB || 'admin',
            ssl: this.parseBoolean(env.DATABASE_SSL_MONGODB, false),
            logging: this.parseBoolean(env.DATABASE_LOGGING_MONGODB, false),
            pool: {
              min: this.parseNumber(env.DATABASE_POOL_MIN_MONGODB, 0),
              max: this.parseNumber(env.DATABASE_POOL_MAX_MONGODB, 10),
              idle: this.parseNumber(env.DATABASE_POOL_IDLE_MONGODB, 10000),
              acquire: this.parseNumber(env.DATABASE_POOL_ACQUIRE_MONGODB, 60000),
              evict: this.parseNumber(env.DATABASE_POOL_EVICT_MONGODB, 1000)
            }
          } as DatabaseConfig;
        }
        break;

      default:
        throw new Error(`Unsupported database provider: ${provider}`);
    }

    this.validateConfig(config);
    return config;
  }

  /**
   * Loads environment variables
   */
  private loadEnvironmentVariables(): void {
    this.envConfig = {
      // General provider
      DATABASE_PROVIDER: process.env.DATABASE_PROVIDER,

      // PostgreSQL Specific
      DATABASE_PROVIDER_PG: process.env.DATABASE_PROVIDER_PG,
      DATABASE_HOST_PG: process.env.DATABASE_HOST_PG,
      DATABASE_PORT_PG: process.env.DATABASE_PORT_PG,
      DATABASE_NAME_PG: process.env.DATABASE_NAME_PG,
      DATABASE_USERNAME_PG: process.env.DATABASE_USERNAME_PG,
      DATABASE_PASSWORD_PG: process.env.DATABASE_PASSWORD_PG,
      DATABASE_SCHEMA_PG: process.env.DATABASE_SCHEMA_PG,
      DATABASE_SSL_PG: process.env.DATABASE_SSL_PG,
      DATABASE_LOGGING_PG: process.env.DATABASE_LOGGING_PG,
      DATABASE_POOL_MIN_PG: process.env.DATABASE_POOL_MIN_PG,
      DATABASE_POOL_MAX_PG: process.env.DATABASE_POOL_MAX_PG,
      DATABASE_POOL_IDLE_PG: process.env.DATABASE_POOL_IDLE_PG,
      DATABASE_POOL_ACQUIRE_PG: process.env.DATABASE_POOL_ACQUIRE_PG,
      DATABASE_POOL_EVICT_PG: process.env.DATABASE_POOL_EVICT_PG,

      // MySQL Specific (placeholder for future expansion)
      DATABASE_PROVIDER_MYSQL: process.env.DATABASE_PROVIDER_MYSQL,
      DATABASE_HOST_MYSQL: process.env.DATABASE_HOST_MYSQL,
      DATABASE_PORT_MYSQL: process.env.DATABASE_PORT_MYSQL,
      DATABASE_NAME_MYSQL: process.env.DATABASE_NAME_MYSQL,
      DATABASE_USERNAME_MYSQL: process.env.DATABASE_USERNAME_MYSQL,
      DATABASE_PASSWORD_MYSQL: process.env.DATABASE_PASSWORD_MYSQL,
      DATABASE_SCHEMA_MYSQL: process.env.DATABASE_SCHEMA_MYSQL,
      DATABASE_SSL_MYSQL: process.env.DATABASE_SSL_MYSQL,
      DATABASE_LOGGING_MYSQL: process.env.DATABASE_LOGGING_MYSQL,
      DATABASE_POOL_MIN_MYSQL: process.env.DATABASE_POOL_MIN_MYSQL,
      DATABASE_POOL_MAX_MYSQL: process.env.DATABASE_POOL_MAX_MYSQL,
      DATABASE_POOL_IDLE_MYSQL: process.env.DATABASE_POOL_IDLE_MYSQL,
      DATABASE_POOL_ACQUIRE_MYSQL: process.env.DATABASE_POOL_ACQUIRE_MYSQL,
      DATABASE_POOL_EVICT_MYSQL: process.env.DATABASE_POOL_EVICT_MYSQL,

      // MongoDB Specific
      DATABASE_PROVIDER_MONGODB: process.env.DATABASE_PROVIDER_MONGODB,
      DATABASE_URL_MONGODB: process.env.DATABASE_URL_MONGODB,
      DATABASE_HOST_MONGODB: process.env.DATABASE_HOST_MONGODB,
      DATABASE_PORT_MONGODB: process.env.DATABASE_PORT_MONGODB,
      DATABASE_NAME_MONGODB: process.env.DATABASE_NAME_MONGODB,
      DATABASE_USERNAME_MONGODB: process.env.DATABASE_USERNAME_MONGODB,
      DATABASE_PASSWORD_MONGODB: process.env.DATABASE_PASSWORD_MONGODB,
      DATABASE_AUTH_SOURCE_MONGODB: process.env.DATABASE_AUTH_SOURCE_MONGODB,
      DATABASE_SSL_MONGODB: process.env.DATABASE_SSL_MONGODB,
      DATABASE_LOGGING_MONGODB: process.env.DATABASE_LOGGING_MONGODB,
      DATABASE_POOL_MIN_MONGODB: process.env.DATABASE_POOL_MIN_MONGODB,
      DATABASE_POOL_MAX_MONGODB: process.env.DATABASE_POOL_MAX_MONGODB,
      DATABASE_POOL_IDLE_MONGODB: process.env.DATABASE_POOL_IDLE_MONGODB,
      DATABASE_POOL_ACQUIRE_MONGODB: process.env.DATABASE_POOL_ACQUIRE_MONGODB,
      DATABASE_POOL_EVICT_MONGODB: process.env.DATABASE_POOL_EVICT_MONGODB,

      // Read Replica
      DATABASE_READ_HOST: process.env.DATABASE_READ_HOST,
      DATABASE_READ_PORT: process.env.DATABASE_READ_PORT,
      DATABASE_READ_USERNAME: process.env.DATABASE_READ_USERNAME,
      DATABASE_READ_PASSWORD: process.env.DATABASE_READ_PASSWORD,

      // Cache Database
      CACHE_DATABASE_URL: process.env.CACHE_DATABASE_URL,
    };
  }

  /**
   * Validates environment variables
   */
  private getValidatedEnvironment(): Record<string, string> {
    try {
      // Explicitly filter for defined environment variables before parsing
      const definedEnvConfig: Record<string, string> = Object.entries(this.envConfig)
        .filter(([, value]) => value !== undefined && value !== '')
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

      return EnvironmentConfigSchema.parse(definedEnvConfig) as Record<string, string>;
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