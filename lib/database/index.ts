/**
 * Database Abstraction Layer
 * 
 * This module provides a unified interface for database operations across
 * different database providers (PostgreSQL, MySQL, MongoDB) using Sequelize
 * and Mongoose ORMs.
 */

import { DatabasePresets, getDatabaseConfig, DatabaseConfigManager } from './config/database.config';
import { DatabaseFactory } from './DatabaseFactory';
import { MigrationManager } from './migrations/MigrationManager';
import type { DatabaseConfig } from './types';

// Core types and interfaces
export * from './types';

// Database factory and connection management
export { DatabaseFactory } from './DatabaseFactory';
export { MigrationManager } from './migrations/MigrationManager';

// Configuration
export {
  DatabaseConfigManager,
  databaseConfig,
  getDatabaseConfig,
  getConnectionString,
  getEnvironmentConfig,
  getMultiDatabaseConfig,
  validateDatabaseConfig,
  DatabasePresets
} from './config/database.config';

// Base repository
export { AbstractBaseRepository } from './base/BaseRepository';

// Sequelize implementations
export { SequelizeConnection } from './sequelize/SequelizeConnection';
export {
  UserModel as SequelizeUserModel,
  SessionModel as SequelizeSessionModel,
  SocialAccountModel as SequelizeSocialAccountModel,
  PasswordResetModel as SequelizePasswordResetModel,
  EmailVerificationModel as SequelizeEmailVerificationModel,
  AuditLogModel as SequelizeAuditLogModel
} from './sequelize/models';
export { SequelizeUserRepository } from './sequelize/repositories/SequelizeUserRepository';
export { SequelizeSessionRepository } from './sequelize/repositories/SequelizeSessionRepository';
export { SequelizeSocialAccountRepository } from './sequelize/repositories/SequelizeSocialAccountRepository';

// Mongoose implementations
export { MongooseConnection } from './mongoose/MongooseConnection';
export type {
  UserDocument as MongooseUserDocument,
  SessionDocument as MongooseSessionDocument,
  SocialAccountDocument as MongooseSocialAccountDocument,
  PasswordResetDocument as MongoosePasswordResetDocument,
  EmailVerificationDocument as MongooseEmailVerificationDocument,
  AuditLogDocument as MongooseAuditLogDocument
} from './mongoose/models';
export {
  UserModel as MongooseUserModel,
  SessionModel as MongooseSessionModel,
  SocialAccountModel as MongooseSocialAccountModel,
  PasswordResetModel as MongoosePasswordResetModel,
  EmailVerificationModel as MongooseEmailVerificationModel,
  AuditLogModel as MongooseAuditLogModel
} from './mongoose/models';
export { MongooseUserRepository } from './mongoose/repositories/MongooseUserRepository';
export { MongooseSessionRepository } from './mongoose/repositories/MongooseSessionRepository';
export { MongooseSocialAccountRepository } from './mongoose/repositories/MongooseSocialAccountRepository';

// Utility functions and helpers
export const DatabaseUtils = {
  /**
   * Creates a database factory instance with the specified configuration
   */
  createFactory: async (config?: DatabaseConfig) => {
    const factory = DatabaseFactory.getInstance();
    if (config) {
      await factory.initialize(config);
    }
    return factory;
  },

  /**
   * Creates a database factory with environment-based configuration
   */
  createFactoryFromEnv: async () => {
    const factory = DatabaseFactory.getInstance();
    const config = getDatabaseConfig();
    await factory.initialize(config);
    return factory;
  },

  /**
   * Creates a database factory for testing
   */
  createTestFactory: async (provider: 'postgresql' | 'mysql' | 'mongodb' = 'postgresql') => {
    const factory = DatabaseFactory.getInstance();
    const config = DatabasePresets.test[provider];
    await factory.initialize(config);
    return factory;
  },

  /**
   * Validates database connection
   */
  validateConnection: async (factory: DatabaseFactory) => {
    try {
      const health = await factory.healthCheck();
      return health.status === 'healthy';
    } catch {
      return false;
    }
  },

  /**
   * Runs database migrations
   */
  runMigrations: async (factory: DatabaseFactory) => {
    await factory.migrate();
  },

  /**
   * Seeds database with initial data
   */
  seedDatabase: async (factory: DatabaseFactory) => {
    await factory.seed();
  },

  /**
   * Performs database cleanup (for testing)
   */
  cleanup: async (factory: DatabaseFactory) => {
    await factory.disconnect();
  }
};

// Default export for convenience
const databaseModule = {
  DatabaseFactory,
  DatabaseConfigManager,
  MigrationManager,
  DatabaseUtils,
  DatabasePresets
};

export default databaseModule;

/**
 * Quick start examples:
 * 
 * ```typescript
 * // Initialize with environment configuration
 * import { DatabaseUtils } from '@/lib/database';
 * 
 * const factory = await DatabaseUtils.createFactoryFromEnv();
 * const userRepo = factory.getUserRepository();
 * 
 * // Create a user
 * const user = await userRepo.create({
 *   email: 'user@example.com',
 *   username: 'user123',
 *   firstName: 'John',
 *   lastName: 'Doe'
 * });
 * 
 * // Find user by email
 * const foundUser = await userRepo.findByEmail('user@example.com');
 * 
 * // Update user
 * const updatedUser = await userRepo.update(user.id, {
 *   firstName: 'Jane'
 * });
 * 
 * // Clean up
 * await DatabaseUtils.cleanup(factory);
 * ```
 * 
 * ```typescript
 * // Initialize with specific configuration
 * import { DatabaseFactory, DatabaseProvider } from '@/lib/database';
 * 
 * const factory = DatabaseFactory.getInstance();
 * await factory.initialize({
 *   provider: DatabaseProvider.POSTGRESQL,
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'myapp',
 *   username: 'postgres',
 *   password: 'password',
 *   ssl: false,
 *   logging: true
 * });
 * 
 * // Use repositories
 * const userRepo = factory.getUserRepository();
 * const sessionRepo = factory.getSessionRepository();
 * const socialRepo = factory.getSocialAccountRepository();
 * ```
 * 
 * ```typescript
 * // Transaction example
 * import { DatabaseUtils } from '@/lib/database';
 * 
 * const factory = await DatabaseUtils.createFactoryFromEnv();
 * 
 * await factory.transaction(async (trx) => {
 *   const userRepo = factory.getUserRepository();
 *   const sessionRepo = factory.getSessionRepository();
 *   
 *   // Create user and session in the same transaction
 *   const user = await userRepo.create({
 *     email: 'user@example.com',
 *     username: 'user123',
 *     firstName: 'John',
 *     lastName: 'Doe'
 *   }, trx);
 *   
 *   const session = await sessionRepo.create({
 *     userId: user.id,
 *     token: 'session-token',
 *     expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
 *   }, trx);
 *   
 *   return { user, session };
 * });
 * ```
 * 
 * ```typescript
 * // Migration example
 * import { MigrationManager } from '@/lib/database';
 * 
 * const factory = await DatabaseUtils.createFactoryFromEnv();
 * const migrationManager = new MigrationManager(factory.getConnection());
 * 
 * // Run pending migrations
 * await migrationManager.migrate();
 * 
 * // Check migration status
 * const status = await migrationManager.getStatus();
 * console.log('Pending migrations:', status.pending.length);
 * console.log('Applied migrations:', status.applied.length);
 * 
 * // Rollback last migration
 * await migrationManager.rollback();
 * ```
 */