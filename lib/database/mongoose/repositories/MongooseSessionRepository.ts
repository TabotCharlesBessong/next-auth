import { FilterQuery } from 'mongoose';
import { AbstractBaseRepository } from '../../base/BaseRepository';
import { Session, SessionRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { SessionModel, SessionDocument } from '../models';

/**
 * Mongoose implementation of SessionRepository
 */
export class MongooseSessionRepository extends AbstractBaseRepository<Session> implements SessionRepository {
  private sessionModel: typeof SessionModel;

  constructor(sessionModel: typeof SessionModel) {
    super('sessions', null);
    this.sessionModel = sessionModel;
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
      
      // Add defaults
      const sessionData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isActive: sanitizedData.isActive ?? true,
        lastAccessedAt: sanitizedData.lastAccessedAt || this.getCurrentTimestamp(),
        expiresAt: sanitizedData.expiresAt || this.getDefaultExpiryDate(),
      };

      const session = await this.sessionModel.create(sessionData);
      return this.mapDocumentToEntity(session);
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

      const query = this.sessionModel.findOne({ id });
      this.applyQueryOptions(query, options);
      
      const session = await query.exec();
      return session ? this.mapDocumentToEntity(session) : null;
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

      const session = await this.sessionModel.findOne({ 
        token,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).exec();

      return session ? this.mapDocumentToEntity(session) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find session by token');
    }
  }

  /**
   * Finds sessions by user ID
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<Session[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }

      const query = this.sessionModel.find({ 
        userId,
        isActive: true 
      });
      this.applyQueryOptions(query, options);
      
      const sessions = await query.exec();
      return sessions.map(session => this.mapDocumentToEntity(session));
    } catch (error) {
      this.handleDatabaseError(error, 'find sessions by user id');
    }
  }

  /**
   * Finds one session matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<Session | null> {
    try {
      const filter = this.buildMongooseFilter(where);
      const query = this.sessionModel.findOne(filter);
      this.applyQueryOptions(query, options);
      
      const session = await query.exec();
      return session ? this.mapDocumentToEntity(session) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one session');
    }
  }

  /**
   * Finds multiple sessions matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<Session[]> {
    try {
      const filter = where ? this.buildMongooseFilter(where) : {};
      const query = this.sessionModel.find(filter);
      this.applyQueryOptions(query, options);
      
      const sessions = await query.exec();
      return sessions.map(session => this.mapDocumentToEntity(session));
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

      // Validate token if provided
      if (data.token && !this.validateToken(data.token)) {
        throw new ValidationError('Invalid token format', 'token', data.token);
      }

      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const session = await this.sessionModel.findOneAndUpdate(
        { id },
        { $set: updateData },
        { new: true, runValidators: true }
      ).exec();

      return session ? this.mapDocumentToEntity(session) : null;
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

      const filter = this.buildMongooseFilter(options.where);
      const result = await this.sessionModel.updateMany(
        filter,
        { $set: updateData },
        { runValidators: true }
      ).exec();

      return result.modifiedCount;
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
        const result = await this.sessionModel.deleteOne({ id }).exec();
        return result.deletedCount > 0;
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
      const filter = this.buildMongooseFilter(options.where);
      
      if (options.soft) {
        // Soft delete - mark as inactive
        const result = await this.sessionModel.updateMany(
          filter,
          { $set: { isActive: false, updatedAt: this.getCurrentTimestamp() } }
        ).exec();
        return result.modifiedCount;
      } else {
        // Hard delete
        const result = await this.sessionModel.deleteMany(filter).exec();
        return result.deletedCount;
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
      const filter = where ? this.buildMongooseFilter(where) : {};
      return await this.sessionModel.countDocuments(filter).exec();
    } catch (error) {
      this.handleDatabaseError(error, 'count sessions');
    }
  }

  /**
   * Checks if session exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const filter = this.buildMongooseFilter(where);
      const session = await this.sessionModel.findOne(filter).select('_id').lean().exec();
      return session !== null;
    } catch (error) {
      this.handleDatabaseError(error, 'check session exists');
    }
  }

  /**
   * Validates session token
   */
  async validateToken(token: string): Promise<Session | null> {
    try {
      if (!this.validateToken(token)) {
        return null;
      }

      const session = await this.sessionModel.findOne({
        token,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).exec();

      if (session) {
        // Update last accessed time
        await this.sessionModel.updateOne(
          { _id: session._id },
          { 
            $set: { 
              lastAccessedAt: this.getCurrentTimestamp(),
              updatedAt: this.getCurrentTimestamp()
            }
          }
        ).exec();

        return this.mapDocumentToEntity(session);
      }

      return null;
    } catch (error) {
      this.handleDatabaseError(error, 'validate token');
    }
  }

  /**
   * Extends session expiry
   */
  async extendSession(id: string, expiresAt: Date): Promise<Session | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const session = await this.sessionModel.findOneAndUpdate(
        { id, isActive: true },
        { 
          $set: { 
            expiresAt,
            lastAccessedAt: this.getCurrentTimestamp(),
            updatedAt: this.getCurrentTimestamp()
          }
        },
        { new: true }
      ).exec();

      return session ? this.mapDocumentToEntity(session) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'extend session');
    }
  }

  /**
   * Revokes session by token
   */
  async revokeSession(token: string): Promise<boolean> {
    try {
      if (!this.validateToken(token)) {
        return false;
      }

      const result = await this.sessionModel.updateOne(
        { token },
        { 
          $set: { 
            isActive: false,
            revokedAt: this.getCurrentTimestamp(),
            updatedAt: this.getCurrentTimestamp()
          }
        }
      ).exec();

      return result.modifiedCount > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'revoke session');
    }
  }

  /**
   * Revokes all sessions for a user
   */
  async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    try {
      if (!this.validateUUID(userId)) {
        return 0;
      }

      const filter: FilterQuery<SessionDocument> = { userId, isActive: true };
      if (exceptSessionId) {
        filter.id = { $ne: exceptSessionId };
      }

      const result = await this.sessionModel.updateMany(
        filter,
        { 
          $set: { 
            isActive: false,
            revokedAt: this.getCurrentTimestamp(),
            updatedAt: this.getCurrentTimestamp()
          }
        }
      ).exec();

      return result.modifiedCount;
    } catch (error) {
      this.handleDatabaseError(error, 'revoke all user sessions');
    }
  }

  /**
   * Cleans up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.sessionModel.deleteMany({
        $or: [
          { expiresAt: { $lt: new Date() } },
          { isActive: false, updatedAt: { $lt: this.getCleanupDate() } }
        ]
      }).exec();

      return result.deletedCount;
    } catch (error) {
      this.handleDatabaseError(error, 'cleanup expired sessions');
    }
  }

  /**
   * Gets active sessions for a user
   */
  async getActiveSessions(userId: string, options?: QueryOptions): Promise<Session[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }

      const query = this.sessionModel.find({
        userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });
      
      this.applyQueryOptions(query, options);
      
      const sessions = await query.exec();
      return sessions.map(session => this.mapDocumentToEntity(session));
    } catch (error) {
      this.handleDatabaseError(error, 'get active sessions');
    }
  }

  /**
   * Gets session statistics
   */
  async getSessionStats(): Promise<{
    total: number;
    active: number;
    expired: number;
    recentlyActive: number;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [total, active, expired, recentlyActive] = await Promise.all([
        this.sessionModel.countDocuments().exec(),
        this.sessionModel.countDocuments({ 
          isActive: true,
          expiresAt: { $gt: now }
        }).exec(),
        this.sessionModel.countDocuments({ 
          $or: [
            { expiresAt: { $lt: now } },
            { isActive: false }
          ]
        }).exec(),
        this.sessionModel.countDocuments({ 
          lastAccessedAt: { $gte: oneHourAgo },
          isActive: true,
          expiresAt: { $gt: now }
        }).exec()
      ]);

      return {
        total,
        active,
        expired,
        recentlyActive
      };
    } catch (error) {
      this.handleDatabaseError(error, 'get session stats');
    }
  }

  /**
   * Builds Mongoose filter from generic where clause
   */
  private buildMongooseFilter(where: WhereClause): FilterQuery<SessionDocument> {
    const filter: FilterQuery<SessionDocument> = {};
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        filter[key] = value;
      } else if (Array.isArray(value)) {
        filter[key] = { $in: value };
      } else if (typeof value === 'object' && value.operator) {
        // Handle complex operators
        switch (value.operator) {
          case 'gt':
            filter[key] = { $gt: value.value };
            break;
          case 'gte':
            filter[key] = { $gte: value.value };
            break;
          case 'lt':
            filter[key] = { $lt: value.value };
            break;
          case 'lte':
            filter[key] = { $lte: value.value };
            break;
          case 'like':
            filter[key] = { $regex: value.value, $options: 'i' };
            break;
          case 'not':
            filter[key] = { $ne: value.value };
            break;
          default:
            filter[key] = value.value;
        }
      } else {
        filter[key] = value;
      }
    }
    
    return filter;
  }

  /**
   * Applies query options to Mongoose query
   */
  private applyQueryOptions(query: import('mongoose').Query<unknown, SessionDocument>, options?: QueryOptions): void {
    if (!options) return;

    // Apply select fields
    if (options.select) {
      query.select(options.select.join(' '));
    }

    // Apply sorting
    if (options.orderBy) {
      const sortOrder = options.order === 'desc' ? -1 : 1;
      query.sort({ [options.orderBy]: sortOrder });
    } else {
      query.sort({ lastAccessedAt: -1 });
    }

    // Apply pagination
    if (options.limit) {
      query.limit(options.limit);
    }
    
    if (options.offset) {
      query.skip(options.offset);
    }

    // Apply population
    if (options.include) {
      options.include.forEach(relation => {
        switch (relation) {
          case 'user':
            query.populate({
              path: 'user',
              select: '-password'
            });
            break;
        }
      });
    }
  }

  /**
   * Maps Mongoose document to entity
   */
  private mapDocumentToEntity(doc: SessionDocument): Session {
    const obj = doc.toObject();
    
    return {
      id: obj.id || obj._id.toString(),
      userId: obj.userId,
      token: obj.token,
      refreshToken: obj.refreshToken,
      deviceInfo: obj.deviceInfo,
      ipAddress: obj.ipAddress,
      userAgent: obj.userAgent,
      isActive: obj.isActive,
      lastAccessedAt: obj.lastAccessedAt,
      expiresAt: obj.expiresAt,
      revokedAt: obj.revokedAt,
      metadata: obj.metadata,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  /**
   * Gets default expiry date (30 days from now)
   */
  private getDefaultExpiryDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date;
  }

  /**
   * Gets cleanup date (30 days ago)
   */
  private getCleanupDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  }

  /**
   * Validates token format
   */
  private validateToken(token: string): boolean {
    return typeof token === 'string' && token.length >= 32;
  }

  /**
   * Executes a transaction using Mongoose sessions
   */
  protected async executeTransaction<R>(callback: (session: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<R>): Promise<R> {
    const session = await this.sessionModel.startSession();
    
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
}