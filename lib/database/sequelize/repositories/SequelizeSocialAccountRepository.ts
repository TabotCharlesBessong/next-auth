import { Op, Transaction, WhereOptions } from 'sequelize';
import { BaseRepository, SocialAccount, SocialAccountRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { SocialAccountModel } from '../models';
import { AbstractBaseRepository } from '../../base/AbstractBaseRepository';

/**
 * Sequelize implementation of SocialAccountRepository
 */
export class SequelizeSocialAccountRepository extends AbstractBaseRepository<SocialAccount> implements SocialAccountRepository {
  protected model: typeof SocialAccountModel;

  constructor(socialAccountModel: typeof SocialAccountModel) {
    super(socialAccountModel);
    this.model = socialAccountModel;
  }

  /**
   * Creates a new social account
   */
  async create(data: Partial<SocialAccount>): Promise<SocialAccount> {
    try {
      // Validate required fields
      this.validateRequiredFields(data, ['userId', 'provider', 'providerId']);
      
      // Validate provider
      if (data.provider && !this.validateProvider(data.provider)) {
        throw new ValidationError('Invalid provider', 'provider', data.provider);
      }

      // Sanitize data
      const sanitizedData = this.sanitizeData(data);
      
      // Add timestamps
      const now = this.getCurrentTimestamp();
      const socialAccountData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isActive: sanitizedData.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };

      const socialAccount = await this.model.create(socialAccountData as any);
      return this.mapRowToEntity(socialAccount.toJSON() as unknown as Record<string, unknown>);
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

      const socialAccount = await this.model.findByPk(id, {
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
      });

      return socialAccount ? this.mapRowToEntity(socialAccount.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find social account by id');
    }
  }

  /**
   * Finds social account by provider and provider ID
   */
  async findByProvider(provider: string, providerId: string): Promise<SocialAccount | null> {
    try {
      if (!this.validateProvider(provider)) {
        return null;
      }

      const socialAccount = await this.model.findOne({
        where: { 
          provider,
          providerId,
          isActive: true
        },
        include: [{ 
          association: 'user',
          attributes: { exclude: ['password'] }
        }],
      });

      return socialAccount ? this.mapRowToEntity(socialAccount.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find social account by provider');
    }
  }

  /**
   * Finds social accounts for a user
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      if (!this.validateUUID(userId)) {
        return [];
      }

      const { limit, offset } = this.buildLimitClause(options);
      
      const socialAccounts = await this.model.findAll({
        where: {
          userId,
          isActive: true
        },
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return socialAccounts.map(account => this.mapRowToEntity(account.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find social accounts by user id');
    }
  }

  /**
   * Finds social account by user ID and provider (required by SocialAccountRepository interface)
   */
  async findByUserIdAndProvider(userId: string, provider: string): Promise<SocialAccount | null> {
    try {
      if (!this.validateUUID(userId) || !this.validateProvider(provider)) {
        return null;
      }

      const socialAccount = await this.model.findOne({
        where: {
          userId,
          provider,
          isActive: true
        },
        include: [{ 
          association: 'user',
          attributes: { exclude: ['password'] }
        }],
      });

      return socialAccount ? this.mapRowToEntity(socialAccount.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find social account by user id and provider');
    }
  }

  /**
   * Finds one social account matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<SocialAccount | null> {
    try {
      const socialAccount = await this.model.findOne({
        where: this.buildWhereClause(where),
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
      });

      return socialAccount ? this.mapRowToEntity(socialAccount.toJSON() as unknown as Record<string, unknown>) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one social account');
    }
  }

  /**
   * Finds multiple social accounts matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      const { limit, offset } = this.buildLimitClause(options);
      
      const socialAccounts = await this.model.findAll({
        where: where ? this.buildWhereClause(where) : undefined,
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
        limit,
        offset,
      });

      return socialAccounts.map(account => this.mapRowToEntity(account.toJSON() as unknown as Record<string, unknown>));
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

      const [affectedRows] = await this.model.update(updateData, {
        where: { id },
        returning: true,
      });

      if (affectedRows === 0) {
        return null;
      }

      return await this.findById(id);
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

      const [affectedRows] = await this.model.update(updateData, {
        where: this.buildWhereClause(options.where),
      });

      return affectedRows;
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
        const affectedRows = await this.model.destroy({
          where: { id },
        });
        return affectedRows > 0;
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
      this.handleDatabaseError(error, 'delete many social accounts');
    }
  }

  /**
   * Counts social accounts matching criteria
   */
  async count(where?: WhereClause): Promise<number> {
    try {
      return await this.model.count({
        where: where ? this.buildWhereClause(where) : undefined,
      });
    } catch (error) {
      this.handleDatabaseError(error, 'count social accounts');
    }
  }

  /**
   * Checks if social account exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const count = await this.model.count({
        where: this.buildWhereClause(where),
      });
      return count > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'check social account exists');
    }
  }

  /**
   * Links a social account to a user
   */
  async linkToUser(userId: string, provider: string, providerId: string, data: Partial<SocialAccount>): Promise<SocialAccount> {
    try {
      // Check if account already exists
      const existing = await this.findByProvider(provider, providerId);
      if (existing) {
        if (existing.userId === userId) {
          // Update existing account
          return await this.update(existing.id, data) || existing;
        } else {
          throw new ValidationError('Social account already linked to another user', 'provider', provider);
        }
      }

      // Create new social account
      return await this.create({
        userId,
        provider,
        providerId,
        ...data,
      });
    } catch (error) {
      this.handleDatabaseError(error, 'link social account to user');
    }
  }

  /**
   * Unlinks a social account from a user
   */
  async unlinkFromUser(userId: string, provider: string): Promise<boolean> {
    try {
      const socialAccount = await this.model.findOne({
        where: {
          userId,
          provider,
          isActive: true
        }
      });

      if (!socialAccount) {
        return false;
      }

      return await this.delete(socialAccount.id, { where: { id: socialAccount.id }, soft: true });
    } catch (error) {
      this.handleDatabaseError(error, 'unlink social account from user');
    }
  }

  /**
   * Updates access token for a social account
   */
  async updateAccessToken(id: string, accessToken: string, refreshToken?: string, expiresAt?: Date): Promise<SocialAccount | null> {
    try {
      const updateData: Partial<SocialAccount> = {
        accessToken,
        lastSyncAt: this.getCurrentTimestamp(),
      };

      if (refreshToken) {
        updateData.refreshToken = refreshToken;
      }

      if (expiresAt) {
        updateData.tokenExpiresAt = expiresAt;
      }

      return await this.update(id, updateData);
    } catch (error) {
      this.handleDatabaseError(error, 'update access token');
    }
  }

  /**
   * Finds social accounts by provider
   */
  async findByProviderType(provider: string, options?: QueryOptions): Promise<SocialAccount[]> {
    try {
      if (!this.validateProvider(provider)) {
        return [];
      }

      const { limit, offset } = this.buildLimitClause(options);
      
      const socialAccounts = await this.model.findAll({
        where: {
          provider,
          isActive: true
        },
        attributes: this.buildSelectFields(),
        include: this.buildIncludeClause(options),
        order: [['createdAt', 'DESC']],
        limit,
        offset,
      });

      return socialAccounts.map(account => this.mapRowToEntity(account.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find social accounts by provider type');
    }
  }

  /**
   * Finds accounts with expired tokens
   */
  async findExpiredTokens(): Promise<SocialAccount[]> {
    try {
      const socialAccounts = await this.model.findAll({
        where: {
          isActive: true,
          tokenExpiresAt: {
            [Op.lt]: new Date()
          },
          refreshToken: {
            [Op.ne]: null as any
          }
        },
        include: [{ 
          association: 'user',
          attributes: { exclude: ['password'] }
        }],
        order: [['tokenExpiresAt', 'ASC']],
      });

      return socialAccounts.map(account => this.mapRowToEntity(account.toJSON() as unknown as Record<string, unknown>));
    } catch (error) {
      this.handleDatabaseError(error, 'find expired tokens');
    }
  }

  /**
   * Gets provider statistics
   */
  async getProviderStats(): Promise<Record<string, number>> {
    try {
      const results = await this.model.findAll({
        attributes: [
          'provider',
          [(this.model as typeof SocialAccountModel).sequelize!.fn('COUNT', (this.model as typeof SocialAccountModel).sequelize!.col('id')), 'count']
        ],
        where: {
          isActive: true
        },
        group: ['provider'],
        raw: true,
      });

      const stats: Record<string, number> = {};
      (results as any[]).forEach((result: { provider: string; count: string }) => {
        stats[result.provider] = parseInt(result.count, 10);
      });

      return stats;
    } catch (error) {
      this.handleDatabaseError(error, 'get provider stats');
    }
  }

  /**
   * Validates provider name
   */
  private validateProvider(provider: string): boolean {
    const validProviders = ['google', 'facebook', 'github', 'twitter', 'linkedin', 'discord', 'apple'];
    return validProviders.includes(provider.toLowerCase());
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
      } else if (typeof value === 'object' && value !== null && 'operator' in value && 'value' in value) {
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
    return await (this.model as typeof SocialAccountModel).sequelize!.transaction(callback);
  }

  /**
   * Builds select fields from query options
   */
  private buildSelectFields(): { exclude: string[] } {
    // Exclude sensitive fields by default
    return { exclude: ['accessToken', 'refreshToken'] };
  }

  /**
   * Builds include clause for associations
   */
  private buildIncludeClause(_options?: QueryOptions): Array<{ association: string; attributes?: { exclude: string[] } }> {
    if (!_options?.include) {
      return [];
    }

    const includes: Array<{ association: string; attributes?: { exclude: string[] } }> = [];
    
    if (_options.include.includes('user')) {
      includes.push({ 
        association: 'user',
        attributes: { exclude: ['password'] }
      });
    }
    
    return includes;
  }

  protected validateRequiredFields(data: Partial<SocialAccount>, requiredFields: string[]): void {
    for (const field of requiredFields) {
      if (!(field in data) || data[field as keyof SocialAccount] === undefined) {
        throw new ValidationError(`Missing required field: ${field}`);
      }
    }
  }

  protected sanitizeData(data: Partial<SocialAccount>, removeNull = false): Partial<SocialAccount> {
    const sanitized: Partial<SocialAccount> = {};
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

  protected mapRowToEntity(row: Record<string, unknown>): SocialAccount {
    // Assuming row keys are already camelCase from Sequelize, or handle conversion if needed
    return row as SocialAccount;
  }

  protected handleDatabaseError(error: unknown, operation: string): never {
    console.error(`Database error during ${operation}:`, error);
    throw new Error(`Database error: ${operation}`);
  }

  protected async ensureExists(id: string, entityName: string): Promise<SocialAccount> {
    const entity = await this.findById(id);
    if (!entity) {
      throw new Error(`${entityName} with id ${id} not found`);
    }
    return entity;
  }
}