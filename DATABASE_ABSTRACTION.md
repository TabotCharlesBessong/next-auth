# Database Abstraction Layer Design

## Overview

The database abstraction layer provides a unified interface for interacting with different database systems (PostgreSQL, MySQL, MongoDB) while maintaining type safety and performance. This design follows the Repository pattern and Dependency Injection principles to ensure flexibility and testability.

## Architecture Principles

### 1. Repository Pattern
- **Separation of Concerns**: Business logic separated from data access logic
- **Testability**: Easy mocking and unit testing
- **Flexibility**: Switch between databases without changing business logic
- **Consistency**: Uniform interface across different data sources

### 2. Interface Segregation
- **Focused Interfaces**: Each repository handles specific domain entities
- **Minimal Dependencies**: Interfaces contain only necessary methods
- **Type Safety**: Strong typing with TypeScript generics

### 3. Factory Pattern
- **Dynamic Creation**: Runtime database selection based on configuration
- **Centralized Management**: Single point for repository instantiation
- **Configuration-Driven**: Database choice determined by environment variables

## Core Interfaces

### Base Repository Interface

```typescript
// src/lib/database/interfaces/base-repository.interface.ts
export interface BaseRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(options?: QueryOptions): Promise<T[]>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: ID, updates: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
  count(filter?: Partial<T>): Promise<number>;
  exists(id: ID): Promise<boolean>;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  filter?: Record<string, any>;
}
```

### User Repository Interface

```typescript
// src/lib/database/interfaces/user-repository.interface.ts
import { BaseRepository } from './base-repository.interface';
import { User, UserCreateInput, UserUpdateInput } from '../types/user.types';

export interface UserRepository extends BaseRepository<User, string> {
  // Authentication specific methods
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findByProvider(provider: string, providerId: string): Promise<User | null>;
  
  // User management methods
  updatePassword(userId: string, hashedPassword: string): Promise<boolean>;
  updateEmailVerification(userId: string, verified: boolean): Promise<boolean>;
  updateLastLogin(userId: string): Promise<boolean>;
  
  // Search and filtering
  searchUsers(query: string, options?: QueryOptions): Promise<User[]>;
  findActiveUsers(options?: QueryOptions): Promise<User[]>;
  findUsersByRole(role: string, options?: QueryOptions): Promise<User[]>;
  
  // Bulk operations
  createMany(users: UserCreateInput[]): Promise<User[]>;
  updateMany(filter: Partial<User>, updates: UserUpdateInput): Promise<number>;
  deleteMany(filter: Partial<User>): Promise<number>;
}
```

### Session Repository Interface

```typescript
// src/lib/database/interfaces/session-repository.interface.ts
import { BaseRepository } from './base-repository.interface';
import { Session, SessionCreateInput } from '../types/session.types';

export interface SessionRepository extends BaseRepository<Session, string> {
  // Session management
  findByToken(token: string): Promise<Session | null>;
  findByUserId(userId: string): Promise<Session[]>;
  findActiveByUserId(userId: string): Promise<Session[]>;
  
  // Session lifecycle
  createSession(session: SessionCreateInput): Promise<Session>;
  refreshSession(sessionId: string, newExpiry: Date): Promise<Session | null>;
  invalidateSession(sessionId: string): Promise<boolean>;
  invalidateAllUserSessions(userId: string): Promise<number>;
  
  // Cleanup operations
  deleteExpiredSessions(): Promise<number>;
  deleteOldSessions(olderThan: Date): Promise<number>;
}
```

### OAuth Account Repository Interface

```typescript
// src/lib/database/interfaces/oauth-repository.interface.ts
import { BaseRepository } from './base-repository.interface';
import { OAuthAccount, OAuthAccountCreateInput } from '../types/oauth.types';

export interface OAuthAccountRepository extends BaseRepository<OAuthAccount, string> {
  // OAuth account management
  findByProvider(provider: string, providerId: string): Promise<OAuthAccount | null>;
  findByUserId(userId: string): Promise<OAuthAccount[]>;
  findByUserAndProvider(userId: string, provider: string): Promise<OAuthAccount | null>;
  
  // Account linking
  linkAccount(account: OAuthAccountCreateInput): Promise<OAuthAccount>;
  unlinkAccount(userId: string, provider: string): Promise<boolean>;
  updateTokens(accountId: string, accessToken: string, refreshToken?: string): Promise<boolean>;
  
  // Provider management
  getLinkedProviders(userId: string): Promise<string[]>;
  isAccountLinked(userId: string, provider: string): Promise<boolean>;
}
```

## Type Definitions

### User Types

```typescript
// src/lib/database/types/user.types.ts
export interface User {
  id: string;
  email: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  role: UserRole;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Configurable fields (based on project requirements)
  customFields?: Record<string, any>;
}

export interface UserCreateInput {
  email: string;
  password?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  role?: UserRole;
  customFields?: Record<string, any>;
}

export interface UserUpdateInput {
  email?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  role?: UserRole;
  isEmailVerified?: boolean;
  isActive?: boolean;
  customFields?: Record<string, any>;
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator'
}
```

### Session Types

```typescript
// src/lib/database/types/session.types.ts
export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionCreateInput {
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}
```

### OAuth Types

```typescript
// src/lib/database/types/oauth.types.ts
export interface OAuthAccount {
  id: string;
  userId: string;
  provider: OAuthProvider;
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
  providerData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthAccountCreateInput {
  userId: string;
  provider: OAuthProvider;
  providerId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scope?: string;
  providerData?: Record<string, any>;
}

export enum OAuthProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
  GITHUB = 'github',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin'
}
```

## Database-Specific Implementations

### PostgreSQL Implementation (Prisma)

```typescript
// src/lib/database/implementations/postgresql/user-repository.ts
import { PrismaClient } from '@prisma/client';
import { UserRepository } from '../../interfaces/user-repository.interface';
import { User, UserCreateInput, UserUpdateInput } from '../../types/user.types';
import { QueryOptions } from '../../interfaces/base-repository.interface';

export class PostgreSQLUserRepository implements UserRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { id }
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email }
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    if (!username) return null;
    return await this.prisma.user.findUnique({
      where: { username }
    });
  }

  async findByProvider(provider: string, providerId: string): Promise<User | null> {
    const account = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerId: {
          provider,
          providerId
        }
      },
      include: {
        user: true
      }
    });
    return account?.user || null;
  }

  async create(userData: UserCreateInput): Promise<User> {
    return await this.prisma.user.create({
      data: {
        ...userData,
        role: userData.role || 'user',
        isEmailVerified: false,
        isActive: true
      }
    });
  }

  async update(id: string, updates: UserUpdateInput): Promise<User | null> {
    try {
      return await this.prisma.user.update({
        where: { id },
        data: updates
      });
    } catch (error) {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.user.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async findAll(options?: QueryOptions): Promise<User[]> {
    const { limit, offset, orderBy, orderDirection, filter } = options || {};
    
    return await this.prisma.user.findMany({
      where: filter,
      take: limit,
      skip: offset,
      orderBy: orderBy ? { [orderBy]: orderDirection || 'asc' } : undefined
    });
  }

  async count(filter?: Partial<User>): Promise<number> {
    return await this.prisma.user.count({
      where: filter
    });
  }

  async exists(id: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });
    return !!user;
  }

  // Additional PostgreSQL-specific methods
  async searchUsers(query: string, options?: QueryOptions): Promise<User[]> {
    const { limit, offset } = options || {};
    
    return await this.prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } }
        ]
      },
      take: limit,
      skip: offset
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateEmailVerification(userId: string, verified: boolean): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isEmailVerified: verified }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async updateLastLogin(userId: string): Promise<boolean> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() }
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  async findActiveUsers(options?: QueryOptions): Promise<User[]> {
    return await this.findAll({
      ...options,
      filter: { ...options?.filter, isActive: true }
    });
  }

  async findUsersByRole(role: string, options?: QueryOptions): Promise<User[]> {
    return await this.findAll({
      ...options,
      filter: { ...options?.filter, role }
    });
  }

  async createMany(users: UserCreateInput[]): Promise<User[]> {
    const createdUsers: User[] = [];
    
    for (const userData of users) {
      const user = await this.create(userData);
      createdUsers.push(user);
    }
    
    return createdUsers;
  }

  async updateMany(filter: Partial<User>, updates: UserUpdateInput): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: filter,
      data: updates
    });
    return result.count;
  }

  async deleteMany(filter: Partial<User>): Promise<number> {
    const result = await this.prisma.user.deleteMany({
      where: filter
    });
    return result.count;
  }
}
```

### MongoDB Implementation (Mongoose)

```typescript
// src/lib/database/implementations/mongodb/user-repository.ts
import { Model } from 'mongoose';
import { UserRepository } from '../../interfaces/user-repository.interface';
import { User, UserCreateInput, UserUpdateInput } from '../../types/user.types';
import { QueryOptions } from '../../interfaces/base-repository.interface';
import { UserModel } from './models/user.model';

export class MongoDBUserRepository implements UserRepository {
  constructor(private userModel: Model<User> = UserModel) {}

  async findById(id: string): Promise<User | null> {
    return await this.userModel.findById(id).lean();
  }

  async findByEmail(email: string): Promise<User | null> {
    return await this.userModel.findOne({ email }).lean();
  }

  async findByUsername(username: string): Promise<User | null> {
    if (!username) return null;
    return await this.userModel.findOne({ username }).lean();
  }

  async findByProvider(provider: string, providerId: string): Promise<User | null> {
    // This would require a lookup to the OAuth accounts collection
    const pipeline = [
      {
        $lookup: {
          from: 'oauthaccounts',
          localField: '_id',
          foreignField: 'userId',
          as: 'accounts'
        }
      },
      {
        $match: {
          'accounts.provider': provider,
          'accounts.providerId': providerId
        }
      }
    ];
    
    const users = await this.userModel.aggregate(pipeline);
    return users[0] || null;
  }

  async create(userData: UserCreateInput): Promise<User> {
    const user = new this.userModel({
      ...userData,
      role: userData.role || 'user',
      isEmailVerified: false,
      isActive: true
    });
    
    const savedUser = await user.save();
    return savedUser.toObject();
  }

  async update(id: string, updates: UserUpdateInput): Promise<User | null> {
    return await this.userModel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, lean: true }
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.userModel.findByIdAndDelete(id);
    return !!result;
  }

  async findAll(options?: QueryOptions): Promise<User[]> {
    const { limit, offset, orderBy, orderDirection, filter } = options || {};
    
    let query = this.userModel.find(filter || {});
    
    if (orderBy) {
      const sortOrder = orderDirection === 'desc' ? -1 : 1;
      query = query.sort({ [orderBy]: sortOrder });
    }
    
    if (offset) {
      query = query.skip(offset);
    }
    
    if (limit) {
      query = query.limit(limit);
    }
    
    return await query.lean();
  }

  async count(filter?: Partial<User>): Promise<number> {
    return await this.userModel.countDocuments(filter || {});
  }

  async exists(id: string): Promise<boolean> {
    const user = await this.userModel.findById(id).select('_id').lean();
    return !!user;
  }

  async searchUsers(query: string, options?: QueryOptions): Promise<User[]> {
    const { limit, offset } = options || {};
    
    const searchFilter = {
      $or: [
        { email: { $regex: query, $options: 'i' } },
        { username: { $regex: query, $options: 'i' } },
        { firstName: { $regex: query, $options: 'i' } },
        { lastName: { $regex: query, $options: 'i' } },
        { fullName: { $regex: query, $options: 'i' } }
      ]
    };
    
    return await this.findAll({
      ...options,
      filter: searchFilter
    });
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { _id: userId },
      { $set: { password: hashedPassword } }
    );
    return result.modifiedCount > 0;
  }

  async updateEmailVerification(userId: string, verified: boolean): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { _id: userId },
      { $set: { isEmailVerified: verified } }
    );
    return result.modifiedCount > 0;
  }

  async updateLastLogin(userId: string): Promise<boolean> {
    const result = await this.userModel.updateOne(
      { _id: userId },
      { $set: { lastLoginAt: new Date() } }
    );
    return result.modifiedCount > 0;
  }

  async findActiveUsers(options?: QueryOptions): Promise<User[]> {
    return await this.findAll({
      ...options,
      filter: { ...options?.filter, isActive: true }
    });
  }

  async findUsersByRole(role: string, options?: QueryOptions): Promise<User[]> {
    return await this.findAll({
      ...options,
      filter: { ...options?.filter, role }
    });
  }

  async createMany(users: UserCreateInput[]): Promise<User[]> {
    const createdUsers = await this.userModel.insertMany(
      users.map(userData => ({
        ...userData,
        role: userData.role || 'user',
        isEmailVerified: false,
        isActive: true
      }))
    );
    
    return createdUsers.map(user => user.toObject());
  }

  async updateMany(filter: Partial<User>, updates: UserUpdateInput): Promise<number> {
    const result = await this.userModel.updateMany(
      filter,
      { $set: updates }
    );
    return result.modifiedCount;
  }

  async deleteMany(filter: Partial<User>): Promise<number> {
    const result = await this.userModel.deleteMany(filter);
    return result.deletedCount || 0;
  }
}
```

## Repository Factory

```typescript
// src/lib/database/factory/repository-factory.ts
import { DatabaseConfig, DatabaseType } from '../config/database.config';
import { UserRepository } from '../interfaces/user-repository.interface';
import { SessionRepository } from '../interfaces/session-repository.interface';
import { OAuthAccountRepository } from '../interfaces/oauth-repository.interface';

// PostgreSQL implementations
import { PostgreSQLUserRepository } from '../implementations/postgresql/user-repository';
import { PostgreSQLSessionRepository } from '../implementations/postgresql/session-repository';
import { PostgreSQLOAuthRepository } from '../implementations/postgresql/oauth-repository';

// MySQL implementations
import { MySQLUserRepository } from '../implementations/mysql/user-repository';
import { MySQLSessionRepository } from '../implementations/mysql/session-repository';
import { MySQLOAuthRepository } from '../implementations/mysql/oauth-repository';

// MongoDB implementations
import { MongoDBUserRepository } from '../implementations/mongodb/user-repository';
import { MongoDBSessionRepository } from '../implementations/mongodb/session-repository';
import { MongoDBOAuthRepository } from '../implementations/mongodb/oauth-repository';

export class RepositoryFactory {
  private static instance: RepositoryFactory;
  private userRepository: UserRepository;
  private sessionRepository: SessionRepository;
  private oauthRepository: OAuthAccountRepository;

  private constructor(private config: DatabaseConfig) {
    this.initializeRepositories();
  }

  public static getInstance(config: DatabaseConfig): RepositoryFactory {
    if (!RepositoryFactory.instance) {
      RepositoryFactory.instance = new RepositoryFactory(config);
    }
    return RepositoryFactory.instance;
  }

  private initializeRepositories(): void {
    switch (this.config.type) {
      case DatabaseType.POSTGRESQL:
        this.userRepository = new PostgreSQLUserRepository(this.config.client);
        this.sessionRepository = new PostgreSQLSessionRepository(this.config.client);
        this.oauthRepository = new PostgreSQLOAuthRepository(this.config.client);
        break;

      case DatabaseType.MYSQL:
        this.userRepository = new MySQLUserRepository(this.config.client);
        this.sessionRepository = new MySQLSessionRepository(this.config.client);
        this.oauthRepository = new MySQLOAuthRepository(this.config.client);
        break;

      case DatabaseType.MONGODB:
        this.userRepository = new MongoDBUserRepository();
        this.sessionRepository = new MongoDBSessionRepository();
        this.oauthRepository = new MongoDBOAuthRepository();
        break;

      default:
        throw new Error(`Unsupported database type: ${this.config.type}`);
    }
  }

  public getUserRepository(): UserRepository {
    return this.userRepository;
  }

  public getSessionRepository(): SessionRepository {
    return this.sessionRepository;
  }

  public getOAuthRepository(): OAuthAccountRepository {
    return this.oauthRepository;
  }

  public async testConnection(): Promise<boolean> {
    try {
      // Test basic operations
      await this.userRepository.count();
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  public async closeConnection(): Promise<void> {
    // Implementation depends on database type
    switch (this.config.type) {
      case DatabaseType.POSTGRESQL:
      case DatabaseType.MYSQL:
        await this.config.client.$disconnect();
        break;
      case DatabaseType.MONGODB:
        await this.config.client.disconnect();
        break;
    }
  }
}
```

## Database Configuration

```typescript
// src/lib/database/config/database.config.ts
export enum DatabaseType {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MONGODB = 'mongodb'
}

export interface DatabaseConfig {
  type: DatabaseType;
  client: any; // Database-specific client
  connectionString: string;
  options?: Record<string, any>;
}

export class DatabaseConfigBuilder {
  public static async build(): Promise<DatabaseConfig> {
    const databaseType = process.env.DATABASE_TYPE as DatabaseType || DatabaseType.POSTGRESQL;
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    switch (databaseType) {
      case DatabaseType.POSTGRESQL:
        const { PrismaClient } = await import('@prisma/client');
        return {
          type: databaseType,
          client: new PrismaClient(),
          connectionString,
          options: {
            provider: 'postgresql'
          }
        };

      case DatabaseType.MYSQL:
        const { PrismaClient: MySQLPrismaClient } = await import('@prisma/client');
        return {
          type: databaseType,
          client: new MySQLPrismaClient(),
          connectionString,
          options: {
            provider: 'mysql'
          }
        };

      case DatabaseType.MONGODB:
        const mongoose = await import('mongoose');
        await mongoose.connect(connectionString);
        return {
          type: databaseType,
          client: mongoose,
          connectionString,
          options: {
            provider: 'mongodb'
          }
        };

      default:
        throw new Error(`Unsupported database type: ${databaseType}`);
    }
  }
}
```

## Migration Strategy

### Schema Versioning

```typescript
// src/lib/database/migrations/migration-manager.ts
export interface Migration {
  version: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
}

export class MigrationManager {
  private migrations: Migration[] = [];

  constructor(private repositoryFactory: RepositoryFactory) {}

  public addMigration(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version.localeCompare(b.version));
  }

  public async runMigrations(): Promise<void> {
    for (const migration of this.migrations) {
      try {
        console.log(`Running migration: ${migration.version} - ${migration.description}`);
        await migration.up();
        console.log(`Migration completed: ${migration.version}`);
      } catch (error) {
        console.error(`Migration failed: ${migration.version}`, error);
        throw error;
      }
    }
  }

  public async rollbackMigration(version: string): Promise<void> {
    const migration = this.migrations.find(m => m.version === version);
    if (!migration) {
      throw new Error(`Migration not found: ${version}`);
    }

    try {
      console.log(`Rolling back migration: ${version}`);
      await migration.down();
      console.log(`Rollback completed: ${version}`);
    } catch (error) {
      console.error(`Rollback failed: ${version}`, error);
      throw error;
    }
  }
}
```

## Performance Optimization

### Connection Pooling

```typescript
// src/lib/database/config/connection-pool.ts
export interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
}

export class ConnectionPoolManager {
  private static pools: Map<string, any> = new Map();

  public static getPool(databaseType: DatabaseType, config: PoolConfig): any {
    const poolKey = `${databaseType}_pool`;
    
    if (!this.pools.has(poolKey)) {
      const pool = this.createPool(databaseType, config);
      this.pools.set(poolKey, pool);
    }
    
    return this.pools.get(poolKey);
  }

  private static createPool(databaseType: DatabaseType, config: PoolConfig): any {
    switch (databaseType) {
      case DatabaseType.POSTGRESQL:
      case DatabaseType.MYSQL:
        // Prisma handles connection pooling internally
        return null;
        
      case DatabaseType.MONGODB:
        // Mongoose handles connection pooling
        return null;
        
      default:
        throw new Error(`Unsupported database type for pooling: ${databaseType}`);
    }
  }
}
```

### Query Optimization

```typescript
// src/lib/database/utils/query-optimizer.ts
export class QueryOptimizer {
  public static optimizeQuery(query: any, databaseType: DatabaseType): any {
    switch (databaseType) {
      case DatabaseType.POSTGRESQL:
      case DatabaseType.MYSQL:
        return this.optimizeSQLQuery(query);
        
      case DatabaseType.MONGODB:
        return this.optimizeMongoQuery(query);
        
      default:
        return query;
    }
  }

  private static optimizeSQLQuery(query: any): any {
    // Add SQL-specific optimizations
    // - Index hints
    // - Query plan optimization
    // - Batch operations
    return query;
  }

  private static optimizeMongoQuery(query: any): any {
    // Add MongoDB-specific optimizations
    // - Index usage
    // - Aggregation pipeline optimization
    // - Projection optimization
    return query;
  }
}
```

## Testing Strategy

### Repository Testing

```typescript
// src/lib/database/__tests__/user-repository.test.ts
import { UserRepository } from '../interfaces/user-repository.interface';
import { PostgreSQLUserRepository } from '../implementations/postgresql/user-repository';
import { MongoDBUserRepository } from '../implementations/mongodb/user-repository';
import { UserCreateInput } from '../types/user.types';

describe('UserRepository', () => {
  let repository: UserRepository;
  
  // Test with different implementations
  const implementations = [
    { name: 'PostgreSQL', repo: PostgreSQLUserRepository },
    { name: 'MongoDB', repo: MongoDBUserRepository }
  ];

  implementations.forEach(({ name, repo }) => {
    describe(`${name} Implementation`, () => {
      beforeEach(() => {
        // Setup test database and repository
        repository = new repo(/* test client */);
      });

      afterEach(() => {
        // Cleanup test data
      });

      it('should create a user', async () => {
        const userData: UserCreateInput = {
          email: 'test@example.com',
          firstName: 'Test',
          lastName: 'User'
        };

        const user = await repository.create(userData);
        
        expect(user).toBeDefined();
        expect(user.email).toBe(userData.email);
        expect(user.id).toBeDefined();
      });

      it('should find user by email', async () => {
        const userData: UserCreateInput = {
          email: 'findme@example.com',
          firstName: 'Find',
          lastName: 'Me'
        };

        const createdUser = await repository.create(userData);
        const foundUser = await repository.findByEmail(userData.email);
        
        expect(foundUser).toBeDefined();
        expect(foundUser?.id).toBe(createdUser.id);
      });

      // Add more test cases...
    });
  });
});
```

## Error Handling

```typescript
// src/lib/database/errors/database-errors.ts
export class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, 'QUERY_ERROR', originalError);
    this.name = 'QueryError';
  }
}

export class ValidationError extends DatabaseError {
  constructor(message: string, originalError?: any) {
    super(message, 'VALIDATION_ERROR', originalError);
    this.name = 'ValidationError';
  }
}
```

## Usage Examples

### Basic Setup

```typescript
// src/lib/database/index.ts
import { DatabaseConfigBuilder } from './config/database.config';
import { RepositoryFactory } from './factory/repository-factory';

// Initialize database
export async function initializeDatabase() {
  try {
    const config = await DatabaseConfigBuilder.build();
    const repositoryFactory = RepositoryFactory.getInstance(config);
    
    // Test connection
    const isConnected = await repositoryFactory.testConnection();
    if (!isConnected) {
      throw new Error('Failed to connect to database');
    }
    
    console.log(`Connected to ${config.type} database`);
    return repositoryFactory;
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// Usage in application
export async function getUserService() {
  const repositoryFactory = await initializeDatabase();
  return repositoryFactory.getUserRepository();
}
```

### Service Layer Integration

```typescript
// src/services/user.service.ts
import { UserRepository } from '../lib/database/interfaces/user-repository.interface';
import { getUserService } from '../lib/database';

export class UserService {
  private userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  async registerUser(userData: UserCreateInput): Promise<User> {
    // Business logic validation
    const existingUser = await this.userRepository.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Create user
    return await this.userRepository.create(userData);
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return null;
    }

    // Verify password (implementation depends on hashing strategy)
    const isValidPassword = await this.verifyPassword(password, user.password);
    if (!isValidPassword) {
      return null;
    }

    // Update last login
    await this.userRepository.updateLastLogin(user.id);
    
    return user;
  }

  private async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    // Implementation depends on hashing library (bcrypt, argon2, etc.)
    return true; // Placeholder
  }
}

// Factory function
export async function createUserService(): Promise<UserService> {
  const userRepository = await getUserService();
  return new UserService(userRepository);
}
```

This database abstraction layer provides a robust, flexible, and maintainable foundation for the Next.js authentication template, supporting multiple database systems while maintaining consistency and type safety.