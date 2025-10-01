import { Model, Document } from 'mongoose';
import { BaseRepository } from '../../base/BaseRepository';
import { RefreshToken, RefreshTokenRepository, QueryOptions, UpdateOptions, DeleteOptions, CreateOptions, WhereClause } from '../../types';

/**
 * Mongoose Refresh Token Model
 */
export interface RefreshTokenDocument extends RefreshToken, Document {
  id: string; // Explicitly define id as string
}

/**
 * Mongoose implementation of RefreshTokenRepository
 */
export class MongooseRefreshTokenRepository extends BaseRepository<RefreshToken> implements RefreshTokenRepository {
  protected model: Model<RefreshTokenDocument>; // Explicitly define model type

  constructor(model: Model<RefreshTokenDocument>) {
    super(null, null, model);
    this.model = model;
  }

  async create(data: Partial<RefreshToken>, options?: CreateOptions): Promise<RefreshToken> {
    const record = await this.model.create(data, options);
    return record.toJSON();
  }

  async findById(id: string, options?: QueryOptions): Promise<RefreshToken | null> {
    const record = await this.model.findById(id, options);
    return record ? record.toJSON() : null;
  }

  async findOne(where: WhereClause, options?: QueryOptions): Promise<RefreshToken | null> {
    const record = await this.model.findOne(where, options);
    return record ? record.toJSON() : null;
  }

  async findMany(where?: WhereClause, options?: QueryOptions): Promise<RefreshToken[]> {
    const records = await this.model.find(where || {}, null, options);
    return records.map(record => record.toJSON());
  }

  async update(id: string, data: Partial<RefreshToken>, options?: UpdateOptions): Promise<RefreshToken | null> {
    const record = await this.model.findByIdAndUpdate(id, data, { new: true, ...options });
    return record ? record.toJSON() : null;
  }

  async updateMany(data: Partial<RefreshToken>, options: UpdateOptions): Promise<number> {
    const result = await this.model.updateMany(options.where, data);
    return result.modifiedCount;
  }

  async delete(id: string, options?: DeleteOptions): Promise<boolean> {
    const result = await this.model.deleteOne({ _id: id, ...options?.where });
    return result.deletedCount === 1;
  }

  async deleteMany(options: DeleteOptions): Promise<number> {
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
   * Find refresh token by token ID
   */
  async findByTokenId(tokenId: string): Promise<RefreshToken | null> {
    return this.findOne({ token: tokenId });
  }

  /**
   * Find refresh tokens by user ID
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<RefreshToken[]> {
    return this.findMany({ userId }, options);
  }

  /**
   * Revoke a specific refresh token by its ID
   */
  async revokeToken(tokenId: string): Promise<boolean> {
    const result = await this.updateMany(
      { isActive: false },
      { where: { token: tokenId, isActive: true } as UpdateOptions['where'] }
    );
    return result > 0;
  }

  /**
   * Revoke all refresh tokens for a given user ID
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.updateMany(
      { isActive: false },
      { where: { userId, isActive: true } as UpdateOptions['where'] }
    );
    return result;
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.deleteMany(
      { where: { expiresAt: { $lt: new Date() } } as DeleteOptions['where'] }
    );
    return result;
  }
}
