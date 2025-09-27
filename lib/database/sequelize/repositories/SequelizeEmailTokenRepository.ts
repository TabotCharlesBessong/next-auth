import { Model } from 'sequelize';
import { BaseRepository, EmailVerification, EmailTokenRepository, QueryOptions, UpdateOptions, DeleteOptions, CreateOptions, WhereClause } from '../../types';
import { Op } from 'sequelize';
import { EmailVerificationModel, EmailVerificationCreationAttributes } from '../models';

/**
 * Sequelize implementation of EmailTokenRepository
 */
export class SequelizeEmailTokenRepository implements EmailTokenRepository {
  protected model: typeof EmailVerificationModel; // Explicitly define model type

  constructor(model: typeof EmailVerificationModel) {
    this.model = model; // Assign the model explicitly
  }

  async create(data: Partial<EmailVerification>, options?: any): Promise<EmailVerification> {
    if (!data.email) {
      throw new Error('Email is required for creating an email verification record.');
    }
    if (!data.userId) {
      throw new Error('UserId is required for creating an email verification record.');
    }
    const record = await this.model.create(data as EmailVerificationCreationAttributes, options);
    if (!record) {
      throw new Error('Failed to create email verification record.');
    }
    return record.toJSON();
  }

  async findById(id: string, options?: any): Promise<EmailVerification | null> {
    const record = await this.model.findByPk(id, options);
    return record ? record.toJSON() : null;
  }

  async findOne(where: WhereClause, options?: any): Promise<EmailVerification | null> {
    const record = await this.model.findOne({ where, ...options });
    return record ? record.toJSON() : null;
  }

  async findMany(where?: WhereClause, options?: any): Promise<EmailVerification[]> {
    const records = await this.model.findAll({ where, ...options });
    return records.map((record: EmailVerificationModel) => record.toJSON());
  }

  async update(id: string, data: Partial<EmailVerification>, options?: any): Promise<EmailVerification | null> {
    const [affectedCount] = await this.model.update(data, { where: { id }, ...options });
    if (affectedCount === 0) return null;
    const updatedRecord = await this.model.findByPk(id);
    return updatedRecord ? updatedRecord.toJSON() : null;
  }

  async updateMany(data: Partial<EmailVerification>, options: any): Promise<number> {
    const [affectedCount] = await this.model.update(data, options);
    return affectedCount;
  }

  async delete(id: string, options?: any): Promise<boolean> {
    const affectedCount = await this.model.destroy({ where: { id }, ...options });
    return affectedCount > 0;
  }

  async deleteMany(options: any): Promise<number> {
    return this.model.destroy(options);
  }

  async count(where?: WhereClause): Promise<number> {
    return this.model.count({ where });
  }

  async exists(where: WhereClause): Promise<boolean> {
    const count = await this.model.count({ where });
    return count > 0;
  }

  /**
   * Find email token by token and type
   */
  async findByToken(token: string, type: 'verification' | 'password-reset'): Promise<EmailVerification | null> {
    const emailVerification = await this.model.findOne({
      where: { token, type, isUsed: false, expiresAt: { [Op.gt]: new Date() } },
    });
    return emailVerification ? (emailVerification.toJSON() as EmailVerification) : null;
  }

  /**
   * Mark a specific email token as used
   */
  async markAsUsed(id: string): Promise<void> {
    await this.update(id, { isUsed: true, usedAt: new Date() });
  }

  /**
   * Clean up expired and used email tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const deletedCount = await this.model.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: new Date() } },
          { isUsed: true, usedAt: { [Op.lt]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // Clean up used tokens older than 7 days
        ]
      }
    });
    return deletedCount;
  }
}
