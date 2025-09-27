import { Model, Document } from 'mongoose';
import { BaseRepository, EmailVerification, EmailTokenRepository, QueryOptions, UpdateOptions, DeleteOptions, CreateOptions, WhereClause } from '../../types';

/**
 * Mongoose Email Verification Token Model
 */
export interface EmailVerificationDocument extends EmailVerification, Document {
  id: string; // Explicitly define id as string
}

/**
 * Mongoose implementation of EmailTokenRepository
 */
export class MongooseEmailTokenRepository implements EmailTokenRepository {
  protected model: Model<EmailVerificationDocument>; // Explicitly define model type

  constructor(model: Model<EmailVerificationDocument>) {
    this.model = model;
  }

  async create(data: Partial<EmailVerification>, options?: any): Promise<EmailVerification> {
    // @ts-ignore
    const records = await this.model.create(data, options);
    const record = Array.isArray(records) ? records[0] : records;
    return (record as EmailVerificationDocument).toObject({ getters: true, virtuals: false }) as EmailVerification;
  }

  async findById(id: string, options?: any): Promise<EmailVerification | null> {
    const record: EmailVerificationDocument | null = await this.model.findById(id, null, options);
    return record ? record.toObject({ getters: true, virtuals: false }) as EmailVerification : null;
  }

  async findOne(where: WhereClause, options?: any): Promise<EmailVerification | null> {
    const record: EmailVerificationDocument | null = await this.model.findOne(where, null, options);
    return record ? record.toObject({ getters: true, virtuals: false }) as EmailVerification : null;
  }

  async findMany(where?: WhereClause, options?: any): Promise<EmailVerification[]> {
    const records: EmailVerificationDocument[] = await this.model.find(where || {}, null, options);
    return records.map(record => record.toObject({ getters: true, virtuals: false }) as EmailVerification);
  }

  async update(id: string, data: Partial<EmailVerification>, options?: any): Promise<EmailVerification | null> {
    const record: EmailVerificationDocument | null = await this.model.findByIdAndUpdate(id, data, { new: true, ...options });
    return record ? record.toObject({ getters: true, virtuals: false }) as EmailVerification : null;
  }

  async updateMany(data: Partial<EmailVerification>, options: any): Promise<number> {
    const result = await this.model.updateMany(options.where, data);
    return result.modifiedCount;
  }

  async delete(id: string, options?: any): Promise<boolean> {
    const result = await this.model.deleteOne({ _id: id, ...options?.where });
    return result.deletedCount === 1;
  }

  async deleteMany(options: any): Promise<number> {
    const result = await this.model.deleteMany(options.where);
    return result.deletedCount;
  }

  async count(where?: WhereClause): Promise<number> {
    return this.model.countDocuments(where);
  }

  async exists(where: WhereClause): Promise<boolean> {
    return this.model.exists(where).then(res => res !== null);
  }

  /**
   * Find email token by token and type
   */
  async findByToken(token: string, type: 'verification' | 'password-reset'): Promise<EmailVerification | null> {
    return this.findOne({ token, type, isUsed: false, expiresAt: { $gt: new Date() } });
  }

  /**
   * Mark a specific email token as used
   */
  async markAsUsed(id: string): Promise<void> {
    await this.update(id, { isUsed: true });
  }

  /**
   * Clean up expired and used email tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.deleteMany({
      where: {
        $or: [
          { expiresAt: { $lt: new Date() } },
          { isUsed: true, usedAt: { $lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } // Clean up used tokens older than 7 days
        ]
      } as DeleteOptions['where']
    });
    return result;
  }
}
