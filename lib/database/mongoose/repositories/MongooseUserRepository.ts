import { FilterQuery } from 'mongoose';
import { AbstractBaseRepository } from '../../base/BaseRepository';
import { User, UserRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { UserModel, UserDocument } from '../models';

/**
 * Mongoose implementation of UserRepository
 */
export class MongooseUserRepository extends AbstractBaseRepository<User> implements UserRepository {
  private userModel: typeof UserModel;

  constructor(userModel: typeof UserModel) {
    super('users', null);
    this.userModel = userModel;
  }

  /**
   * Creates a new user
   */
  async create(data: Partial<User>): Promise<User> {
    try {
      // Validate required fields
      this.validateRequiredFields(data, ['email']);
      
      // Validate email format
      if (data.email && !this.validateEmail(data.email)) {
        throw new ValidationError('Invalid email format', 'email', data.email);
      }

      // Sanitize data
      const sanitizedData = this.sanitizeData(data);
      
      // Add defaults
      const userData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isEmailVerified: sanitizedData.isEmailVerified ?? false,
        isActive: sanitizedData.isActive ?? true,
      };

      const user = await this.userModel.create(userData);
      return this.mapDocumentToEntity(user);
    } catch (error) {
      this.handleDatabaseError(error, 'create user');
    }
  }

  /**
   * Finds user by ID
   */
  async findById(id: string, options?: QueryOptions): Promise<User | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const query = this.userModel.findOne({ id });
      this.applyQueryOptions(query, options);
      
      const user = await query.exec();
      return user ? this.mapDocumentToEntity(user) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find user by id');
    }
  }

  /**
   * Finds user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    try {
      if (!this.validateEmail(email)) {
        return null;
      }

      const user = await this.userModel.findOne({ 
        email: email.toLowerCase(),
        isActive: true 
      }).select('-password').exec();

      return user ? this.mapDocumentToEntity(user) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find user by email');
    }
  }

  /**
   * Finds user by email with password (for authentication)
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    try {
      if (!this.validateEmail(email)) {
        return null;
      }

      const user = await this.userModel.findOne({ 
        email: email.toLowerCase(),
        isActive: true 
      }).exec();

      return user ? this.mapDocumentToEntity(user) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find user by email with password');
    }
  }

  /**
   * Finds one user matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<User | null> {
    try {
      const filter = this.buildMongooseFilter(where);
      const query = this.userModel.findOne(filter);
      this.applyQueryOptions(query, options);
      
      const user = await query.exec();
      return user ? this.mapDocumentToEntity(user) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one user');
    }
  }

  /**
   * Finds multiple users matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<User[]> {
    try {
      const filter = where ? this.buildMongooseFilter(where) : {};
      const query = this.userModel.find(filter);
      this.applyQueryOptions(query, options);
      
      const users = await query.exec();
      return users.map(user => this.mapDocumentToEntity(user));
    } catch (error) {
      this.handleDatabaseError(error, 'find many users');
    }
  }

  /**
   * Updates user by ID
   */
  async update(id: string, data: Partial<User>): Promise<User | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      // Validate email if provided
      if (data.email && !this.validateEmail(data.email)) {
        throw new ValidationError('Invalid email format', 'email', data.email);
      }

      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const user = await this.userModel.findOneAndUpdate(
        { id },
        { $set: updateData },
        { new: true, runValidators: true }
      ).exec();

      return user ? this.mapDocumentToEntity(user) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'update user');
    }
  }

  /**
   * Updates multiple users
   */
  async updateMany(data: Partial<User>, options: UpdateOptions): Promise<number> {
    try {
      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const filter = this.buildMongooseFilter(options.where);
      const result = await this.userModel.updateMany(
        filter,
        { $set: updateData },
        { runValidators: true }
      ).exec();

      return result.modifiedCount;
    } catch (error) {
      this.handleDatabaseError(error, 'update many users');
    }
  }

  /**
   * Deletes user by ID
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
        const result = await this.userModel.deleteOne({ id }).exec();
        return result.deletedCount > 0;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete user');
    }
  }

  /**
   * Deletes multiple users
   */
  async deleteMany(options: DeleteOptions): Promise<number> {
    try {
      const filter = this.buildMongooseFilter(options.where);
      
      if (options.soft) {
        // Soft delete - mark as inactive
        const result = await this.userModel.updateMany(
          filter,
          { $set: { isActive: false, updatedAt: this.getCurrentTimestamp() } }
        ).exec();
        return result.modifiedCount;
      } else {
        // Hard delete
        const result = await this.userModel.deleteMany(filter).exec();
        return result.deletedCount;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete many users');
    }
  }

  /**
   * Counts users matching criteria
   */
  async count(where?: WhereClause): Promise<number> {
    try {
      const filter = where ? this.buildMongooseFilter(where) : {};
      return await this.userModel.countDocuments(filter).exec();
    } catch (error) {
      this.handleDatabaseError(error, 'count users');
    }
  }

  /**
   * Checks if user exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const filter = this.buildMongooseFilter(where);
      const user = await this.userModel.findOne(filter).select('_id').lean().exec();
      return user !== null;
    } catch (error) {
      this.handleDatabaseError(error, 'check user exists');
    }
  }

  /**
   * Updates user's last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      await this.userModel.updateOne(
        { id },
        { 
          $set: { 
            lastLoginAt: this.getCurrentTimestamp(),
            updatedAt: this.getCurrentTimestamp()
          }
        }
      ).exec();
    } catch (error) {
      this.handleDatabaseError(error, 'update last login');
    }
  }

  /**
   * Finds active users
   */
  async findActiveUsers(options?: QueryOptions): Promise<User[]> {
    return this.findMany({ isActive: true }, options);
  }

  /**
   * Searches users by name or email
   */
  async searchUsers(query: string, options?: QueryOptions): Promise<User[]> {
    try {
      const searchRegex = new RegExp(query, 'i');
      
      const filter = {
        $or: [
          { email: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex },
          { fullName: searchRegex },
        ],
        isActive: true
      };

      const mongoQuery = this.userModel.find(filter).select('-password');
      this.applyQueryOptions(mongoQuery, options);
      
      const users = await mongoQuery.exec();
      return users.map(user => this.mapDocumentToEntity(user));
    } catch (error) {
      this.handleDatabaseError(error, 'search users');
    }
  }

  /**
   * Finds users by role (from metadata)
   */
  async findByRole(role: string, options?: QueryOptions): Promise<User[]> {
    try {
      const filter = {
        'metadata.role': role,
        isActive: true
      };

      const query = this.userModel.find(filter).select('-password');
      this.applyQueryOptions(query, options);
      
      const users = await query.exec();
      return users.map(user => this.mapDocumentToEntity(user));
    } catch (error) {
      this.handleDatabaseError(error, 'find users by role');
    }
  }

  /**
   * Gets user statistics
   */
  async getUserStats(): Promise<{
    total: number;
    active: number;
    verified: number;
    recentlyActive: number;
  }> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [total, active, verified, recentlyActive] = await Promise.all([
        this.userModel.countDocuments().exec(),
        this.userModel.countDocuments({ isActive: true }).exec(),
        this.userModel.countDocuments({ isEmailVerified: true }).exec(),
        this.userModel.countDocuments({ 
          lastLoginAt: { $gte: thirtyDaysAgo },
          isActive: true 
        }).exec()
      ]);

      return {
        total,
        active,
        verified,
        recentlyActive
      };
    } catch (error) {
      this.handleDatabaseError(error, 'get user stats');
    }
  }

  /**
   * Builds Mongoose filter from generic where clause
   */
  private buildMongooseFilter(where: WhereClause): FilterQuery<UserDocument> {
    const filter: FilterQuery<UserDocument> = {};
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        filter[key] = value;
      } else if (Array.isArray(value)) {
        filter[key] = { $in: value };
      } else if (typeof value === 'object' && value !== null && 'operator' in value) {
        // Handle complex operators
        const operatorValue = value as { operator: string; value: unknown };
        switch (operatorValue.operator) {
          case 'gt':
            filter[key] = { $gt: operatorValue.value };
            break;
          case 'gte':
            filter[key] = { $gte: operatorValue.value };
            break;
          case 'lt':
            filter[key] = { $lt: operatorValue.value };
            break;
          case 'lte':
            filter[key] = { $lte: operatorValue.value };
            break;
          case 'like':
            filter[key] = { $regex: operatorValue.value, $options: 'i' };
            break;
          case 'not':
            filter[key] = { $ne: operatorValue.value };
            break;
          default:
            filter[key] = operatorValue.value;
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
  private applyQueryOptions(query: import('mongoose').Query<unknown, UserDocument>, options?: QueryOptions): void {
    if (!options) return;

    // Apply select fields
    if (options.select) {
      query.select(options.select.join(' '));
    } else {
      // Exclude password by default
      query.select('-password');
    }

    // Apply sorting
    if (options.orderBy) {
      const sortOrder = options.orderDirection === 'DESC' ? -1 : 1;
      query.sort({ [options.orderBy]: sortOrder });
    } else {
      query.sort({ createdAt: -1 });
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
          case 'sessions':
            query.populate({
              path: 'sessions',
              match: { isActive: true },
              options: { sort: { lastAccessedAt: -1 } }
            });
            break;
          case 'socialAccounts':
            query.populate({
              path: 'socialAccounts',
              match: { isActive: true },
              select: '-accessToken -refreshToken'
            });
            break;
        }
      });
    }
  }

  /**
   * Maps Mongoose document to entity
   */
  private mapDocumentToEntity(doc: UserDocument): User {
    const obj = doc.toObject();
    
    return {
      id: obj.id || obj._id.toString(),
      email: obj.email,
      password: obj.password,
      firstName: obj.firstName,
      lastName: obj.lastName,
      fullName: obj.fullName,
      avatar: obj.avatar,
      dateOfBirth: obj.dateOfBirth,
      phone: obj.phone,
      timezone: obj.timezone,
      locale: obj.locale,
      isEmailVerified: obj.isEmailVerified,
      isActive: obj.isActive,
      lastLoginAt: obj.lastLoginAt,
      metadata: obj.metadata,
      preferences: obj.preferences,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  /**
   * Builds a where clause for Mongoose queries
   */
  protected buildWhereClause(where: WhereClause): FilterQuery<UserDocument> {
    const filter: FilterQuery<UserDocument> = {};
    
    for (const [key, value] of Object.entries(where)) {
      if (value === null || value === undefined) {
        filter[key] = value;
      } else if (typeof value === 'object' && value !== null && 'operator' in value) {
        const operatorValue = value as { operator: string; value: unknown };
        switch (operatorValue.operator) {
          case 'gt':
            filter[key] = { $gt: operatorValue.value };
            break;
          case 'gte':
            filter[key] = { $gte: operatorValue.value };
            break;
          case 'lt':
            filter[key] = { $lt: operatorValue.value };
            break;
          case 'lte':
            filter[key] = { $lte: operatorValue.value };
            break;
          case 'like':
            filter[key] = { $regex: operatorValue.value, $options: 'i' };
            break;
          case 'not':
            filter[key] = { $ne: operatorValue.value };
            break;
          default:
            filter[key] = operatorValue.value;
        }
      } else {
        filter[key] = value;
      }
    }
    
    return filter;
  }

  /**
   * Executes a transaction using Mongoose sessions
   */
  protected async executeTransaction<R>(callback: (session: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<R>): Promise<R> {
    const session = await this.userModel.startSession();
    
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