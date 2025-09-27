import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import { User, Session, SocialAccount, PasswordReset, EmailVerification, AuditLog, RefreshToken } from '../../../database/types';
import { RefreshTokenFactory, RefreshTokenModel } from './RefreshToken';

// User Model
export interface UserAttributes extends User {}
export interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isEmailVerified' | 'isActive'> {}

export class UserModel extends Model<UserAttributes, UserCreationAttributes> implements User {
  public id!: string;
  public email!: string;
  public password?: string;
  public firstName?: string;
  public lastName?: string;
  public fullName?: string;
  public avatar?: string;
  public bio?: string;
  public phone?: string;
  public dateOfBirth?: Date;
  public isEmailVerified!: boolean;
  public isActive!: boolean;
  public lastLoginAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const UserFactory = (sequelize: Sequelize) => {
  UserModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    dateOfBirth: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'users',
    sequelize,
    timestamps: true,
    indexes: [
      { fields: ['email'], unique: true },
      { fields: ['isActive'] },
    ],
  });

  return UserModel;
};

// Session Model
export interface SessionAttributes extends Session {}
export interface SessionCreationAttributes extends Optional<SessionAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> {}

export class SessionModel extends Model<SessionAttributes, SessionCreationAttributes> implements Session {
  public id!: string;
  public userId!: string;
  public token!: string;
  public refreshToken?: string;
  public expiresAt!: Date;
  public ipAddress?: string;
  public userAgent?: string;
  public sessionType?: 'web' | 'mobile' | 'api';
  public lastAccessedAt?: Date;
  public metadata?: Record<string, unknown>;
  public isActive!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const SessionFactory = (sequelize: Sequelize) => {
  SessionModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    refreshToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    sessionType: {
      type: DataTypes.ENUM('web', 'mobile', 'api'),
      allowNull: true,
    },
    lastAccessedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'sessions',
    sequelize,
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'], unique: true },
      { fields: ['expiresAt'] },
      { fields: ['isActive'] },
    ],
  });

  return SessionModel;
};

// SocialAccount Model
export interface SocialAccountAttributes extends SocialAccount {}
export interface SocialAccountCreationAttributes extends Optional<SocialAccountAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> {}

export class SocialAccountModel extends Model<SocialAccountAttributes, SocialAccountCreationAttributes> implements SocialAccount {
  public id!: string;
  public userId!: string;
  public provider!: string;
  public providerId!: string;
  public email?: string;
  public name?: string;
  public avatar?: string;
  public accessToken?: string;
  public refreshToken?: string;
  public expiresAt?: Date;
  public tokenExpiresAt?: Date;
  public scope?: string[];
  public isActive!: boolean;
  public lastSyncAt?: Date;
  public metadata?: Record<string, unknown>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const SocialAccountFactory = (sequelize: Sequelize) => {
  SocialAccountModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    avatar: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    accessToken: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    refreshToken: {
      type: DataTypes.STRING(2048),
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    scope: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },
    lastSyncAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'socialAccounts',
    sequelize,
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['provider', 'providerId'], unique: true },
      { fields: ['email'] },
      { fields: ['isActive'] },
    ],
  });

  return SocialAccountModel;
};

// PasswordReset Model
export interface PasswordResetAttributes extends PasswordReset {}
export interface PasswordResetCreationAttributes extends Optional<PasswordResetAttributes, 'id' | 'createdAt' | 'isUsed'> {}

export class PasswordResetModel extends Model<PasswordResetAttributes, PasswordResetCreationAttributes> implements PasswordReset {
  public id!: string;
  public userId!: string;
  public token!: string;
  public expiresAt!: Date;
  public isUsed!: boolean;
  public usedAt?: Date;
  public ipAddress?: string;
  public userAgent?: string;
  public readonly createdAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const PasswordResetFactory = (sequelize: Sequelize) => {
  PasswordResetModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'passwordResets',
    sequelize,
    timestamps: true,
    updatedAt: false, // No updatedAt for password resets
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'], unique: true },
      { fields: ['expiresAt'] },
      { fields: ['isUsed'] },
    ],
  });

  return PasswordResetModel;
};

// EmailVerification Model
export interface EmailVerificationAttributes extends EmailVerification {}
export interface EmailVerificationCreationAttributes extends Optional<EmailVerificationAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isUsed' | 'isVerified' | 'attempts'> {}

export class EmailVerificationModel extends Model<EmailVerificationAttributes, EmailVerificationCreationAttributes> implements EmailVerification {
  public id!: string;
  public userId!: string;
  public email!: string;
  public token!: string;
  public expiresAt!: Date;
  public isUsed!: boolean;
  public isVerified!: boolean;
  public type!: 'verification' | 'password-reset';
  public verifiedAt?: Date;
  public usedAt?: Date;
  public attempts!: number;
  public ipAddress?: string;
  public userAgent?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const EmailVerificationFactory = (sequelize: Sequelize) => {
  EmailVerificationModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true, // Allow null if user is not yet created or associated
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    isUsed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('verification', 'password-reset'),
      allowNull: false,
    },
    verifiedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'emailVerifications',
    sequelize,
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'], unique: true },
      { fields: ['email'] },
      { fields: ['expiresAt'] },
      { fields: ['isUsed'] },
      { fields: ['isVerified'] },
      { fields: ['type'] },
    ],
  });

  return EmailVerificationModel;
};

// AuditLog Model
export interface AuditLogAttributes extends AuditLog {}
export interface AuditLogCreationAttributes extends Optional<AuditLogAttributes, 'id' | 'createdAt' | 'timestamp'> {}

export class AuditLogModel extends Model<AuditLogAttributes, AuditLogCreationAttributes> implements AuditLog {
  public id!: string;
  public userId?: string;
  public action!: string;
  public resource!: string;
  public resourceId?: string;
  public ipAddress?: string;
  public userAgent?: string;
  public metadata?: Record<string, unknown>;
  public details?: Record<string, unknown>;
  public timestamp?: Date;
  public readonly createdAt!: Date;
  [key: string]: unknown; // Add index signature
}

export const AuditLogFactory = (sequelize: Sequelize) => {
  AuditLogModel.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    action: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resource: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    resourceId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    details: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    timestamp: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
    },
  }, {
    tableName: 'auditLogs',
    sequelize,
    timestamps: false, // Using custom timestamp field `timestamp`
    indexes: [
      { fields: ['userId'] },
      { fields: ['action'] },
      { fields: ['resource'] },
      { fields: ['timestamp'] },
    ],
  });

  return AuditLogModel;
};


export const initializeSequelizeModels = (sequelize: Sequelize) => {
  UserFactory(sequelize);
  SessionFactory(sequelize);
  SocialAccountFactory(sequelize);
  PasswordResetFactory(sequelize);
  EmailVerificationFactory(sequelize);
  AuditLogFactory(sequelize);
  RefreshTokenFactory(sequelize);

  // Define associations
  // User and Session (One-to-Many)
  UserModel.hasMany(SessionModel, {
    foreignKey: 'userId',
    as: 'sessions',
    onDelete: 'CASCADE',
  });
  SessionModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  // User and SocialAccount (One-to-Many)
  UserModel.hasMany(SocialAccountModel, {
    foreignKey: 'userId',
    as: 'socialAccounts',
    onDelete: 'CASCADE',
  });
  SocialAccountModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  // User and PasswordReset (One-to-Many)
  UserModel.hasMany(PasswordResetModel, {
    foreignKey: 'userId',
    as: 'passwordResets',
    onDelete: 'CASCADE',
  });
  PasswordResetModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  // User and EmailVerification (One-to-Many)
  UserModel.hasMany(EmailVerificationModel, {
    foreignKey: 'userId',
    as: 'emailVerifications',
    onDelete: 'CASCADE',
  });
  EmailVerificationModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  // User and AuditLog (One-to-Many)
  UserModel.hasMany(AuditLogModel, {
    foreignKey: 'userId',
    as: 'auditLogs',
    onDelete: 'SET NULL',
  });
  AuditLogModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  // User and RefreshToken (One-to-Many)
  UserModel.hasMany(RefreshTokenModel, {
    foreignKey: 'userId',
    as: 'refreshTokens',
    onDelete: 'CASCADE',
  });
  RefreshTokenModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  return sequelize;
};