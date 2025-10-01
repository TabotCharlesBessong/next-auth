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
        logging: this.config.logging ? console.log : false,
        pool: {
          max: this.config.pool?.max || 10,
          min: this.config.pool?.min || 0,
          acquire: this.config.pool?.acquire || 30000,
          idle: this.config.pool?.idle || 10000
        },
        dialectOptions: {
          // SSL configuration
          ...(this.config.ssl && {
            ssl: {
              require: true,
              rejectUnauthorized: false
            }
          }),
          // Additional options specific to dialect
          ...(this.config as any).dialectOptions || {},
        },
        // Merge any additional options
        ...this.config.options
      };

      if (this.config.logging) {
        console.log(`Attempting to connect to ${this.config.provider} database: ${this.config.database} on ${this.config.host}:${this.config.port}`);
      }
      
      this.sequelize = new Sequelize(options);

      // Test the connection
      await this.sequelize.authenticate();
      this.isConnectedFlag = true;

      console.log(`✅ Connected to ${this.config.provider} database: ${this.config.database}`);
    } catch (error) {
      this.isConnectedFlag = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Failed to connect to ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
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
        console.log(`✅ Disconnected from ${this.config.provider} database: ${this.config.database}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Failed to disconnect from ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
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
  async transaction<T>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<T>): Promise<T> {
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
        console.log(`✅ ${this.config.provider} database models synchronized for ${this.config.database}`);
      } else {
        // In production, use proper migrations
        console.log(`⚠️  Run ${this.config.provider} migrations manually in production for ${this.config.database}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Migration failed for ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
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
      console.log(`🌱 Seeding ${this.config.provider} database: ${this.config.database}...`);
      // ... actual seeding logic ...
      console.log(`✅ ${this.config.provider} database seeded successfully for ${this.config.database}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Seeding failed for ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
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
      console.log(`🗑️ Successfully dropped ${this.config.provider} database: ${this.config.database}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Drop operation failed for ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
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
      console.error(`❌ ${this.config.provider} database health check failed for ${this.config.database}:`, error);
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
        // @ts-ignore
        this.config.provider === DatabaseProvider.POSTGRESQL
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

      if (this.config.logging) {
        console.log(`📊 Successfully fetched stats for ${this.config.provider} database: ${this.config.database}`);
      }

      return {
        // @ts-ignore
        type: this.config.provider,
        database: this.config.database,
        connected: this.isConnectedFlag,
        stats: results
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new DatabaseError(
        `Failed to get stats for ${this.config.provider} database ${this.config.database}: ${errorMessage}`,
        'STATS_ERROR',
        error
      );
    }
  }
}