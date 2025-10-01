import { DataTypes, Model, Optional } from 'sequelize';
import { RefreshToken } from '../../../database/types';

// We need to declare an interface for our model that is pure to the model (i.e. has nothing to do with database operations).
export interface RefreshTokenAttributes extends RefreshToken {}

// We need to declare an interface that is the same as our model, but contains optional attributes.
// This is used to define the 'build' method on the model.
export interface RefreshTokenCreationAttributes extends Optional<RefreshTokenAttributes, 'id' | 'createdAt' | 'updatedAt' | 'isActive'> {}

export class RefreshTokenModel extends Model<RefreshTokenAttributes, RefreshTokenCreationAttributes> implements RefreshToken {
  public id!: string;
  public userId!: string;
  public token!: string;
  public expiresAt!: Date;
  public isActive!: boolean;

  // timestamps!
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

export const RefreshTokenFactory = (sequelize: any) => {
  RefreshTokenModel.init({
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
    tableName: 'refreshTokens',
    sequelize,
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['token'], unique: true },
      { fields: ['expiresAt'] },
      { fields: ['isActive'] },
    ],
  });

  return RefreshTokenModel;
};
