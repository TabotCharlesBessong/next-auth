import { Op, Transaction, WhereOptions } from 'sequelize';
import { BaseRepository, Session, SessionRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { SessionModel } from '../models';
import { AbstractBaseRepository } from '../../base/AbstractBaseRepository';

/**
 * Sequelize implementation of SessionRepository
 */
export class SequelizeSessionRepository extends AbstractBaseRepository<Session> implements SessionRepository {
  protected model: typeof SessionModel; // Explicitly define model type

  constructor(sessionModel: typeof SessionModel) {
    super(sessionModel);
    this.model = sessionModel;
  }

  /**
   * Creates a new session
   */
  async create(data: Partial<Session>): Promise<Session> {
    try {
      // Validate required fields
      this.validateRequiredFields(data, ['userId', 'token']);
      
      // Validate token format
      if (data.token && !this.validateToken(data.token)) {
        throw new ValidationError('Invalid token format', 'token', data.token);
      }

      // Sanitize data
      const sanitizedData = this.sanitizeData(data);
      
      // Add timestamps and defaults
      const now = this.getCurrentTimestamp();
      const sessionData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isActive: sanitizedData.isActive ?? true,
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
      } as Session;

      const session = await this.model.create(sessionData);
      return this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>);
    } catch (error) {
      this.handleDatabaseError(error, 'create session');
    }
  }

  /**
   * Finds session by ID
   */
  async findById(id: string, options?: QueryOptions): Promise<Session | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const session = await this.model.findByPk(id, {
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
      });

      return session ? this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find session by id');
    }
  }

  /**
   * Finds session by token
   */
  async findByToken(token: string): Promise<Session | null> {
    try {
      if (!this.validateToken(token)) {
        return null;
      }

      const session = await this.model.findOne({
        where: { 
          token,
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        include: [{ association: 'user' }],
      });

      if (session) {
        // Update last accessed timestamp
        await this.updateLastAccessed(session.id);
        return this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>);
      }

      return null;
    } catch (error) {
      this.handleDatabaseError(error, 'find session by token');
    }
  }

  /**
   * Finds active sessions for a user
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<Session[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }

      const { limit, offset } = this.buildLimitClause(options);
      
      const sessions = await this.model.findAll({
        where: {
          userId,
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [['lastAccessedAt', 'DESC']],
        limit,
        offset,
      });

      return sessions.map(session => this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find sessions by user id');
    }
  }

  /**
   * Finds active sessions for a user (required by SessionRepository interface)
   */
  async findActiveByUserId(userId: string): Promise<Session[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }
      
      const sessions = await this.model.findAll({
        where: {
          userId,
          isActive: true,
          expiresAt: { [Op.gt]: new Date() }
        },
        order: [['lastAccessedAt', 'DESC']],
      });

      return sessions.map(session => this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find active sessions by user id');
    }
  }

  /**
   * Invalidates all sessions for a user (required by SessionRepository interface)
   */
  async invalidateUserSessions(userId: string): Promise<void> {
    try {
      await this.model.update(
        {
          isActive: false,
          updatedAt: this.getCurrentTimestamp()
        },
        { 
          where: {
            userId,
            isActive: true
          }
        }
      );
    } catch (error) {
      this.handleDatabaseError(error, 'invalidate user sessions');
    }
  }

  /**
   * Cleans up expired sessions (required by SessionRepository interface)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const affectedRows = await this.model.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: new Date() } },
            { isActive: false }
          ]
        }
      });
      
      return affectedRows;
    } catch (error) {
      this.handleDatabaseError(error, 'cleanup expired sessions');
    }
  }

  /**
   * Finds one session matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<Session | null> {
    try {
      const session = await this.model.findOne({
        where: this.buildWhereClause(where),
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
      });

      return session ? this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one session');
    }
  }

  /**
   * Finds multiple sessions matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<Session[]> {
    try {
      const { limit, offset } = this.buildLimitClause(options);
      
      const sessions = await this.model.findAll({
        where: where ? this.buildWhereClause(where) : undefined,
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
        limit,
        offset,
      });

      return sessions.map(session => this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find many sessions');
    }
  }

  /**
   * Updates session by ID
   */
  async update(id: string, data: Partial<Session>): Promise<Session | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const [affectedRows] = await this.model.update(updateData, {
        where: { id },
        returning: true,
      });

      if (affectedRows === 0) {
        return null;
      }

      return await this.findById(id);
    } catch (error) {
      this.handleDatabaseError(error, 'update session');
    }
  }

  /**
   * Updates multiple sessions
   */
  async updateMany(data: Partial<Session>, options: UpdateOptions): Promise<number> {
    try {
      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const [affectedRows] = await this.model.update(updateData, {
        where: this.buildWhereClause(options.where),
      });

      return affectedRows;
    } catch (error) {
      this.handleDatabaseError(error, 'update many sessions');
    }
  }

  /**
   * Deletes session by ID
   */
  async delete(id: string, options?: DeleteOptions): Promise<boolean> {
    try {
      if (!this.validateUUID(id)) {
        return false;
      }

      if (options?.soft) {
        // Soft delete - mark as inactive
        const result = await this.update(id, { isActive: false });
        return result !== null;
      } else {
        // Hard delete
        const affectedRows = await this.model.destroy({
          where: { id },
        });
        return affectedRows > 0;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete session');
    }
  }

  /**
   * Deletes multiple sessions
   */
  async deleteMany(options: DeleteOptions): Promise<number> {
    try {
      if (options.soft) {
        // Soft delete - mark as inactive
        return await this.updateMany({ isActive: false }, options);
      } else {
        // Hard delete
        const affectedRows = await this.model.destroy({
          where: this.buildWhereClause(options.where),
        });
        return affectedRows;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete many sessions');
    }
  }

  /**
   * Counts sessions matching criteria
   */
  async count(where?: WhereClause): Promise<number> {
    try {
      return await this.model.count({
        where: where ? this.buildWhereClause(where) : undefined,
      });
    } catch (error) {
      this.handleDatabaseError(error, 'count sessions');
    }
  }

  /**
   * Checks if session exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const count = await this.model.count({
        where: this.buildWhereClause(where),
      });
      return count > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'check session exists');
    }
  }

  /**
   * Updates session's last accessed timestamp
   */
  async updateLastAccessed(id: string): Promise<void> {
    try {
      await this.model.update(
        { 
          lastAccessedAt: this.getCurrentTimestamp(),
          updatedAt: this.getCurrentTimestamp()
        },
        { where: { id } }
      );
    } catch (error) {
      this.handleDatabaseError(error, 'update last accessed');
    }
  }

  /**
   * Extends session expiration
   */
  async extendSession(id: string, expiresAt: Date): Promise<Session | null> {
    try {
      return await this.update(id, { 
        expiresAt,
        lastAccessedAt: this.getCurrentTimestamp()
      });
    } catch (error) {
      this.handleDatabaseError(error, 'extend session');
    }
  }

  /**
   * Invalidates session by token
   */
  async invalidateByToken(token: string): Promise<boolean> {
    try {
      const [affectedRows] = await this.model.update(
        { 
          isActive: false,
          updatedAt: this.getCurrentTimestamp()
        },
        { where: { token } }
      );
      return affectedRows > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'invalidate session by token');
    }
  }

  /**
   * Invalidates all sessions for a user
   */
  async invalidateAllForUser(userId: string, exceptSessionId?: string): Promise<number> {
    try {
      const whereClause: WhereOptions = {
        userId,
        isActive: true,
      };

      if (exceptSessionId) {
        whereClause.id = { [Op.not]: exceptSessionId };
      }

      const [affectedRows] = await this.model.update(
        { 
          isActive: false,
          updatedAt: this.getCurrentTimestamp()
        },
        { where: whereClause }
      );
      
      return affectedRows;
    } catch (error) {
      this.handleDatabaseError(error, 'invalidate all sessions for user');
    }
  }

  /**
   * Cleans up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    try {
      const affectedRows = await this.model.destroy({
        where: {
          [Op.or]: [
            { expiresAt: { [Op.lt]: new Date() } },
            { isActive: false }
          ]
        }
      });
      
      return affectedRows;
    } catch (error) {
      this.handleDatabaseError(error, 'cleanup expired sessions');
    }
  }

  /**
   * Finds sessions expiring soon
   */
  async findExpiringSoon(hours: number = 24): Promise<Session[]> {
    try {
      const expirationThreshold = new Date();
      expirationThreshold.setHours(expirationThreshold.getHours() + hours);

      const sessions = await this.model.findAll({
        where: {
          isActive: true,
          expiresAt: {
            [Op.between]: [new Date(), expirationThreshold]
          }
        },
        include: [{ association: 'user' }],
        order: [['expiresAt', 'ASC']],
      });

      return sessions.map(session => this.mapRowToEntity(session.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find sessions expiring soon');
    }
  }

  /**
   * Gets session statistics for a user
   */
  async getUserSessionStats(userId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    lastActivity: Date | null;
  }> {
    try {
      const [total, active, expired, lastSession] = await Promise.all([
        this.model.count({ where: { userId } }),
        this.model.count({ 
          where: { 
            userId, 
            isActive: true,
            expiresAt: { [Op.gt]: new Date() }
          } 
        }),
        this.model.count({ 
          where: { 
            userId,
            [Op.or]: [
              { isActive: false },
              { expiresAt: { [Op.lt]: new Date() } }
            ]
          } 
        }),
        this.model.findOne({
          where: { userId },
          order: [['lastAccessedAt', 'DESC']],
          attributes: ['lastAccessedAt'],
        })
      ]);

      return {
        total,
        active,
        expired,
        lastActivity: lastSession?.lastAccessedAt || null,
      };
    } catch (error) {
      this.handleDatabaseError(error, 'get user session stats');
    }
  }

  /**
   * Validates token format
   */
  private validateToken(token: string): boolean {
    // Token should be at least 32 characters long
    return typeof token === 'string' && token.length >= 32;
  }

  /**
   * Builds Sequelize where clause from generic where clause
   */
  protected buildWhereClause(where: WhereClause): WhereOptions {
    const sequelizeWhere: WhereOptions = {};
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        sequelizeWhere[key] = { [Op.is]: value };
      } else if (Array.isArray(value)) {
        sequelizeWhere[key] = { [Op.in]: value };
      } else if (typeof value === 'object' && value !== null && 'operator' in value) {
        // Handle complex operators with proper type checking
        const operatorValue = value as { operator: string; value: unknown };
        switch (operatorValue.operator) {
          case 'gt':
            sequelizeWhere[key] = { [Op.gt]: operatorValue.value };
            break;
          case 'gte':
            sequelizeWhere[key] = { [Op.gte]: operatorValue.value };
            break;
          case 'lt':
            sequelizeWhere[key] = { [Op.lt]: operatorValue.value };
            break;
          case 'lte':
            sequelizeWhere[key] = { [Op.lte]: operatorValue.value };
            break;
          case 'like':
            sequelizeWhere[key] = { [Op.iLike]: `%${operatorValue.value}%` };
            break;
          case 'not':
            sequelizeWhere[key] = { [Op.not]: operatorValue.value };
            break;
          default:
            sequelizeWhere[key] = operatorValue.value;
        }
      } else {
        sequelizeWhere[key] = value;
      }
    }
    
    return sequelizeWhere;
  }

  /**
   * Executes a transaction
   */
  protected async executeTransaction<R>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<R>): Promise<R> {
    return await (this.model as typeof SessionModel).sequelize!.transaction(callback);
  }

  /**
   * Builds select fields from query options
   */
  private buildSelectFields(): { exclude: string[] } {
    return { exclude: [] }; // Return all fields by default
  }

  /**
   * Builds include clause for associations
   */
  private buildIncludeClause(options?: QueryOptions): Array<{ association: string; attributes?: { exclude: string[] } }> {
    if (!options?.include) {
      return [];
    }

    const includes: Array<{ association: string; attributes?: { exclude: string[] } }> = [];
    
    if (options.include.includes('user')) {
      includes.push({ 
        association: 'user',
        attributes: { exclude: ['password'] }
      });
    }
    
    return includes;
  }

  protected validateRequiredFields(data: Partial<Session>, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (!(field in data) || data[field as keyof Session] === undefined) {
        throw new ValidationError(`Missing required field: ${field}`);
      }
    }
  }

  protected sanitizeData(data: Partial<Session>, removeNull = false): Partial<Session> {
    const sanitized: Partial<Session> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && (!removeNull || value !== null)) {
        (sanitized as Record<string, unknown>)[key] = value;
      }
    }
    return sanitized;
  }

  protected generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  protected getCurrentTimestamp(): Date {
    return new Date();
  }

  protected validateUUID(id: string): boolean {
    // Basic UUID validation, consider a library like uuid for robust validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }

  protected buildOrderClause(options?: QueryOptions): string {
    if (!options?.orderBy) {
      return 'createdAt DESC';
    }
    const direction = options.orderDirection || 'ASC';
    return `${options.orderBy} ${direction}`;
  }

  protected buildLimitClause(options?: QueryOptions): { limit?: number; offset?: number } {
    return {
      limit: options?.limit,
      offset: options?.offset
    };
  }

  protected mapRowToEntity(row: Record<string, unknown>): Session {
    // Assuming row keys are already camelCase from Sequelize, or handle conversion if needed
    return row as Session;
  }

  protected handleDatabaseError(error: unknown, operation: string): never {
    console.error(`Database error during ${operation}:`, error);
    throw new Error(`Database error: ${operation}`);
  }

  protected async ensureExists(id: string): Promise<Session> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`Session with id ${id} not found`);
    }
    return entity;
  }
}