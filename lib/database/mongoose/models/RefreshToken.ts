import { Schema, model } from 'mongoose';
import { RefreshTokenDocument } from '../repositories/MongooseRefreshTokenRepository';

const RefreshTokenSchema = new Schema<RefreshTokenDocument>({
  userId: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: true },
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

RefreshTokenSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

export const RefreshTokenModel = model<RefreshTokenDocument>('RefreshToken', RefreshTokenSchema, 'refreshTokens');
