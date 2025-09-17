import { DatabaseConfig, DatabaseProvider, UserRepository, SessionRepository, SocialAccountRepository, DatabaseConnection } from './types';
import { SequelizeConnection } from './sequelize/SequelizeConnection';
import { MongooseConnection } from './mongoose/MongooseConnection';
import { SequelizeUserRepository } from './sequelize/repositories/SequelizeUserRepository';
import { SequelizeSessionRepository } from './sequelize/repositories/SequelizeSessionRepository';
import { SequelizeSocialAccountRepository } from './sequelize/repositories/SequelizeSocialAccountRepository';
import { MongooseUserRepository } from './mongoose/repositories/MongooseUserRepository';
import { MongooseSessionRepository } from './mongoose/repositories/MongooseSessionRepository';
import { MongooseSocialAccountRepository } from './mongoose/repositories/MongooseSocialAccountRepository';
import { UserModel as SequelizeUserModel, SessionModel as SequelizeSessionModel, SocialAccountModel as SequelizeSocialAccountModel } from './sequelize/models';
import { UserModel as MongooseUserModel, SessionModel as MongooseSessionModel, SocialAccountModel as MongooseSocialAccountModel } from './mongoose/models';

/**
 * Database factory for creating database connections and repositories
 */
export class DatabaseFactory {
  private static instance: DatabaseFactory;
  private connections: Map<string, DatabaseConnection> = new Map();
  private repositories: Map<string, {
    user: UserRepository;
    session: SessionRepository;
    socialAccount: SocialAccountRepository;
  }> = new Map();
  private currentConfig: DatabaseConfig | null = null;

  private constructor() {}

  /**
   * Gets singleton instance
   */
  static getInstance(): DatabaseFactory {
    if (!DatabaseFactory.instance) {
      DatabaseFactory.instance = new DatabaseFactory();
    }
    return DatabaseFactory.instance;
  }

  /**
   * Creates database connection based on provider
   */
  async createConnection(config: DatabaseConfig): Promise<DatabaseConnection> {
    const connectionKey = this.getConnectionKey(config);
    
    // Return existing connection if available
    if (this.connections.has(connectionKey)) {
      return this.connections.get(connectionKey)!;
    }

    let connection: DatabaseConnection;

    switch (config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        connection = new SequelizeConnection(config);
        break;
      
      case DatabaseProvider.MONGODB:
        connection = new MongooseConnection(config);
        break;
      
      default:
        throw new Error(`Unsupported database provider: ${config.provider}`);
    }

    // Connect to database
    await connection.connect();
    
    // Store connection
    this.connections.set(connectionKey, connection);
    
    return connection;
  }

  /**
   * Creates repositories for a database connection
   */
  async createRepositories(config: DatabaseConfig): Promise<{
    user: UserRepository;
    session: SessionRepository;
    socialAccount: SocialAccountRepository;
  }> {
    const connectionKey = this.getConnectionKey(config);
    
    // Return existing repositories if available
    if (this.repositories.has(connectionKey)) {
      return this.repositories.get(connectionKey)!;
    }

    // Get or create connection
    await this.createConnection(config);
    
    let repositories: {
      user: UserRepository;
      session: SessionRepository;
      socialAccount: SocialAccountRepository;
    };

    switch (config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        repositories = {
          user: new SequelizeUserRepository(SequelizeUserModel),
          session: new SequelizeSessionRepository(SequelizeSessionModel),
          socialAccount: new SequelizeSocialAccountRepository(SequelizeSocialAccountModel)
        };
        break;
      
      case DatabaseProvider.MONGODB:
        repositories = {
          user: new MongooseUserRepository(MongooseUserModel),
          session: new MongooseSessionRepository(MongooseSessionModel),
          socialAccount: new MongooseSocialAccountRepository(MongooseSocialAccountModel)
        };
        break;
      
      default:
        throw new Error(`Unsupported database provider: ${config.provider}`);
    }

    // Store repositories
    this.repositories.set(connectionKey, repositories);
    
    return repositories;
  }

  /**
   * Gets existing connection
   */
  getConnection(config: DatabaseConfig): DatabaseConnection | null {
    const connectionKey = this.getConnectionKey(config);
    return this.connections.get(connectionKey) || null;
  }

  /**
   * Gets existing repositories
   */
  getRepositories(config: DatabaseConfig): {
    user: UserRepository;
    session: SessionRepository;
    socialAccount: SocialAccountRepository;
  } | null {
    const connectionKey = this.getConnectionKey(config);
    return this.repositories.get(connectionKey) || null;
  }

  /**
   * Closes connection and cleans up resources
   */
  async closeConnection(config: DatabaseConfig): Promise<void> {
    const connectionKey = this.getConnectionKey(config);
    const connection = this.connections.get(connectionKey);
    
    if (connection) {
      await connection.disconnect();
      this.connections.delete(connectionKey);
      this.repositories.delete(connectionKey);
    }
  }

  /**
   * Closes all connections
   */
  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(connection => 
      connection.disconnect()
    );
    
    await Promise.all(closePromises);
    this.connections.clear();
    this.repositories.clear();
  }

  /**
   * Disconnect from database (alias for closeAllConnections)
   */
  async disconnect(): Promise<void> {
    await this.closeAllConnections();
  }

  /**
   * Initialize the factory with a configuration
   */
  async initialize(config: DatabaseConfig): Promise<void> {
    this.validateConfig(config);
    await this.createConnection(config);
    await this.createRepositories(config);
    this.currentConfig = config;
  }

  /**
   * Get the current database provider
   */
  getProvider(): DatabaseProvider | null {
    return this.currentConfig?.provider || null;
  }

  /**
   * Check if the factory is connected to a database
   */
  isConnected(): boolean {
    if (!this.currentConfig) return false;
    const connection = this.getConnection(this.currentConfig);
    return connection !== null;
  }

  /**
   * Reconnect to the database
   */
  async reconnect(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('No configuration available for reconnection');
    }
    await this.disconnect();
    await this.initialize(this.currentConfig);
  }

  /**
   * Perform a health check
   */
  async healthCheck(): Promise<{ status: string; provider: string; timestamp: Date }> {
    if (!this.currentConfig) {
      return {
        status: 'disconnected',
        provider: 'none',
        timestamp: new Date()
      };
    }

    try {
      const isHealthy = await this.checkHealth(this.currentConfig);
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        provider: this.currentConfig.provider,
        timestamp: new Date()
      };
    } catch {
      return {
        status: 'error',
        provider: this.currentConfig.provider,
        timestamp: new Date()
      };
    }
  }

  /**
   * Run migrations (alias for runMigrations)
   */
  async migrate(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    await this.runMigrations(this.currentConfig);
  }

  /**
   * Rollback migrations
   */
  async rollback(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    // For now, this is a placeholder - actual rollback implementation would depend on the migration system
    console.log('Rollback migrations - placeholder implementation');
  }

  /**
   * Seed database (alias for runSeeds)
   */
  async seed(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    await this.runSeeds(this.currentConfig);
  }

  /**
   * Execute a database transaction
   */
  async transaction<T>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<T>): Promise<T> {
    if (!this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    
    const connection = this.getConnection(this.currentConfig);
    if (!connection) {
      throw new Error('No active database connection');
    }

    // For now, this is a simplified implementation
    // In a real implementation, this would use the actual transaction API of the database
    try {
      const result = await callback(null); // Mock transaction object
      return result;
    } catch (error) {
      // In a real implementation, this would rollback the transaction
      throw error;
    }
  }

  /**
   * Get user repository for the default configuration
   */
  getUserRepository(config?: DatabaseConfig): UserRepository {
    if (!config && !this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    const dbConfig = config || this.currentConfig!;
    const repositories = this.getRepositories(dbConfig);
    if (!repositories) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return repositories.user;
  }

  /**
   * Get session repository for the default configuration
   */
  getSessionRepository(config?: DatabaseConfig): SessionRepository {
    if (!config && !this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    const dbConfig = config || this.currentConfig!;
    const repositories = this.getRepositories(dbConfig);
    if (!repositories) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return repositories.session;
  }

  /**
   * Get social account repository for the default configuration
   */
  getSocialAccountRepository(config?: DatabaseConfig): SocialAccountRepository {
    if (!config && !this.currentConfig) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    const dbConfig = config || this.currentConfig!;
    const repositories = this.getRepositories(dbConfig);
    if (!repositories) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return repositories.socialAccount;
  }

  /**
   * Runs migrations for a database
   */
  async runMigrations(config: DatabaseConfig): Promise<void> {
    const connection = await this.createConnection(config);
    await connection.migrate();
  }

  /**
   * Runs seeds for a database
   */
  async runSeeds(config: DatabaseConfig): Promise<void> {
    const connection = await this.createConnection(config);
    await connection.seed();
  }

  /**
   * Checks health of a database connection
   */
  async checkHealth(config: DatabaseConfig): Promise<boolean> {
    try {
      const connection = this.getConnection(config);
      if (!connection) {
        return false;
      }
      return await connection.healthCheck();
    } catch {
      return false;
    }
  }

  /**
   * Gets health status of all connections
   */
  async getAllHealthStatus(): Promise<Record<string, boolean>> {
    const healthPromises = Array.from(this.connections.entries()).map(async ([key, connection]) => {
      try {
        const isHealthy = await connection.healthCheck();
        return [key, isHealthy] as [string, boolean];
      } catch {
        return [key, false] as [string, boolean];
      }
    });
    
    const results = await Promise.all(healthPromises);
    return Object.fromEntries(results);
  }

  /**
   * Creates connection key for caching
   */
  private getConnectionKey(config: DatabaseConfig): string {
    const { provider, host, port, database, username } = config;
    return `${provider}://${username}@${host}:${port}/${database}`;
  }

  /**
   * Validates database configuration
   */
  validateConfig(config: DatabaseConfig): void {
    if (!config.provider) {
      throw new Error('Database provider is required');
    }

    if (!Object.values(DatabaseProvider).includes(config.provider)) {
      throw new Error(`Invalid database provider: ${config.provider}`);
    }

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
   * Creates database configuration from environment variables
   */
  static createConfigFromEnv(): DatabaseConfig {
    const provider = process.env.DATABASE_PROVIDER as DatabaseProvider;
    
    if (!provider) {
      throw new Error('DATABASE_PROVIDER environment variable is required');
    }

    const baseConfig = {
      provider,
      ssl: process.env.DATABASE_SSL === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
      pool: {
        min: parseInt(process.env.DATABASE_POOL_MIN || '0'),
        max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
        idle: parseInt(process.env.DATABASE_POOL_IDLE || '10000'),
        acquire: parseInt(process.env.DATABASE_POOL_ACQUIRE || '60000'),
        evict: parseInt(process.env.DATABASE_POOL_EVICT || '1000')
      }
    };

    switch (provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        return {
          ...baseConfig,
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT || (provider === DatabaseProvider.POSTGRESQL ? '5432' : '3306')),
          database: process.env.DATABASE_NAME || 'nextauth',
          username: process.env.DATABASE_USERNAME || 'root',
          password: process.env.DATABASE_PASSWORD || '',
          schema: process.env.DATABASE_SCHEMA
        };
      
      case DatabaseProvider.MONGODB:
        return {
          ...baseConfig,
          url: process.env.DATABASE_URL,
          host: process.env.DATABASE_HOST || 'localhost',
          port: parseInt(process.env.DATABASE_PORT || '27017'),
          database: process.env.DATABASE_NAME || 'nextauth',
          username: process.env.DATABASE_USERNAME,
          password: process.env.DATABASE_PASSWORD,
          authSource: process.env.DATABASE_AUTH_SOURCE || 'admin'
        };
      
      default:
        throw new Error(`Unsupported database provider: ${provider}`);
    }
  }

  /**
   * Creates test database configuration
   */
  static createTestConfig(provider: DatabaseProvider): DatabaseConfig {
    const baseConfig = {
      provider,
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

    switch (provider) {
      case DatabaseProvider.POSTGRESQL:
        return {
          ...baseConfig,
          host: 'localhost',
          port: 5432,
          database: 'nextauth_test',
          username: 'postgres',
          password: 'password'
        };
      
      case DatabaseProvider.MYSQL:
        return {
          ...baseConfig,
          host: 'localhost',
          port: 3306,
          database: 'nextauth_test',
          username: 'root',
          password: 'password'
        };
      
      case DatabaseProvider.MONGODB:
        return {
          ...baseConfig,
          host: 'localhost',
          port: 27017,
          database: 'nextauth_test',
          username: undefined,
          password: undefined
        };
      
      default:
        throw new Error(`Unsupported database provider: ${provider}`);
    }
  }
}

/**
 * Default database factory instance
 */
export const databaseFactory = DatabaseFactory.getInstance();

/**
 * Helper function to create repositories with configuration
 */
export async function createRepositories(config?: DatabaseConfig) {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const factory = DatabaseFactory.getInstance();
  factory.validateConfig(dbConfig);
  return await factory.createRepositories(dbConfig);
}

/**
 * Helper function to create connection with configuration
 */
export async function createConnection(config?: DatabaseConfig) {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const factory = DatabaseFactory.getInstance();
  factory.validateConfig(dbConfig);
  return await factory.createConnection(dbConfig);
}

/**
 * Helper function to run migrations
 */
export async function runMigrations(config?: DatabaseConfig) {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const factory = DatabaseFactory.getInstance();
  factory.validateConfig(dbConfig);
  return await factory.runMigrations(dbConfig);
}

/**
 * Helper function to run seeds
 */
export async function runSeeds(config?: DatabaseConfig) {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const factory = DatabaseFactory.getInstance();
  factory.validateConfig(dbConfig);
  return await factory.runSeeds(dbConfig);
}

/**
 * Helper function to check database health
 */
export async function checkDatabaseHealth(config?: DatabaseConfig) {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const factory = DatabaseFactory.getInstance();
  return await factory.checkHealth(dbConfig);
}

/**
 * Helper function to close all database connections
 */
export async function closeAllConnections() {
  const factory = DatabaseFactory.getInstance();
  return await factory.closeAllConnections();
}