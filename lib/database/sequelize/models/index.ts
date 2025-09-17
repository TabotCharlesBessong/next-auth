import { Sequelize, DataTypes, Model, ModelStatic } from 'sequelize';
import { User, Session, SocialAccount, PasswordReset, EmailVerification, AuditLog } from '../../types';

// User Model
export class UserModel extends Model<User> implements User {
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
  public createdAt!: Date;
  public updatedAt!: Date;
  
  // Dynamic fields
  [key: string]: unknown;
}

// Session Model
export class SessionModel extends Model<Session> implements Session {
  public id!: string;
  public userId!: string;
  public token!: string;
  public refreshToken?: string;
  public expiresAt!: Date;
  public ipAddress?: string;
  public userAgent?: string;
  public isActive!: boolean;
  public createdAt!: Date;
  public updatedAt!: Date;
}

// Social Account Model
export class SocialAccountModel extends Model<SocialAccount> implements SocialAccount {
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
  public createdAt!: Date;
  public updatedAt!: Date;
}

// Password Reset Model
export class PasswordResetModel extends Model<PasswordReset> implements PasswordReset {
  public id!: string;
  public userId!: string;
  public token!: string;
  public expiresAt!: Date;
  public isUsed!: boolean;
  public createdAt!: Date;
}

// Email Verification Model
export class EmailVerificationModel extends Model<EmailVerification> implements EmailVerification {
  public id!: string;
  public userId!: string;
  public token!: string;
  public expiresAt!: Date;
  public isUsed!: boolean;
  public createdAt!: Date;
}

// Audit Log Model
export class AuditLogModel extends Model<AuditLog> implements AuditLog {
  public id!: string;
  public userId?: string;
  public action!: string;
  public resource!: string;
  public resourceId?: string;
  public ipAddress?: string;
  public userAgent?: string;
  public metadata?: Record<string, unknown>;
  public createdAt!: Date;
}

/**
 * Initialize all Sequelize models
 */
export function initializeModels(sequelize: Sequelize): {
  User: ModelStatic<UserModel>;
  Session: ModelStatic<SessionModel>;
  SocialAccount: ModelStatic<SocialAccountModel>;
  PasswordReset: ModelStatic<PasswordResetModel>;
  EmailVerification: ModelStatic<EmailVerificationModel>;
  AuditLog: ModelStatic<AuditLogModel>;
} {
  // Initialize User model
  UserModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
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
        allowNull: true, // Can be null for social auth users
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
        type: DataTypes.TEXT,
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
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['email'],
        },
        {
          fields: ['isActive'],
        },
        {
          fields: ['isEmailVerified'],
        },
      ],
    }
  );

  // Initialize Session model
  SessionModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Session',
      tableName: 'sessions',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['token'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['isActive'],
        },
      ],
    }
  );

  // Initialize SocialAccount model
  SocialAccountModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      accessToken: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      refreshToken: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'SocialAccount',
      tableName: 'social_accounts',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['provider', 'providerId'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['provider'],
        },
      ],
    }
  );

  // Initialize PasswordReset model
  PasswordResetModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
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
    },
    {
      sequelize,
      modelName: 'PasswordReset',
      tableName: 'password_resets',
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ['token'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['isUsed'],
        },
      ],
    }
  );

  // Initialize EmailVerification model
  EmailVerificationModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
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
    },
    {
      sequelize,
      modelName: 'EmailVerification',
      tableName: 'email_verifications',
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          unique: true,
          fields: ['token'],
        },
        {
          fields: ['userId'],
        },
        {
          fields: ['expiresAt'],
        },
        {
          fields: ['isUsed'],
        },
      ],
    }
  );

  // Initialize AuditLog model
  AuditLogModel.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'AuditLog',
      tableName: 'audit_logs',
      timestamps: true,
      updatedAt: false,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['action'],
        },
        {
          fields: ['resource'],
        },
        {
          fields: ['resourceId'],
        },
        {
          fields: ['createdAt'],
        },
      ],
    }
  );

  // Define associations
  UserModel.hasMany(SessionModel, { foreignKey: 'userId', as: 'sessions' });
  SessionModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  UserModel.hasMany(SocialAccountModel, { foreignKey: 'userId', as: 'socialAccounts' });
  SocialAccountModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  UserModel.hasMany(PasswordResetModel, { foreignKey: 'userId', as: 'passwordResets' });
  PasswordResetModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  UserModel.hasMany(EmailVerificationModel, { foreignKey: 'userId', as: 'emailVerifications' });
  EmailVerificationModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  UserModel.hasMany(AuditLogModel, { foreignKey: 'userId', as: 'auditLogs' });
  AuditLogModel.belongsTo(UserModel, { foreignKey: 'userId', as: 'user' });

  return {
    User: UserModel,
    Session: SessionModel,
    SocialAccount: SocialAccountModel,
    PasswordReset: PasswordResetModel,
    EmailVerification: EmailVerificationModel,
    AuditLog: AuditLogModel,
  };
}