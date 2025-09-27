import { Model } from 'sequelize';
import { BaseRepository, RefreshToken, RefreshTokenRepository, QueryOptions, UpdateOptions, DeleteOptions, CreateOptions, WhereClause } from '../../types';
import { Op } from 'sequelize';
import { RefreshTokenModel } from '../models/RefreshToken'; // Import the static model

/**
 * Sequelize implementation of RefreshTokenRepository
 */
export class SequelizeRefreshTokenRepository extends BaseRepository<RefreshToken> implements RefreshTokenRepository {
  protected model: typeof RefreshTokenModel; // Explicitly define model type

  constructor(model: typeof RefreshTokenModel) {
    super(model); // Pass model to the BaseRepository constructor
    this.model = model; // Assign the model explicitly
  }

  async create(data: Partial<RefreshToken>, options?: CreateOptions): Promise<RefreshToken> {
    const record = await this.model.create(data, options);
    return record.toJSON();
  }

  async findById(id: string, options?: QueryOptions): Promise<RefreshToken | null> {
    const record = await this.model.findByPk(id, options);
    return record ? record.toJSON() : null;
  }

  async findOne(where: WhereClause, options?: QueryOptions): Promise<RefreshToken | null> {
    const record = await this.model.findOne({ where, ...options });
    return record ? record.toJSON() : null;
  }

  async findMany(where?: WhereClause, options?: QueryOptions): Promise<RefreshToken[]> {
    const records = await this.model.findAll({ where, ...options });
    return records.map(record => record.toJSON());
  }

  async update(id: string, data: Partial<RefreshToken>, options?: UpdateOptions): Promise<RefreshToken | null> {
    const [affectedCount] = await this.model.update(data, { where: { id }, ...options });
    if (affectedCount === 0) return null;
    return this.findById(id);
  }

  async updateMany(data: Partial<RefreshToken>, options: UpdateOptions): Promise<number> {
    const [affectedCount] = await this.model.update(data, options);
    return affectedCount;
  }

  async delete(id: string, options?: DeleteOptions): Promise<boolean> {
    const affectedCount = await this.model.destroy({ where: { id }, ...options });
    return affectedCount > 0;
  }

  async deleteMany(options: DeleteOptions): Promise<number> {
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
   * Find refresh token by token ID
   */
  async findByTokenId(tokenId: string): Promise<RefreshToken | null> {
    const session = await this.model.findOne({ where: { token: tokenId } });
    return session ? (session.toJSON() as RefreshToken) : null;
  }

  /**
   * Find refresh tokens by user ID
   */
  async findByUserId(userId: string, options?: QueryOptions): Promise<RefreshToken[]> {
    const sessions = await this.findMany({ userId }, options);
    return sessions.map(session => session.toJSON() as RefreshToken);
  }

  /**
   * Revoke a specific refresh token by its ID
   */
  async revokeToken(tokenId: string): Promise<boolean> {
    const [affectedCount] = await this.model.update(
      { isActive: false },
      { where: { token: tokenId, isActive: true } }
    );
    return affectedCount > 0;
  }

  /**
   * Revoke all refresh tokens for a given user ID
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const [affectedCount] = await this.model.update(
      { isActive: false },
      { where: { userId, isActive: true } }
    );
    return affectedCount;
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    const deletedCount = await this.model.destroy(
      { where: { expiresAt: { [Op.lt]: new Date() } } }
    );
    return deletedCount;
  }
}
