import mongoose, { Connection, ConnectOptions } from 'mongoose';
import { DatabaseConnection, DatabaseConfig, DatabaseError } from '../types';

/**
 * Mongoose connection manager for MongoDB
 */
export class MongooseConnection implements DatabaseConnection {
  private connection: Connection | null = null;
  private config: DatabaseConfig;
  private isConnected: boolean = false;
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
      if (this.isConnected && this.connection) {
        return;
      }

      // Prevent multiple connection attempts
      if (this.connectionPromise) {
        await this.connectionPromise;
        return;
      }

      this.connectionPromise = this.establishConnection();
      this.connection = await this.connectionPromise;
      this.isConnected = true;
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

    await mongoose.connect(connectionString, options);
    return mongoose.connection;
  }

  /**
   * Builds MongoDB connection string
   */
  private buildConnectionString(): string {
    const { host, port, database, username, password, ssl, options } = this.config;
    
    let connectionString = 'mongodb';
    
    // Add SSL prefix if enabled
    if (ssl) {
      connectionString += '+srv';
    }
    
    connectionString += '://';
    
    // Add authentication if provided
    if (username && password) {
      connectionString += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
    }
    
    // Add host and port
    connectionString += host;
    if (port && !ssl) {
      connectionString += `:${port}`;
    }
    
    // Add database name
    connectionString += `/${database}`;
    
    // Add additional options
    if (options && Object.keys(options).length > 0) {
      const params = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        params.append(key, String(value));
      });
      connectionString += `?${params.toString()}`;
    }
    
    return connectionString;
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

    // Add SSL options if enabled
    if (this.config.ssl) {
      options.ssl = true;
      if (this.config.sslCert) {
        options.sslCert = this.config.sslCert;
      }
      if (this.config.sslKey) {
        options.sslKey = this.config.sslKey;
      }
      if (this.config.sslCA) {
        options.sslCA = this.config.sslCA;
      }
    }

    return options;
  }

  /**
   * Disconnects from MongoDB
   */
  async disconnect(): Promise<void> {
    try {
      if (this.connection && this.isConnected) {
        await mongoose.disconnect();
        this.connection = null;
        this.isConnected = false;
        console.log('🔌 Disconnected from MongoDB');
      }
    } catch (error) {
      this.handleConnectionError(error, 'disconnect');
    }
  }

  /**
   * Checks if connected to database
   */
  isHealthy(): boolean {
    return this.isConnected && 
           this.connection !== null && 
           this.connection.readyState === 1;
  }

  /**
   * Gets the current connection
   */
  getConnection(): Connection {
    if (!this.connection || !this.isConnected) {
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
   * Runs database migrations (MongoDB doesn't have traditional migrations)
   */
  async migrate(): Promise<void> {
    try {
      console.log('📦 Running MongoDB setup...');
      
      // Ensure indexes are created
      await this.createIndexes();
      
      // Run any custom setup logic
      await this.setupCollections();
      
      console.log('✅ MongoDB setup completed');
    } catch (error) {
      this.handleConnectionError(error, 'migrate');
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
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, unknown>;
  }> {
    try {
      if (!this.connection) {
        return {
          status: 'unhealthy',
          details: {
            error: 'No database connection',
            connected: false
          }
        };
      }

      // Ping the database
      await this.connection.db.admin().ping();
      
      // Get connection stats
      const stats = await this.connection.db.stats();
      
      return {
        status: 'healthy',
        details: {
          connected: this.isConnected,
          readyState: this.connection.readyState,
          database: this.config.database,
          host: this.config.host,
          collections: stats.collections,
          dataSize: stats.dataSize,
          indexSize: stats.indexSize
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          connected: this.isConnected
        }
      };
    }
  }

  /**
   * Gets database statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.connection) {
      throw new DatabaseError('No active database connection', 'CONNECTION_ERROR');
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
      this.isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('🔌 Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 Mongoose reconnected to MongoDB');
      this.isConnected = true;
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
    const message = error instanceof Error ? error.message : 'Unknown database error';
    console.error(`❌ MongoDB ${operation} error:`, message);
    
    // Reset connection state on error
    this.isConnected = false;
    this.connection = null;
    this.connectionPromise = null;
    
    throw new DatabaseError(
      `MongoDB ${operation} failed: ${message}`,
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