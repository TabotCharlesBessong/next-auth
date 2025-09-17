import { FilterQuery } from 'mongoose';
import { AbstractBaseRepository } from '../../base/BaseRepository';
import { SocialAccount, SocialAccountRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { SocialAccountModel, SocialAccountDocument } from '../models';

/**
 * Mongoose implementation of SocialAccountRepository
 */
export class MongooseSocialAccountRepository extends AbstractBaseRepository<SocialAccount> implements SocialAccountRepository {
  private socialAccountModel: typeof SocialAccountModel;

  constructor(socialAccountModel: typeof SocialAccountModel) {
    super('social_accounts', null);
    this.socialAccountModel = socialAccountModel;
  }

  /**
   * Creates a new social account
   */
  async create(data: Partial<SocialAccount>): Promise<SocialAccount> {
    try {
      // Validate required fields
      this.validateRequiredFields(data, ['userId', 'provider', 'providerAccountId']);
      
      // Validate provider
      if (data.provider && !this.validateProvider(data.provider)) {
        throw new ValidationError('Invalid provider', 'provider', data.provider);
      }

      // Sanitize data
      const sanitizedData = this.sanitizeData(data);
      
      // Add defaults
      const socialAccountData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isActive: sanitizedData.isActive ?? true,
      };

      const socialAccount = await this.socialAccountModel.create(socialAccountData);
      return this.mapDocumentToEntity(socialAccount);
    } catch (error) {
      this.handleDatabaseError(error, 'create social account');
    }
  }

  /**
   * Finds social account by ID
   */
  async findById(id: string, options?: QueryOptions): Promise<SocialAccount | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const query = this.socialAccountModel.findOne({ id });
      this.applyQueryOptions(query, options);
      
      const socialAccount = await query.exec();
      return socialAccount ? this.mapDocumentToEntity(socialAccount) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find social account by id');
    }
  }

  /**
   * Finds social account by provider and provider account ID
   */
  async findByProvider(provider: string, providerAccountId: string): Promise<SocialAccount | null> {
    try {
      if (!this.validateProvider(provider)) {
        return null;
      }

      const socialAccount = await this.socialAccountModel.findOne({ 
        provider,
        providerAccountId,
        isActive: true 
      }).exec();

      return socialAccount ? this.mapDocumentToEntity(socialAccount) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find social account by provider');
    }
  }

  /**
   * Finds social accounts by user ID
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }

      const query = this.socialAccountModel.find({ 
        userId,
        isActive: true 
      });
      this.applyQueryOptions(query, options);
      
      const socialAccounts = await query.exec();
      return socialAccounts.map(account => this.mapDocumentToEntity(account));
    } catch (error) {
      this.handleDatabaseError(error, 'find social accounts by user id');
    }
  }

  /**
   * Finds one social account matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<SocialAccount | null> {
    try {
      const filter = this.buildMongooseFilter(where);
      const query = this.socialAccountModel.findOne(filter);
      this.applyQueryOptions(query, options);
      
      const socialAccount = await query.exec();
      return socialAccount ? this.mapDocumentToEntity(socialAccount) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one social account');
    }
  }

  /**
   * Finds multiple social accounts matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      const filter = where ? this.buildMongooseFilter(where) : {};
      const query = this.socialAccountModel.find(filter);
      this.applyQueryOptions(query, options);
      
      const socialAccounts = await query.exec();
      return socialAccounts.map(account => this.mapDocumentToEntity(account));
    } catch (error) {
      this.handleDatabaseError(error, 'find many social accounts');
    }
  }

  /**
   * Updates social account by ID
   */
  async update(id: string, data: Partial<SocialAccount>): Promise<SocialAccount | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      // Validate provider if provided
      if (data.provider && !this.validateProvider(data.provider)) {
        throw new ValidationError('Invalid provider', 'provider', data.provider);
      }

      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const socialAccount = await this.socialAccountModel.findOneAndUpdate(
        { id },
        { $set: updateData },
        { new: true, runValidators: true }
      ).exec();

      return socialAccount ? this.mapDocumentToEntity(socialAccount) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'update social account');
    }
  }

  /**
   * Updates multiple social accounts
   */
  async updateMany(data: Partial<SocialAccount>, options: UpdateOptions): Promise<number> {
    try {
      const sanitizedData = this.sanitizeData(data);
      const updateData = {
        ...sanitizedData,
        updatedAt: this.getCurrentTimestamp(),
      };

      const filter = this.buildMongooseFilter(options.where);
      const result = await this.socialAccountModel.updateMany(
        filter,
        { $set: updateData },
        { runValidators: true }
      ).exec();

      return result.modifiedCount;
    } catch (error) {
      this.handleDatabaseError(error, 'update many social accounts');
    }
  }

  /**
   * Deletes social account by ID
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
        const result = await this.socialAccountModel.deleteOne({ id }).exec();
        return result.deletedCount > 0;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete social account');
    }
  }

  /**
   * Deletes multiple social accounts
   */
  async deleteMany(options: DeleteOptions): Promise<number> {
    try {
      const filter = this.buildMongooseFilter(options.where);
      
      if (options.soft) {
        // Soft delete - mark as inactive
        const result = await this.socialAccountModel.updateMany(
          filter,
          { $set: { isActive: false, updatedAt: this.getCurrentTimestamp() } }
        ).exec();
        return result.modifiedCount;
      } else {
        // Hard delete
        const result = await this.socialAccountModel.deleteMany(filter).exec();
        return result.deletedCount;
      }
    } catch (error) {
      this.handleDatabaseError(error, 'delete many social accounts');
    }
  }

  /**
   * Counts social accounts matching criteria
   */
  async count(where?: WhereClause): Promise<number> {
    try {
      const filter = where ? this.buildMongooseFilter(where) : {};
      return await this.socialAccountModel.countDocuments(filter).exec();
    } catch (error) {
      this.handleDatabaseError(error, 'count social accounts');
    }
  }

  /**
   * Checks if social account exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const filter = this.buildMongooseFilter(where);
      const account = await this.socialAccountModel.findOne(filter).select('_id').lean().exec();
      return account !== null;
    } catch (error) {
      this.handleDatabaseError(error, 'check social account exists');
    }
  }

  /**
   * Links social account to user
   */
  async linkToUser(userId: string, provider: string, providerAccountId: string, data: Partial<SocialAccount>): Promise<SocialAccount> {
    try {
      if (!this.validateUUID(userId) || !this.validateProvider(provider)) {
        throw new ValidationError('Invalid user ID or provider', 'userId', userId);
      }

      // Check if account already exists
      const existingAccount = await this.findByProvider(provider, providerAccountId);
      if (existingAccount) {
        // Update existing account
        return await this.update(existingAccount.id, {
          ...data,
          userId,
          isActive: true
        }) as SocialAccount;
      }

      // Create new account
      return await this.create({
        ...data,
        userId,
        provider,
        providerAccountId
      });
    } catch (error) {
      this.handleDatabaseError(error, 'link social account to user');
    }
  }

  /**
   * Unlinks social account from user
   */
  async unlinkFromUser(userId: string, provider: string): Promise<boolean> {
    try {
      if (!this.validateUUID(userId) || !this.validateProvider(provider)) {
        return false;
      }

      const result = await this.socialAccountModel.updateMany(
        { userId, provider },
        { 
          $set: { 
            isActive: false,
            updatedAt: this.getCurrentTimestamp()
          }
        }
      ).exec();

      return result.modifiedCount > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'unlink social account from user');
    }
  }

  /**
   * Updates access token for social account
   */
  async updateAccessToken(id: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<SocialAccount | null> {
    try {
      if (!this.validateUUID(id)) {
        return null;
      }

      const updateData: Partial<SocialAccount> = {
        accessToken,
        updatedAt: this.getCurrentTimestamp()
      };

      if (refreshToken) {
        updateData.refreshToken = refreshToken;
      }

      if (expiresAt) {
        updateData.tokenExpiresAt = expiresAt;
      }

      const socialAccount = await this.socialAccountModel.findOneAndUpdate(
        { id, isActive: true },
        { $set: updateData },
        { new: true }
      ).exec();

      return socialAccount ? this.mapDocumentToEntity(socialAccount) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'update access token');
    }
  }

  /**
   * Gets social accounts by provider
   */
  async getByProvider(provider: string, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      if (!this.validateProvider(provider)) {
        return [];
      }

      const query = this.socialAccountModel.find({ 
        provider,
        isActive: true 
      });
      this.applyQueryOptions(query, options);
      
      const accounts = await query.exec();
      return accounts.map(account => this.mapDocumentToEntity(account));
    } catch (error) {
      this.handleDatabaseError(error, 'get social accounts by provider');
    }
  }

  /**
   * Gets provider statistics
   */
  async getProviderStats(): Promise<Record<string, number>> {
    try {
      const stats = await this.socialAccountModel.aggregate([
        {
          $match: { isActive: true }
        },
        {
          $group: {
            _id: '$provider',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).exec();

      const result: Record<string, number> = {};
      stats.forEach(stat => {
        result[stat._id] = stat.count;
      });

      return result;
    } catch (error) {
      this.handleDatabaseError(error, 'get provider stats');
    }
  }

  /**
   * Finds accounts with expired tokens
   */
  async findExpiredTokens(options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      const query = this.socialAccountModel.find({
        isActive: true,
        tokenExpiresAt: { $lt: new Date() },
        refreshToken: { $exists: true, $ne: null }
      });
      
      this.applyQueryOptions(query, options);
      
      const accounts = await query.exec();
      return accounts.map(account => this.mapDocumentToEntity(account));
    } catch (error) {
      this.handleDatabaseError(error, 'find expired tokens');
    }
  }

  /**
   * Cleans up inactive social accounts
   */
  async cleanupInactiveAccounts(): Promise<number> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await this.socialAccountModel.deleteMany({
        isActive: false,
        updatedAt: { $lt: thirtyDaysAgo }
      }).exec();

      return result.deletedCount;
    } catch (error) {
      this.handleDatabaseError(error, 'cleanup inactive accounts');
    }
  }

  /**
   * Gets social account statistics
   */
  async getSocialAccountStats(): Promise<{
    total: number;
    active: number;
    byProvider: Record<string, number>;
    withExpiredTokens: number;
  }> {
    try {
      const now = new Date();

      const [total, active, providerStats, expiredTokens] = await Promise.all([
        this.socialAccountModel.countDocuments().exec(),
        this.socialAccountModel.countDocuments({ isActive: true }).exec(),
        this.getProviderStats(),
        this.socialAccountModel.countDocuments({
          isActive: true,
          tokenExpiresAt: { $lt: now }
        }).exec()
      ]);

      return {
        total,
        active,
        byProvider: providerStats,
        withExpiredTokens: expiredTokens
      };
    } catch (error) {
      this.handleDatabaseError(error, 'get social account stats');
    }
  }

  /**
   * Builds Mongoose filter from generic where clause
   */
  private buildMongooseFilter(where: WhereClause): FilterQuery<SocialAccountDocument> {
    const filter: FilterQuery<SocialAccountDocument> = {};
    
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
  private applyQueryOptions(query: import('mongoose').Query<unknown, SocialAccountDocument>, options?: QueryOptions): void {
    if (!options) return;

    // Apply select fields
    if (options.select) {
      query.select(options.select.join(' '));
    } else {
      // Exclude sensitive tokens by default
      query.select('-accessToken -refreshToken');
    }

    // Apply sorting
    if (options.orderBy) {
      const sortOrder = options.order === 'desc' ? -1 : 1;
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
  private mapDocumentToEntity(doc: SocialAccountDocument): SocialAccount {
    const obj = doc.toObject();
    
    return {
      id: obj.id || obj._id.toString(),
      userId: obj.userId,
      provider: obj.provider,
      providerAccountId: obj.providerAccountId,
      accessToken: obj.accessToken,
      refreshToken: obj.refreshToken,
      tokenType: obj.tokenType,
      scope: obj.scope,
      tokenExpiresAt: obj.tokenExpiresAt,
      isActive: obj.isActive,
      profile: obj.profile,
      metadata: obj.metadata,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt
    };
  }

  /**
   * Validates provider name
   */
  private validateProvider(provider: string): boolean {
    const validProviders = [
      'google', 'facebook', 'twitter', 'github', 'linkedin',
      'microsoft', 'apple', 'discord', 'spotify', 'twitch'
    ];
    return validProviders.includes(provider.toLowerCase());
  }

  /**
   * Executes a transaction using Mongoose sessions
   */
  protected async executeTransaction<R>(callback: (session: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<R>): Promise<R> {
    const session = await this.socialAccountModel.startSession();
    
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