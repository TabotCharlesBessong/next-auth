import { Op, Transaction, WhereOptions } from 'sequelize';
import { AbstractBaseRepository } from '../../base/BaseRepository';
import { User, UserRepository, QueryOptions, WhereClause, UpdateOptions, DeleteOptions, ValidationError } from '../../types';
import { UserModel } from '../models';

/**
 * Sequelize implementation of UserRepository
 */
export class SequelizeUserRepository extends AbstractBaseRepository<User> implements UserRepository {
  private userModel: typeof UserModel;

  constructor(userModel: typeof UserModel) {
    super('users', userModel.sequelize);
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
      
      // Add timestamps
      const now = this.getCurrentTimestamp();
      const userData = {
        ...sanitizedData,
        id: sanitizedData.id || this.generateId(),
        isEmailVerified: sanitizedData.isEmailVerified ?? false,
        isActive: sanitizedData.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };

      const user = await this.userModel.create(userData);
      return this.mapRowToEntity(user.toJSON());
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

      const user = await this.userModel.findByPk(id, {
        attributes: this.buildSelectFields(options),
        include: this.buildIncludeClause(options),
      });

      return user ? this.mapRowToEntity(user.toJSON()) : null;
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
        where: { email: email.toLowerCase() },
        attributes: { exclude: ['password'] },
      });

      return user ? this.mapRowToEntity(user.toJSON()) : null;
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
        where: { email: email.toLowerCase() },
      });

      return user ? this.mapRowToEntity(user.toJSON()) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find user by email with password');
    }
  }

  /**
   * Finds one user matching criteria
   */
  async findOne(where: WhereClause, options?: QueryOptions): Promise<User | null> {
    try {
      const user = await this.userModel.findOne({
        where: this.buildWhereClause(where),
        attributes: this.buildSelectFields(options),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
      });

      return user ? this.mapRowToEntity(user.toJSON()) : null;
    } catch (error) {
      this.handleDatabaseError(error, 'find one user');
    }
  }

  /**
   * Finds multiple users matching criteria
   */
  async findMany(where?: WhereClause, options?: QueryOptions): Promise<User[]> {
    try {
      const { limit, offset } = this.buildLimitClause(options);
      
      const users = await this.userModel.findAll({
        where: where ? this.buildWhereClause(where) : undefined,
        attributes: this.buildSelectFields(options),
        include: this.buildIncludeClause(options),
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
        limit,
        offset,
      });

      return users.map(user => this.mapRowToEntity(user.toJSON()));
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

      const [affectedRows] = await this.userModel.update(updateData, {
        where: { id },
        returning: true,
      });

      if (affectedRows === 0) {
        return null;
      }

      return await this.findById(id);
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

      const [affectedRows] = await this.userModel.update(updateData, {
        where: this.buildWhereClause(options.where),
      });

      return affectedRows;
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
        const affectedRows = await this.userModel.destroy({
          where: { id },
        });
        return affectedRows > 0;
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
      if (options.soft) {
        // Soft delete - mark as inactive
        return await this.updateMany({ isActive: false }, options);
      } else {
        // Hard delete
        const affectedRows = await this.userModel.destroy({
          where: this.buildWhereClause(options.where),
        });
        return affectedRows;
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
      return await this.userModel.count({
        where: where ? this.buildWhereClause(where) : undefined,
      });
    } catch (error) {
      this.handleDatabaseError(error, 'count users');
    }
  }

  /**
   * Checks if user exists
   */
  async exists(where: WhereClause): Promise<boolean> {
    try {
      const count = await this.userModel.count({
        where: this.buildWhereClause(where),
        limit: 1,
      });
      return count > 0;
    } catch (error) {
      this.handleDatabaseError(error, 'check user exists');
    }
  }

  /**
   * Updates user's last login timestamp
   */
  async updateLastLogin(id: string): Promise<void> {
    try {
      await this.userModel.update(
        { lastLoginAt: this.getCurrentTimestamp() },
        { where: { id } }
      );
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
      const { limit, offset } = this.buildLimitClause(options);
      
      const users = await this.userModel.findAll({
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: `%${query}%` } },
            { firstName: { [Op.iLike]: `%${query}%` } },
            { lastName: { [Op.iLike]: `%${query}%` } },
            { fullName: { [Op.iLike]: `%${query}%` } },
          ],
        },
        attributes: { exclude: ['password'] },
        order: [[this.buildOrderClause(options).split(' ')[0], this.buildOrderClause(options).split(' ')[1]]],
        limit,
        offset,
      });

      return users.map(user => this.mapRowToEntity(user.toJSON()));
    } catch (error) {
      this.handleDatabaseError(error, 'search users');
    }
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
      } else if (typeof value === 'object' && value.operator) {
        // Handle complex operators
        switch (value.operator) {
          case 'gt':
            sequelizeWhere[key] = { [Op.gt]: value.value };
            break;
          case 'gte':
            sequelizeWhere[key] = { [Op.gte]: value.value };
            break;
          case 'lt':
            sequelizeWhere[key] = { [Op.lt]: value.value };
            break;
          case 'lte':
            sequelizeWhere[key] = { [Op.lte]: value.value };
            break;
          case 'like':
            sequelizeWhere[key] = { [Op.iLike]: `%${value.value}%` };
            break;
          case 'not':
            sequelizeWhere[key] = { [Op.not]: value.value };
            break;
          default:
            sequelizeWhere[key] = value.value;
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
    return await this.userModel.sequelize!.transaction(callback);
  }

  /**
   * Builds select fields from query options
   */
  private buildSelectFields(): { exclude: string[] } {
    // By default, exclude password field
    return { exclude: ['password'] };
  }

  /**
   * Builds include clause for associations
   */
  private buildIncludeClause(options?: QueryOptions): Array<{ association: string }> {
    if (!options?.include) {
      return [];
    }

    const includes: Array<{ association: string }> = [];
    
    if (options.include.includes('sessions')) {
      includes.push({ association: 'sessions' });
    }
    
    if (options.include.includes('socialAccounts')) {
      includes.push({ association: 'socialAccounts' });
    }
    
    return includes;
  }
}