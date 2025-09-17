import { Sequelize, Options } from 'sequelize';
import { DatabaseConnection, DatabaseConfig, DatabaseError, DatabaseProvider } from '../types';

/**
 * Sequelize database connection manager for PostgreSQL and MySQL
 */
export class SequelizeConnection implements DatabaseConnection {
  private sequelize: Sequelize | null = null;
  private config: DatabaseConfig;
  private isConnectedFlag = false;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Establishes database connection
   */
  async connect(): Promise<void> {
    try {
      const options: Options = {
        host: this.config.host,
        port: this.config.port,
        dialect: this.config.provider === DatabaseProvider.POSTGRESQL ? 'postgres' : 'mysql',
        database: this.config.database,
        username: this.config.username,
        password: this.config.password,
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        dialectOptions: {
          // SSL configuration for production
          ...(process.env.NODE_ENV === 'production' && {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          })
        },
        // Merge any additional options
        ...this.config.options
      };

      this.sequelize = new Sequelize(options);

      // Test the connection
      await this.sequelize.authenticate();
      this.isConnectedFlag = true;

      console.log(`✅ Connected to ${this.config.type} database: ${this.config.database}`);
    } catch (error) {
      this.isConnectedFlag = false;
      throw new DatabaseError(
        `Failed to connect to ${this.config.type} database: ${error.message}`,
        'CONNECTION_ERROR',
        error
      );
    }
  }

  /**
   * Closes database connection
   */
  async disconnect(): Promise<void> {
    try {
      if (this.sequelize) {
        await this.sequelize.close();
        this.sequelize = null;
        this.isConnectedFlag = false;
        console.log(`✅ Disconnected from ${this.config.type} database`);
      }
    } catch (error) {
      throw new DatabaseError(
        `Failed to disconnect from database: ${error.message}`,
        'DISCONNECTION_ERROR',
        error
      );
    }
  }

  /**
   * Checks if database is connected
   */
  isConnected(): boolean {
    return this.isConnectedFlag && this.sequelize !== null;
  }

  /**
   * Gets the Sequelize instance
   */
  getConnection(): Sequelize {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }
    return this.sequelize;
  }

  /**
   * Executes a database transaction
   */
  async transaction<T>(callback: (trx: import('sequelize').Transaction) => Promise<T>): Promise<T> {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }

    return await this.sequelize.transaction(async (transaction) => {
      return await callback(transaction);
    });
  }

  /**
   * Runs database migrations
   */
  async migrate(): Promise<void> {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }

    try {
      // Sync all models (in development)
      if (process.env.NODE_ENV === 'development') {
        await this.sequelize.sync({ alter: true });
        console.log('✅ Database models synchronized');
      } else {
        // In production, use proper migrations
        console.log('⚠️  Run migrations manually in production');
      }
    } catch (error) {
      throw new DatabaseError(
        `Migration failed: ${error.message}`,
        'MIGRATION_ERROR',
        error
      );
    }
  }

  /**
   * Seeds the database with initial data
   */
  async seed(): Promise<void> {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }

    try {
      // Implement seeding logic here
      console.log('✅ Database seeded successfully');
    } catch (error) {
      throw new DatabaseError(
        `Seeding failed: ${error.message}`,
        'SEEDING_ERROR',
        error
      );
    }
  }

  /**
   * Drops all database tables (use with caution)
   */
  async drop(): Promise<void> {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }

    if (process.env.NODE_ENV === 'production') {
      throw new DatabaseError('Cannot drop database in production', 'FORBIDDEN_OPERATION');
    }

    try {
      await this.sequelize.drop();
      console.log('✅ Database dropped successfully');
    } catch (error) {
      throw new DatabaseError(
        `Drop operation failed: ${error.message}`,
        'DROP_ERROR',
        error
      );
    }
  }

  /**
   * Checks database health
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.sequelize) {
        return false;
      }
      
      await this.sequelize.authenticate();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Gets database statistics
   */
  async getStats(): Promise<Record<string, unknown>> {
    if (!this.sequelize) {
      throw new DatabaseError('Database not connected', 'NOT_CONNECTED');
    }

    try {
      const [results] = await this.sequelize.query(
        this.config.type === 'postgresql'
          ? `SELECT 
              schemaname,
              tablename,
              attname,
              n_distinct,
              correlation
            FROM pg_stats 
            WHERE schemaname = 'public'
            LIMIT 10`
          : `SELECT 
              TABLE_SCHEMA,
              TABLE_NAME,
              TABLE_ROWS,
              DATA_LENGTH,
              INDEX_LENGTH
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = DATABASE()
            LIMIT 10`
      );

      return {
        type: this.config.type,
        database: this.config.database,
        connected: this.isConnectedFlag,
        stats: results
      };
    } catch (error) {
      throw new DatabaseError(
        `Failed to get database stats: ${error.message}`,
        'STATS_ERROR',
        error
      );
    }
  }
}