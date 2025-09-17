import { DatabaseConfig, DatabaseProvider, DatabaseConnection } from '../types';
import { DatabaseFactory } from '../DatabaseFactory';
import fs from 'fs/promises';
import path from 'path';

/**
 * Migration interface
 */
export interface Migration {
  id: string;
  name: string;
  version: string;
  provider: DatabaseProvider | 'all';
  up: (connection: DatabaseConnection) => Promise<void>;
  down: (connection: DatabaseConnection) => Promise<void>;
  createdAt: Date;
}

/**
 * Migration record for tracking applied migrations
 */
export interface MigrationRecord {
  id: string;
  name: string;
  version: string;
  provider: DatabaseProvider;
  appliedAt: Date;
  checksum?: string;
}

/**
 * Migration manager for handling database schema changes
 */
export class MigrationManager {
  private config: DatabaseConfig;
  private connection: DatabaseConnection;
  private migrationsPath: string;
  private migrations: Migration[] = [];

  constructor(config: DatabaseConfig, migrationsPath?: string) {
    this.config = config;
    this.migrationsPath = migrationsPath || path.join(process.cwd(), 'src/lib/database/migrations/files');
  }

  /**
   * Initializes migration manager
   */
  async initialize(): Promise<void> {
    const factory = DatabaseFactory.getInstance();
    this.connection = await factory.createConnection(this.config);
    await this.ensureMigrationsTable();
    await this.loadMigrations();
  }

  /**
   * Runs pending migrations
   */
  async migrate(): Promise<MigrationRecord[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    const pendingMigrations = this.migrations
      .filter(m => !appliedIds.has(m.id))
      .filter(m => m.provider === 'all' || m.provider === this.config.provider)
      .sort((a, b) => a.version.localeCompare(b.version));

    const appliedRecords: MigrationRecord[] = [];

    for (const migration of pendingMigrations) {
      try {
        console.log(`Applying migration: ${migration.name} (${migration.id})`);
        
        await migration.up(this.connection);
        
        const record: MigrationRecord = {
          id: migration.id,
          name: migration.name,
          version: migration.version,
          provider: this.config.provider,
          appliedAt: new Date(),
          checksum: await this.calculateChecksum(migration)
        };
        
        await this.recordMigration(record);
        appliedRecords.push(record);
        
        console.log(`✓ Applied migration: ${migration.name}`);
      } catch (error) {
        console.error(`✗ Failed to apply migration: ${migration.name}`, error);
        throw error;
      }
    }

    return appliedRecords;
  }

  /**
   * Rolls back migrations
   */
  async rollback(steps: number = 1): Promise<MigrationRecord[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationsToRollback = appliedMigrations
      .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
      .slice(0, steps);

    const rolledBackRecords: MigrationRecord[] = [];

    for (const record of migrationsToRollback) {
      const migration = this.migrations.find(m => m.id === record.id);
      
      if (!migration) {
        console.warn(`Migration not found for rollback: ${record.name} (${record.id})`);
        continue;
      }

      try {
        console.log(`Rolling back migration: ${migration.name} (${migration.id})`);
        
        await migration.down(this.connection);
        await this.removeMigrationRecord(record.id);
        
        rolledBackRecords.push(record);
        
        console.log(`✓ Rolled back migration: ${migration.name}`);
      } catch (error) {
        console.error(`✗ Failed to rollback migration: ${migration.name}`, error);
        throw error;
      }
    }

    return rolledBackRecords;
  }

  /**
   * Gets migration status
   */
  async getStatus(): Promise<{
    applied: MigrationRecord[];
    pending: Migration[];
    total: number;
  }> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map(m => m.id));
    
    const pendingMigrations = this.migrations
      .filter(m => !appliedIds.has(m.id))
      .filter(m => m.provider === 'all' || m.provider === this.config.provider)
      .sort((a, b) => a.version.localeCompare(b.version));

    return {
      applied: appliedMigrations,
      pending: pendingMigrations,
      total: this.migrations.length
    };
  }

  /**
   * Creates a new migration file
   */
  async createMigration(name: string, provider: DatabaseProvider | 'all' = 'all'): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const id = `${timestamp}_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const filename = `${id}.ts`;
    const filepath = path.join(this.migrationsPath, filename);

    const template = this.getMigrationTemplate(id, name, provider);
    
    await fs.mkdir(this.migrationsPath, { recursive: true });
    await fs.writeFile(filepath, template);
    
    console.log(`Created migration: ${filepath}`);
    return filepath;
  }

  /**
   * Validates migration integrity
   */
  async validateMigrations(): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const appliedMigrations = await this.getAppliedMigrations();
    
    for (const record of appliedMigrations) {
      const migration = this.migrations.find(m => m.id === record.id);
      
      if (!migration) {
        issues.push(`Applied migration not found in files: ${record.name} (${record.id})`);
        continue;
      }
      
      if (record.checksum) {
        const currentChecksum = await this.calculateChecksum(migration);
        if (currentChecksum !== record.checksum) {
          issues.push(`Migration checksum mismatch: ${migration.name} (${migration.id})`);
        }
      }
    }
    
    // Check for duplicate IDs
    const ids = this.migrations.map(m => m.id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      issues.push(`Duplicate migration IDs found: ${duplicateIds.join(', ')}`);
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Loads migrations from files
   */
  private async loadMigrations(): Promise<void> {
    try {
      await fs.access(this.migrationsPath);
    } catch {
      // Migrations directory doesn't exist
      return;
    }

    const files = await fs.readdir(this.migrationsPath);
    const migrationFiles = files.filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    
    for (const file of migrationFiles) {
      try {
        const filepath = path.join(this.migrationsPath, file);
        const migration = await import(filepath);
        
        if (migration.default && typeof migration.default === 'object') {
          this.migrations.push(migration.default as Migration);
        }
      } catch (error) {
        console.warn(`Failed to load migration file: ${file}`, error);
      }
    }
  }

  /**
   * Ensures migrations table exists
   */
  private async ensureMigrationsTable(): Promise<void> {
    switch (this.config.provider) {
      case DatabaseProvider.POSTGRESQL:
        await this.connection.query(`
          CREATE TABLE IF NOT EXISTS migrations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            version VARCHAR(50) NOT NULL,
            provider VARCHAR(50) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            checksum VARCHAR(64)
          )
        `);
        break;
        
      case DatabaseProvider.MYSQL:
        await this.connection.query(`
          CREATE TABLE IF NOT EXISTS migrations (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            version VARCHAR(50) NOT NULL,
            provider VARCHAR(50) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            checksum VARCHAR(64)
          )
        `);
        break;
        
      case DatabaseProvider.MONGODB:
        // MongoDB collections are created automatically
        break;
    }
  }

  /**
   * Gets applied migrations from database
   */
  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    switch (this.config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        const results = await this.connection.query(
          'SELECT * FROM migrations WHERE provider = ? ORDER BY applied_at ASC',
          [this.config.provider]
        );
        return results.map((row: Record<string, unknown>) => ({
          id: row.id,
          name: row.name,
          version: row.version,
          provider: row.provider,
          appliedAt: new Date(row.applied_at),
          checksum: row.checksum
        }));
        
      case DatabaseProvider.MONGODB:
        const db = await this.connection.getDatabase();
        const collection = db.collection('migrations');
        const docs = await collection.find({ provider: this.config.provider }).sort({ appliedAt: 1 }).toArray();
        return docs.map(doc => ({
          id: doc.id,
          name: doc.name,
          version: doc.version,
          provider: doc.provider,
          appliedAt: doc.appliedAt,
          checksum: doc.checksum
        }));
        
      default:
        return [];
    }
  }

  /**
   * Records applied migration
   */
  private async recordMigration(record: MigrationRecord): Promise<void> {
    switch (this.config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        await this.connection.query(
          'INSERT INTO migrations (id, name, version, provider, applied_at, checksum) VALUES (?, ?, ?, ?, ?, ?)',
          [record.id, record.name, record.version, record.provider, record.appliedAt, record.checksum]
        );
        break;
        
      case DatabaseProvider.MONGODB:
        const db = await this.connection.getDatabase();
        const collection = db.collection('migrations');
        await collection.insertOne(record);
        break;
    }
  }

  /**
   * Removes migration record
   */
  private async removeMigrationRecord(id: string): Promise<void> {
    switch (this.config.provider) {
      case DatabaseProvider.POSTGRESQL:
      case DatabaseProvider.MYSQL:
        await this.connection.query('DELETE FROM migrations WHERE id = ?', [id]);
        break;
        
      case DatabaseProvider.MONGODB:
        const db = await this.connection.getDatabase();
        const collection = db.collection('migrations');
        await collection.deleteOne({ id });
        break;
    }
  }

  /**
   * Calculates migration checksum
   */
  private async calculateChecksum(migration: Migration): Promise<string> {
    const crypto = await import('crypto');
    const content = `${migration.id}${migration.name}${migration.up.toString()}${migration.down.toString()}`;
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Gets migration template
   */
  private getMigrationTemplate(id: string, name: string, provider: DatabaseProvider | 'all'): string {
    return `import { Migration, DatabaseConnection } from '../MigrationManager';
import { DatabaseProvider } from '../../types';

const migration: Migration = {
  id: '${id}',
  name: '${name}',
  version: '${id.split('_')[0]}',
  provider: '${provider}',
  createdAt: new Date('${new Date().toISOString()}'),
  
  async up(connection: DatabaseConnection): Promise<void> {
    // TODO: Implement migration up logic
    switch (connection.getProvider()) {
      case DatabaseProvider.POSTGRESQL:
        // PostgreSQL specific migration
        break;
        
      case DatabaseProvider.MYSQL:
        // MySQL specific migration
        break;
        
      case DatabaseProvider.MONGODB:
        // MongoDB specific migration
        break;
    }
  },
  
  async down(connection: DatabaseConnection): Promise<void> {
    // TODO: Implement migration down logic (rollback)
    switch (connection.getProvider()) {
      case DatabaseProvider.POSTGRESQL:
        // PostgreSQL specific rollback
        break;
        
      case DatabaseProvider.MYSQL:
        // MySQL specific rollback
        break;
        
      case DatabaseProvider.MONGODB:
        // MongoDB specific rollback
        break;
    }
  }
};

export default migration;
`;
  }
}

/**
 * Helper function to create migration manager
 */
export async function createMigrationManager(config?: DatabaseConfig, migrationsPath?: string): Promise<MigrationManager> {
  const dbConfig = config || DatabaseFactory.createConfigFromEnv();
  const manager = new MigrationManager(dbConfig, migrationsPath);
  await manager.initialize();
  return manager;
}

/**
 * Helper function to run migrations
 */
export async function runMigrations(config?: DatabaseConfig): Promise<MigrationRecord[]> {
  const manager = await createMigrationManager(config);
  return await manager.migrate();
}

/**
 * Helper function to rollback migrations
 */
export async function rollbackMigrations(steps: number = 1, config?: DatabaseConfig): Promise<MigrationRecord[]> {
  const manager = await createMigrationManager(config);
  return await manager.rollback(steps);
}

/**
 * Helper function to get migration status
 */
export async function getMigrationStatus(config?: DatabaseConfig) {
  const manager = await createMigrationManager(config);
  return await manager.getStatus();
}

/**
 * Helper function to create new migration
 */
export async function createMigration(name: string, provider: DatabaseProvider | 'all' = 'all', config?: DatabaseConfig): Promise<string> {
  const manager = await createMigrationManager(config);
  return await manager.createMigration(name, provider);
}