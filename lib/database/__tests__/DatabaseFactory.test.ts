import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { DatabaseFactory } from '../DatabaseFactory';
import { DatabaseProvider, DatabaseConfig } from '../types';
import { DatabasePresets } from '../config/database.config';

// Mock the database connections
jest.mock('../sequelize/SequelizeConnection');
jest.mock('../mongoose/MongooseConnection');

// Import the mocked classes
import { SequelizeConnection } from '../sequelize/SequelizeConnection';
import { MongooseConnection } from '../mongoose/MongooseConnection';

// Create mock implementations
const mockSequelizeConnection = SequelizeConnection as jest.MockedClass<typeof SequelizeConnection>;
const mockMongooseConnection = MongooseConnection as jest.MockedClass<typeof MongooseConnection>;

// Setup default mock implementations
mockSequelizeConnection.mockImplementation(() => ({
  connect: jest.fn(() => Promise.resolve()),
  disconnect: jest.fn(() => Promise.resolve()),
  isConnected: jest.fn(() => true),
  getConnection: jest.fn(() => ({})),
  transaction: jest.fn((callback: any) => callback({})),
  migrate: jest.fn(() => Promise.resolve()),
  seed: jest.fn(() => Promise.resolve()),
  drop: jest.fn(() => Promise.resolve()),
  healthCheck: jest.fn(() => Promise.resolve(true)),
  getStats: jest.fn(() => Promise.resolve({}))
} as any));

mockMongooseConnection.mockImplementation(() => ({
  connect: jest.fn(() => Promise.resolve()),
  disconnect: jest.fn(() => Promise.resolve()),
  isConnected: jest.fn(() => true),
  getConnection: jest.fn(() => ({})),
  transaction: jest.fn((callback: any) => callback({})),
  migrate: jest.fn(() => Promise.resolve()),
  seed: jest.fn(() => Promise.resolve()),
  drop: jest.fn(() => Promise.resolve()),
  healthCheck: jest.fn(() => Promise.resolve(true)),
  getStats: jest.fn(() => Promise.resolve({}))
 } as any));

describe('DatabaseFactory', () => {
  let factory: DatabaseFactory;
  
  beforeEach(() => {
    // Reset singleton instance
    (DatabaseFactory as unknown as { instance: DatabaseFactory | null }).instance = null;
    factory = DatabaseFactory.getInstance();
  });
  
  afterEach(async () => {
    await factory.disconnect();
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const factory1 = DatabaseFactory.getInstance();
      const factory2 = DatabaseFactory.getInstance();
      expect(factory1).toBe(factory2);
    });
  });

  describe('Configuration', () => {
    it('should initialize with PostgreSQL configuration', async () => {
      const config = DatabasePresets.development.postgresql;
      await factory.initialize(config);
      
      expect(factory.getProvider()).toBe(DatabaseProvider.POSTGRESQL);
      expect(factory.isConnected()).toBe(true);
    });

    it('should initialize with MySQL configuration', async () => {
      const config = DatabasePresets.development.mysql;
      await factory.initialize(config);
      
      expect(factory.getProvider()).toBe(DatabaseProvider.MYSQL);
      expect(factory.isConnected()).toBe(true);
    });

    it('should initialize with MongoDB configuration', async () => {
      const config = DatabasePresets.development.mongodb;
      await factory.initialize(config);
      
      expect(factory.getProvider()).toBe(DatabaseProvider.MONGODB);
      expect(factory.isConnected()).toBe(true);
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = {
        provider: 'invalid' as DatabaseProvider,
        host: 'localhost'
      } as DatabaseConfig;
      
      await expect(factory.initialize(invalidConfig)).rejects.toThrow();
    });
  });

  describe('Repository Creation', () => {
    beforeEach(async () => {
      await factory.initialize(DatabasePresets.development.postgresql);
    });

    it('should create user repository', () => {
      const userRepo = factory.getUserRepository();
      expect(userRepo).toBeDefined();
      expect(typeof userRepo.create).toBe('function');
      expect(typeof userRepo.findById).toBe('function');
    });

    it('should create session repository', () => {
      const sessionRepo = factory.getSessionRepository();
      expect(sessionRepo).toBeDefined();
      expect(typeof sessionRepo.create).toBe('function');
      expect(typeof sessionRepo.findByToken).toBe('function');
    });

    it('should create social account repository', () => {
      const socialRepo = factory.getSocialAccountRepository();
      expect(socialRepo).toBeDefined();
      expect(typeof socialRepo.create).toBe('function');
      expect(typeof socialRepo.findByProvider).toBe('function');
    });

    it('should return same repository instances', () => {
      const userRepo1 = factory.getUserRepository();
      const userRepo2 = factory.getUserRepository();
      expect(userRepo1).toBe(userRepo2);
    });
  });

  describe('Connection Management', () => {
    it('should connect and disconnect properly', async () => {
      const config = DatabasePresets.development.postgresql;
      
      expect(factory.isConnected()).toBe(false);
      
      await factory.initialize(config);
      expect(factory.isConnected()).toBe(true);
      
      await factory.disconnect();
      expect(factory.isConnected()).toBe(false);
    });

    it('should handle reconnection', async () => {
      const config = DatabasePresets.development.postgresql;
      
      await factory.initialize(config);
      await factory.disconnect();
      await factory.reconnect();
      
      expect(factory.isConnected()).toBe(true);
    });
  });

  describe('Health Checks', () => {
    beforeEach(async () => {
      await factory.initialize(DatabasePresets.development.postgresql);
    });

    it('should perform health check', async () => {
      const health = await factory.healthCheck();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('provider');
      expect(health).toHaveProperty('timestamp');
    });

    it('should return healthy status when connected', async () => {
      const health = await factory.healthCheck();
      expect(health.status).toBe('healthy');
    });
  });

  describe('Migrations', () => {
    beforeEach(async () => {
      await factory.initialize(DatabasePresets.development.postgresql);
    });

    it('should run migrations', async () => {
      await expect(factory.migrate()).resolves.not.toThrow();
    });

    it('should rollback migrations', async () => {
      await expect(factory.rollback()).resolves.not.toThrow();
    });

    it('should seed database', async () => {
      await expect(factory.seed()).resolves.not.toThrow();
    });
  });

  describe('Transaction Management', () => {
    beforeEach(async () => {
      await factory.initialize(DatabasePresets.development.postgresql);
    });

    it('should execute transaction successfully', async () => {
      const result = await factory.transaction(async () => {
        // Mock transaction operations
        return { success: true };
      });
      
      expect(result).toEqual({ success: true });
    });

    it('should rollback transaction on error', async () => {
      await expect(
        factory.transaction(async () => {
          throw new Error('Transaction error');
        })
      ).rejects.toThrow('Transaction error');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when accessing repositories without initialization', () => {
      const uninitializedFactory = new (DatabaseFactory as unknown as new () => DatabaseFactory)();
      
      expect(() => uninitializedFactory.getUserRepository()).toThrow(
        'Database not initialized'
      );
    });

    it('should handle connection errors gracefully', async () => {
      const invalidConfig = {
        ...DatabasePresets.development.postgresql,
        host: 'invalid-host',
        port: 99999
      };
      
      // Mock the connection to throw an error for invalid config
      mockSequelizeConnection.mockImplementationOnce(() => ({
        connect: jest.fn(() => Promise.reject(new Error('Connection failed'))),
        disconnect: jest.fn(() => Promise.resolve()),
        isConnected: jest.fn(() => false),
        getConnection: jest.fn(() => null),
        transaction: jest.fn((callback: any) => callback({})),
        migrate: jest.fn(() => Promise.resolve()),
        seed: jest.fn(() => Promise.resolve()),
        drop: jest.fn(() => Promise.resolve()),
        healthCheck: jest.fn(() => Promise.resolve(false)),
        getStats: jest.fn(() => Promise.resolve({}))
      } as any));
      
      await expect(factory.initialize(invalidConfig)).rejects.toThrow('Connection failed');
    });
  });

  describe('Provider Switching', () => {
    it('should switch from PostgreSQL to MongoDB', async () => {
      // Initialize with PostgreSQL
      await factory.initialize(DatabasePresets.development.postgresql);
      expect(factory.getProvider()).toBe(DatabaseProvider.POSTGRESQL);
      
      // Switch to MongoDB
      await factory.initialize(DatabasePresets.development.mongodb);
      expect(factory.getProvider()).toBe(DatabaseProvider.MONGODB);
    });

    it('should recreate repositories after provider switch', async () => {
      // Initialize with PostgreSQL
      await factory.initialize(DatabasePresets.development.postgresql);
      const pgUserRepo = factory.getUserRepository();
      
      // Switch to MongoDB
      await factory.initialize(DatabasePresets.development.mongodb);
      const mongoUserRepo = factory.getUserRepository();
      
      expect(pgUserRepo).not.toBe(mongoUserRepo);
    });
  });

  describe('Configuration Validation', () => {
    it('should validate required fields for PostgreSQL', async () => {
      const invalidConfig = {
        provider: DatabaseProvider.POSTGRESQL,
        // Missing required fields
      } as DatabaseConfig;
      
      await expect(factory.initialize(invalidConfig)).rejects.toThrow();
    });

    it('should validate required fields for MongoDB', async () => {
      const invalidConfig = {
        provider: DatabaseProvider.MONGODB,
        // Missing required fields
      } as DatabaseConfig;
      
      await expect(factory.initialize(invalidConfig)).rejects.toThrow();
    });
  });

  describe('Connection Pooling', () => {
    it('should respect pool configuration', async () => {
      const config = {
        ...DatabasePresets.development.postgresql,
        pool: {
          min: 2,
          max: 10,
          idle: 30000,
          acquire: 60000,
          evict: 1000
        }
      };
      
      await factory.initialize(config);
      expect(factory.isConnected()).toBe(true);
    });
  });

  describe('Environment-specific Configuration', () => {
    it('should work with test configuration', async () => {
      await factory.initialize(DatabasePresets.test.postgresql);
      expect(factory.getProvider()).toBe(DatabaseProvider.POSTGRESQL);
    });

    it('should handle SSL configuration', async () => {
      const sslConfig = {
        ...DatabasePresets.development.postgresql,
        ssl: true
      };
      
      await factory.initialize(sslConfig);
      expect(factory.isConnected()).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on disconnect', async () => {
      await factory.initialize(DatabasePresets.development.postgresql);
      
      const userRepo = factory.getUserRepository();
      expect(userRepo).toBeDefined();
      
      await factory.disconnect();
      
      // Repositories should be cleared
      expect(() => factory.getUserRepository()).toThrow();
    });
  });
});