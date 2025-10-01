import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { DatabaseConnection, DatabaseConfig, DatabaseError } from '../types';
import { databaseConfig as databaseConfigManager } from '../config/database.config';

/**
 * Mongoose connection manager for MongoDB
 */
export class MongooseConnection implements DatabaseConnection {
  private connection: Connection | null = null;
  private config: DatabaseConfig;
  private connected: boolean = false;
  private connectionPromise: Promise<Connection> | null = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.setupEventHandlers();
  }

  /**
   * Establishes connection to MongoDB
   */
  async connect(): Promise<void> {
    try {
      if (this.connected && this.connection) {
        return;
      }

      // Prevent multiple connection attempts
      if (this.connectionPromise) {
        await this.connectionPromise;
        return;
      }

      this.connectionPromise = this.establishConnection();
      this.connection = await this.connectionPromise;
      this.connected = true;
      this.connectionPromise = null;

      console.log(`✅ Connected to MongoDB: ${this.config.database}`);
    } catch (error) {
      this.connectionPromise = null;
      this.handleConnectionError(error, 'connect');
    }
  }

  /**
   * Establishes the actual connection
   */
  private async establishConnection(): Promise<Connection> {
    const connectionString = this.buildConnectionString();
    const options = this.buildConnectionOptions();

    if (this.config.logging) {
      console.log(`Attempting to connect to MongoDB with connection string: ${connectionString}`);
    }

    await mongoose.connect(connectionString, options);
    return mongoose.connection;
  }

  /**
   * Builds MongoDB connection string
   */
  private buildConnectionString(): string {
    return databaseConfigManager.getConnectionString(this.config);
  }

  /**
   * Builds Mongoose connection options
   */
  private buildConnectionOptions(): ConnectOptions {
    const options: ConnectOptions = {
      maxPoolSize: this.config.pool?.max || 10,
      minPoolSize: this.config.pool?.min || 0,
      maxIdleTimeMS: this.config.pool?.idle || 30000,
      serverSelectionTimeoutMS: this.config.pool?.acquire || 60000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4, skip trying IPv6
      retryWrites: true,
      w: 'majority',
    };

    // Add SSL/TLS options if enabled
    if (this.config.ssl) {
      options.tls = true;
      if (this.config.sslCert) {
        options.tlsCertificateKeyFile = this.config.sslCert;
      }
      if (this.config.sslKey) {
        // Mongoose doesn't directly support tlsPrivatekeyFile in ConnectOptions
        // If sslKey is separate, it's often combined with sslCert into tlsCertificateKeyFile
        // For advanced scenarios, consider using mongoose.connection.setClientEncryption()
        // For simplicity, if a separate key is provided, we'll assume it's part of tlsCertificateKeyFile
        options.tlsCertificateKeyFile = this.config.sslKey; // Assuming combined cert/key or handled by driver
      }
      if (this.config.sslCA) {
        options.tlsCAFile = this.config.sslCA;
      }
    }

    return options;
  }

  /**
   * Disconnects from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connection && this.connected) {
        await mongoose.disconnect();
        this.connection = null;
        this.connected = false;
        console.log('🔌 Disconnected from MongoDB');
      }
    } catch (error) {
      this.handleConnectionError(error, 'disconnect');
    }
  }

  /**
   * Checks if connection is healthy
   */
  isHealthy(): boolean {
    return this.connected && 
           this.connection !== null && 
           this.connection.readyState === 1;
  }

  /**
   * Alias for isHealthy to match DatabaseConnection interface
   */
  isConnected(): boolean {
    return this.isHealthy();
  }

  /**
   * Gets the current connection
   */
  getConnection(): Connection {
    if (!this.connection || !this.connected) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }
    return this.connection;
  }

  /**
   * Executes a transaction (MongoDB sessions)
   */
  async executeTransaction<T>(callback: (session: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<T>): Promise<T> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }

    const session = await mongoose.startSession();
    
    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Alias for executeTransaction to match DatabaseConnection interface
   */
  async transaction<T>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<T>): Promise<T> {
    return this.executeTransaction(callback);
  }

  /**
   * Drops the database
   */
  async drop(): Promise<void> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }

    if (!this.connection.db) {
      throw new DatabaseError('Database connection not established', 'CONNECTION_ERROR');
    }

    try {
      await this.connection.db.dropDatabase();
      console.log(`🗑️ Successfully dropped database: ${this.config.database}`);
    } catch (error) {
      this.handleConnectionError(error, `drop database ${this.config.database}`);
    }
  }

  /**
   * Runs database migrations (MongoDB doesn't have traditional migrations)
   */
  async migrate(): Promise<void> {
    try {
      console.log(`📦 Running MongoDB setup for database: ${this.config.database}...`);
      
      // Ensure indexes are created
      await this.createIndexes();
      
      // Run any custom setup logic
      await this.setupCollections();
      
      console.log(`✅ MongoDB setup completed for database: ${this.config.database}`);
    } catch (error) {
      this.handleConnectionError(error, `migrate ${this.config.database}`);
    }
  }

  /**
   * Creates database indexes
   */
  private async createIndexes(): Promise<void> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }

    const db = this.connection.db;
    if (!db) {
      throw new DatabaseError('Database connection not established', 'CONNECTION_ERROR');
    }
    
    try {
      // Users collection indexes
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('users').createIndex({ isActive: 1 });
      await db.collection('users').createIndex({ createdAt: 1 });
      await db.collection('users').createIndex({ lastLoginAt: 1 });
      
      // Sessions collection indexes
      await db.collection('sessions').createIndex({ token: 1 }, { unique: true });
      await db.collection('sessions').createIndex({ userId: 1 });
      await db.collection('sessions').createIndex({ expiresAt: 1 });
      await db.collection('sessions').createIndex({ isActive: 1 });
      await db.collection('sessions').createIndex({ lastAccessedAt: 1 });
      
      // Social accounts collection indexes
      await db.collection('socialaccounts').createIndex(
        { provider: 1, providerId: 1 }, 
        { unique: true }
      );
      await db.collection('socialaccounts').createIndex({ userId: 1 });
      await db.collection('socialaccounts').createIndex({ provider: 1 });
      await db.collection('socialaccounts').createIndex({ isActive: 1 });
      
      // Password reset collection indexes
      await db.collection('passwordresets').createIndex({ token: 1 }, { unique: true });
      await db.collection('passwordresets').createIndex({ userId: 1 });
      await db.collection('passwordresets').createIndex({ expiresAt: 1 });
      await db.collection('passwordresets').createIndex({ isUsed: 1 });
      
      // Email verification collection indexes
      await db.collection('emailverifications').createIndex({ token: 1 }, { unique: true });
      await db.collection('emailverifications').createIndex({ userId: 1 });
      await db.collection('emailverifications').createIndex({ email: 1 });
      await db.collection('emailverifications').createIndex({ expiresAt: 1 });
      await db.collection('emailverifications').createIndex({ isVerified: 1 });
      
      // Audit logs collection indexes
      await db.collection('auditlogs').createIndex({ userId: 1 });
      await db.collection('auditlogs').createIndex({ action: 1 });
      await db.collection('auditlogs').createIndex({ timestamp: 1 });
      await db.collection('auditlogs').createIndex({ ipAddress: 1 });
      
      console.log('📊 Database indexes created successfully');
    } catch (error) {
      console.warn('⚠️ Some indexes may already exist:', error);
    }
  }

  /**
   * Sets up collections with validation rules
   */
  private async setupCollections(): Promise<void> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }

    const db = this.connection.db;
    if (!db) {
      throw new DatabaseError('Database connection not established', 'CONNECTION_ERROR');
    }
    
    try {
      // Create collections with validation if they don't exist
      const collections = await db.listCollections().toArray();
      const existingCollections = collections.map(c => c.name);
      
      // Users collection validation
      if (!existingCollections.includes('users')) {
        await db.createCollection('users', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['email', 'isActive', 'createdAt', 'updatedAt'],
              properties: {
                email: {
                  bsonType: 'string',
                  pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
                },
                isActive: { bsonType: 'bool' },
                isEmailVerified: { bsonType: 'bool' },
                createdAt: { bsonType: 'date' },
                updatedAt: { bsonType: 'date' }
              }
            }
          }
        });
      }
      
      // Sessions collection validation
      if (!existingCollections.includes('sessions')) {
        await db.createCollection('sessions', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['userId', 'token', 'expiresAt', 'isActive', 'createdAt'],
              properties: {
                userId: { bsonType: 'string' },
                token: { bsonType: 'string' },
                expiresAt: { bsonType: 'date' },
                isActive: { bsonType: 'bool' },
                createdAt: { bsonType: 'date' }
              }
            }
          }
        });
      }
      
      console.log('📋 Collection validation rules applied');
    } catch (error) {
      console.warn('⚠️ Collection setup warnings:', error);
    }
  }

  /**
   * Seeds initial data
   */
  async seed(): Promise<void> {
    try {
      console.log('🌱 Seeding MongoDB data...');
      
      // Add any initial data seeding logic here
      // For example, creating default admin user, roles, etc.
      
      console.log('✅ MongoDB seeding completed');
    } catch (error) {
      this.handleConnectionError(error, 'seed');
    }
  }

  /**
   * Performs health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection) {
        return false;
      }

      if (!this.connection.db) {
        return false;
      }

      // Ping the database
      await this.connection.db.admin().ping();
      
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Gets database statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
    }

    if (!this.connection.db) {
      throw new DatabaseError('Database connection not established', 'CONNECTION_ERROR');
    }

    try {
      const stats = await this.connection.db.stats();
      const serverStatus = await this.connection.db.admin().serverStatus();
      
      return {
        database: {
          name: this.config.database,
          collections: stats.collections,
          objects: stats.objects,
          dataSize: stats.dataSize,
          storageSize: stats.storageSize,
          indexSize: stats.indexSize
        },
        server: {
          version: serverStatus.version,
          uptime: serverStatus.uptime,
          connections: serverStatus.connections
        },
        connection: {
          readyState: this.connection.readyState,
          host: this.connection.host,
          port: this.connection.port,
          name: this.connection.name
        }
      };
    } catch (error) {
      this.handleConnectionError(error, 'get stats');
    }
  }

  /**
   * Sets up event handlers for connection
   */
  private setupEventHandlers(): void {
    mongoose.connection.on('connected', () => {
      console.log('🔗 Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (error) => {
      console.error('❌ Mongoose connection error:', error);
      this.connected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 Mongoose disconnected from MongoDB');
      this.connected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 Mongoose reconnected to MongoDB');
      this.connected = true;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.disconnect();
      process.exit(0);
    });
  }

  /**
   * Handles connection errors
   */
  private handleConnectionError(error: unknown, operation: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ MongoDB ${operation} error:`, errorMessage);
    
    // Reset connection state on error
    this.connected = false;
    this.connection = null;
    this.connectionPromise = null;
    
    throw new DatabaseError(
      `MongoDB ${operation} failed for database ${this.config.database}: ${errorMessage}`,
      'CONNECTION_ERROR',
      error
    );
  }

  /**
   * Cleans up resources
   */
  async cleanup(): Promise<void> {
    try {
      await this.disconnect();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}