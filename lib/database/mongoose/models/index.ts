import mongoose, { Schema, Document, Model } from 'mongoose';
import { User, Session, SocialAccount, PasswordReset, EmailVerification, AuditLog, RefreshToken } from '../../types';
import { RefreshTokenDocument } from '../repositories/MongooseRefreshTokenRepository';

// Extend interfaces with Mongoose Document
export interface UserDocument extends Omit<User, 'id'>, Document {
  _id: string;
}

export interface SessionDocument extends Omit<Session, 'id'>, Document {
  _id: string;
}

export interface SocialAccountDocument extends Omit<SocialAccount, 'id'>, Document {
  _id: string;
}

export interface PasswordResetDocument extends Omit<PasswordReset, 'id'>, Document {
  _id: string;
}

export interface EmailVerificationDocument extends EmailVerification, Document {
  id: string; // Ensure 'id' is explicitly required
}

export interface AuditLogDocument extends Omit<AuditLog, 'id'>, Document {
  _id: string;
}

// Define RefreshTokenDocument here for consistency, but the actual model is in RefreshToken.ts
// export interface RefreshTokenDocument extends Omit<RefreshToken, 'id'>, Document {
//   _id: string;
// }

/**
 * User Schema
 */
const UserSchema = new Schema<UserDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, 'Invalid email format']
  },
  password: {
    type: String,
    required: false, // Optional for social login users
    minlength: 6
  },
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  fullName: {
    type: String,
    trim: true,
    maxlength: 100
  },
  avatar: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  dateOfBirth: {
    type: Date
  },
  phone: {
    type: String,
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format']
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  locale: {
    type: String,
    default: 'en'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  preferences: {
    type: Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'users',
  toJSON: {
    transform: function(doc, ret) {
      delete (ret as Record<string, unknown>)['password'];
      delete (ret as Record<string, unknown>)['__v'];
      return ret;
    }
  }
});

// Indexes
UserSchema.index({ isActive: 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ lastLoginAt: 1 });
UserSchema.index({ 'metadata.role': 1 });

// Virtual for full name
UserSchema.virtual('displayName').get(function() {
  if (this.fullName) return this.fullName;
  if (this.firstName && this.lastName) return `${this.firstName} ${this.lastName}`;
  if (this.firstName) return this.firstName;
  return this.email;
});

// Pre-save middleware
UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-generate fullName if not provided
  if (!this.fullName && (this.firstName || this.lastName)) {
    this.fullName = [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  
  next();
});

/**
 * Session Schema
 */
const SessionSchema = new Schema<SessionDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  token: {
    type: String,
    required: true,
    unique: true,
    minlength: 32
  },
  sessionType: {
    type: String,
    enum: ['web', 'mobile', 'api'],
    default: 'web'
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  ipAddress: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(v);
      },
      message: 'Invalid IP address format'
    }
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'sessions'
});

// Indexes
SessionSchema.index({ userId: 1 });
SessionSchema.index({ isActive: 1 });
SessionSchema.index({ lastAccessedAt: 1 });
SessionSchema.index({ createdAt: 1 });

// TTL index for automatic cleanup of expired sessions
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware
SessionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * Social Account Schema
 */
const SocialAccountSchema = new Schema<SocialAccountDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  provider: {
    type: String,
    required: true,
    enum: ['google', 'facebook', 'github', 'twitter', 'linkedin', 'discord', 'apple'],
    lowercase: true
  },
  providerId: {
    type: String,
    required: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  avatar: {
    type: String,
    validate: {
      validator: function(v: string) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Avatar must be a valid URL'
    }
  },
  accessToken: {
    type: String,
    required: false // Will be encrypted in production
  },
  refreshToken: {
    type: String,
    required: false // Will be encrypted in production
  },
  tokenExpiresAt: {
    type: Date
  },
  scope: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastSyncAt: {
    type: Date
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  collection: 'socialaccounts',
  toJSON: {
    transform: function(doc, ret) {
      delete (ret as Record<string, unknown>)['accessToken'];
      delete (ret as Record<string, unknown>)['refreshToken'];
      delete (ret as Record<string, unknown>)['__v'];
      return ret;
    }
  }
});

// Indexes
SocialAccountSchema.index({ provider: 1, providerId: 1 }, { unique: true });
SocialAccountSchema.index({ userId: 1 });
SocialAccountSchema.index({ provider: 1 });
SocialAccountSchema.index({ isActive: 1 });
SocialAccountSchema.index({ tokenExpiresAt: 1 });

// Pre-save middleware
SocialAccountSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/**
 * Password Reset Schema
 */
const PasswordResetSchema = new Schema<PasswordResetDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  token: {
    type: String,
    required: true,
    unique: true,
    minlength: 32
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'passwordresets'
});

// Indexes
PasswordResetSchema.index({ userId: 1 });
PasswordResetSchema.index({ isUsed: 1 });
PasswordResetSchema.index({ createdAt: 1 });

// TTL index for automatic cleanup
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Email Verification Schema
 */
const EmailVerificationSchema = new Schema<EmailVerificationDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  token: {
    type: String,
    required: true,
    unique: true,
    minlength: 32
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date
  },
  attempts: {
    type: Number,
    default: 0,
    max: 5
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: 'emailverifications'
});

// Indexes
EmailVerificationSchema.index({ userId: 1 });
EmailVerificationSchema.index({ email: 1 });
EmailVerificationSchema.index({ isVerified: 1 });
EmailVerificationSchema.index({ createdAt: 1 });

// TTL index for automatic cleanup
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * Audit Log Schema
 */
const AuditLogSchema = new Schema<AuditLogDocument>({
  id: {
    type: String,
    required: true,
    unique: true,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    ref: 'User'
  },
  action: {
    type: String,
    required: true,
    enum: [
      'user_created', 'user_updated', 'user_deleted',
      'login_success', 'login_failed', 'logout',
      'password_changed', 'password_reset_requested', 'password_reset_completed',
      'email_verified', 'email_changed',
      'social_account_linked', 'social_account_unlinked',
      'session_created', 'session_expired', 'session_invalidated',
      'profile_updated', 'settings_changed'
    ]
  },
  resource: {
    type: String,
    required: true
  },
  resourceId: {
    type: String
  },
  details: {
    type: Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String,
    maxlength: 500
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  collection: 'auditlogs'
});

// Indexes
AuditLogSchema.index({ userId: 1 });
AuditLogSchema.index({ action: 1 });
AuditLogSchema.index({ resource: 1 });
AuditLogSchema.index({ ipAddress: 1 });
AuditLogSchema.index({ timestamp: 1, userId: 1 });

// TTL index for automatic cleanup (keep logs for 1 year)
AuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 });

// Create and export models
export const UserModel: Model<UserDocument> = mongoose.models.User || mongoose.model<UserDocument>('User', UserSchema);
export const SessionModel: Model<SessionDocument> = mongoose.models.Session || mongoose.model<SessionDocument>('Session', SessionSchema);
export const SocialAccountModel: Model<SocialAccountDocument> = mongoose.models.SocialAccount || mongoose.model<SocialAccountDocument>('SocialAccount', SocialAccountSchema);
export const PasswordResetModel: Model<PasswordResetDocument> = mongoose.models.PasswordReset || mongoose.model<PasswordResetDocument>('PasswordReset', PasswordResetSchema);
export const EmailVerificationModel: Model<EmailVerificationDocument> = mongoose.models.EmailVerification || mongoose.model<EmailVerificationDocument>('EmailVerification', EmailVerificationSchema);
export const AuditLogModel: Model<AuditLogDocument> = mongoose.models.AuditLog || mongoose.model<AuditLogDocument>('AuditLog', AuditLogSchema);
import { RefreshTokenModel } from './RefreshToken';

// Export all models as a collection
export const MongooseModels = {
  User: UserModel,
  Session: SessionModel,
  SocialAccount: SocialAccountModel,
  PasswordReset: PasswordResetModel,
  EmailVerification: EmailVerificationModel,
  AuditLog: AuditLogModel,
  RefreshToken: RefreshTokenModel, // Add RefreshTokenModel here
};

// Helper function to initialize all models
export const initializeMongooseModels = () => {
  return MongooseModels;
};

// Helper function to drop all collections (for testing)
export const dropAllCollections = async () => {
  if (!mongoose.connection.db) {
    throw new Error('Database connection not established');
  }
  
  const collections = await mongoose.connection.db.listCollections().toArray();
  
  for (const collection of collections) {
    await mongoose.connection.db.dropCollection(collection.name);
  }
};

// Helper function to create all indexes
export const createAllIndexes = async () => {
  await Promise.all([
    UserModel.createIndexes(),
    SessionModel.createIndexes(),
    SocialAccountModel.createIndexes(),
    PasswordResetModel.createIndexes(),
    EmailVerificationModel.createIndexes(),
    AuditLogModel.createIndexes(),
    RefreshTokenModel.createIndexes(), // Add RefreshTokenModel to index creation
  ]);
};