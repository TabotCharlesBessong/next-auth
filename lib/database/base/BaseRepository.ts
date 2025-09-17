import { BaseRepository, QueryOptions, WhereClause, CreateOptions, UpdateOptions, DeleteOptions, DatabaseError, NotFoundError } from '../types';

/**
 * Abstract base repository class that provides common functionality
 * for all database implementations
 */
export abstract class AbstractBaseRepository<T> implements BaseRepository<T> {
  protected tableName: string;
  protected connection: unknown;

  constructor(tableName: string, connection: unknown) {
    this.tableName = tableName;
    this.connection = connection;
  }

  // Abstract methods that must be implemented by concrete repositories
  abstract create(data: Partial<T>, options?: CreateOptions): Promise<T>;
  abstract findById(id: string, options?: QueryOptions): Promise<T | null>;
  abstract findOne(where: WhereClause, options?: QueryOptions): Promise<T | null>;
  abstract findMany(where?: WhereClause, options?: QueryOptions): Promise<T[]>;
  abstract update(id: string, data: Partial<T>, options?: UpdateOptions): Promise<T | null>;
  abstract updateMany(data: Partial<T>, options: UpdateOptions): Promise<number>;
  abstract delete(id: string, options?: DeleteOptions): Promise<boolean>;
  abstract deleteMany(options: DeleteOptions): Promise<number>;
  abstract count(where?: WhereClause): Promise<number>;
  abstract exists(where: WhereClause): Promise<boolean>;

  /**
   * Validates required fields in data object
   */
  protected validateRequiredFields(data: Partial<T>, requiredFields: string[]): void {
    const missingFields = requiredFields.filter(field => !(field in data) || data[field as keyof T] === undefined);
    
    if (missingFields.length > 0) {
      throw new DatabaseError(`Missing required fields: ${missingFields.join(', ')}`);
    }
  }

  /**
   * Sanitizes data by removing undefined values and null values if specified
   */
  protected sanitizeData(data: Partial<T>, removeNull = false): Partial<T> {
    const sanitized: Partial<T> = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && (!removeNull || value !== null)) {
        (sanitized as Record<string, unknown>)[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Builds order clause from query options
   */
  protected buildOrderClause(options?: QueryOptions): string {
    if (!options?.orderBy) {
      return 'created_at DESC';
    }
    
    const direction = options.orderDirection || 'ASC';
    return `${options.orderBy} ${direction}`;
  }

  /**
   * Builds limit and offset clause from query options
   */
  protected buildLimitClause(options?: QueryOptions): { limit?: number; offset?: number } {
    return {
      limit: options?.limit,
      offset: options?.offset
    };
  }

  /**
   * Converts database row to entity object
   */
  protected mapRowToEntity(row: Record<string, unknown>): T {
    if (!row) return row as T;
    
    // Convert snake_case to camelCase for JavaScript conventions
    const entity: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(row)) {
      const camelKey = this.snakeToCamel(key);
      entity[camelKey] = value;
    }
    
    return entity as T;
  }

  /**
   * Converts entity object to database row format
   */
  protected mapEntityToRow(entity: Partial<T>): Record<string, unknown> {
    const row: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(entity)) {
      const snakeKey = this.camelToSnake(key);
      row[snakeKey] = value;
    }
    
    return row;
  }

  /**
   * Converts snake_case to camelCase
   */
  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Converts camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Handles database errors and converts them to appropriate error types
   */
  protected handleDatabaseError(error: unknown, operation: string): never {
    console.error(`Database error during ${operation}:`, error);
    
    // Handle specific database errors
    const errorWithCode = error as { code?: string | number };
    if (errorWithCode.code === '23505' || errorWithCode.code === 'ER_DUP_ENTRY' || errorWithCode.code === 11000) {
      throw new DatabaseError('Duplicate entry', 'DUPLICATE_ENTRY', error);
    }
    
    if (errorWithCode.code === '23503' || errorWithCode.code === 'ER_NO_REFERENCED_ROW_2') {
      throw new DatabaseError('Foreign key constraint violation', 'FOREIGN_KEY_VIOLATION', error);
    }
    
    if (errorWithCode.code === '23502' || errorWithCode.code === 'ER_BAD_NULL_ERROR') {
      throw new DatabaseError('Not null constraint violation', 'NOT_NULL_VIOLATION', error);
    }
    
    // Generic database error
    const errorWithMessage = error as { message?: string; code?: string | number };
    throw new DatabaseError(
      errorWithMessage.message || `Database error during ${operation}`,
      errorWithMessage.code?.toString(),
      error
    );
  }

  /**
   * Ensures entity exists or throws NotFoundError
   */
  protected async ensureExists(id: string): Promise<T> {
    const entity = await this.findById(id);
    
    if (!entity) {
      throw new NotFoundError(this.tableName, id);
    }
    
    return entity;
  }

  /**
   * Generates a UUID v4
   */
  protected generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Gets current timestamp
   */
  protected getCurrentTimestamp(): Date {
    return new Date();
  }

  /**
   * Validates email format
   */
  protected validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validates UUID format
   */
  protected validateUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  /**
   * Builds where clause for different database types
   */
  protected abstract buildWhereClause(where: WhereClause): unknown;

  /**
   * Executes a transaction
   */
  protected abstract executeTransaction<R>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<R>): Promise<R>;
}