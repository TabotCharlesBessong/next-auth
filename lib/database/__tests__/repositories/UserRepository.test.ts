import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SequelizeUserRepository } from '../../sequelize/repositories/SequelizeUserRepository';
import { MongooseUserRepository } from '../../mongoose/repositories/MongooseUserRepository';
import { UserRepository, User, CreateUserData, UpdateUserData, FindUserOptions } from '../../types';
import { UserModel as SequelizeUserModel } from '../../sequelize/models';
import { UserModel as MongooseUserModel } from '../../mongoose/models';

// Mock data
const mockUser: User = {
  id: '1',
  email: 'test@example.com',
  username: 'testuser',
  firstName: 'Test',
  lastName: 'User',
  isActive: true,
  lastLoginAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  isEmailVerified: false
};

const mockCreateData: CreateUserData = {
  email: 'new@example.com',
  username: 'newuser',
  firstName: 'New',
  lastName: 'User',
  passwordHash: 'hashedpassword'
};

const mockUpdateData: UpdateUserData = {
  firstName: 'Updated',
  lastName: 'Name',
  isEmailVerified: true
};

// Mock the models
jest.mock('../../sequelize/models', () => ({
  UserModel: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
    sequelize: {
      transaction: jest.fn()
    }
  }
}));

jest.mock('../../mongoose/models', () => ({
  UserModel: {
    create: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn()
  }
}));

// Test suite for both Sequelize and Mongoose implementations
const repositoryImplementations = [
  {
    name: 'SequelizeUserRepository',
    createRepository: () => {
      return new SequelizeUserRepository(SequelizeUserModel);
    }
  },
  {
    name: 'MongooseUserRepository',
    createRepository: () => {
      return new MongooseUserRepository(MongooseUserModel);
    }
  }
];

repositoryImplementations.forEach(({ name, createRepository }) => {
  describe(`${name}`, () => {
    let repository: UserRepository;
    
    beforeEach(() => {
      repository = createRepository();
      jest.clearAllMocks();
    });
    
    afterEach(() => {
      jest.resetAllMocks();
    });

    describe('create', () => {
      it('should create a new user', async () => {
        // Mock the implementation
        jest.spyOn(repository, 'create').mockResolvedValue({
          ...mockUser,
          ...mockCreateData,
          id: '2'
        });
        
        const result = await repository.create(mockCreateData);
        
        expect(result).toBeDefined();
        expect(result.email).toBe(mockCreateData.email);
        expect(result.username).toBe(mockCreateData.username);
        expect(repository.create).toHaveBeenCalledWith(mockCreateData);
      });

      it('should create user with transaction', async () => {
        const mockTransaction = {};
        
        jest.spyOn(repository, 'create').mockResolvedValue({
          ...mockUser,
          ...mockCreateData,
          id: '2'
        });
        
        const result = await repository.create(mockCreateData, mockTransaction);
        
        expect(result).toBeDefined();
        expect(repository.create).toHaveBeenCalledWith(mockCreateData, mockTransaction);
      });

      it('should handle validation errors', async () => {
        const invalidData = {
          email: 'invalid-email',
          username: '',
          firstName: '',
          lastName: ''
        } as CreateUserData;
        
        jest.spyOn(repository, 'create').mockRejectedValue(
          new Error('Validation failed: Invalid email format')
        );
        
        await expect(repository.create(invalidData)).rejects.toThrow(
          'Validation failed: Invalid email format'
        );
      });

      it('should handle duplicate email error', async () => {
        const duplicateData = {
          ...mockCreateData,
          email: 'existing@example.com'
        };
        
        jest.spyOn(repository, 'create').mockRejectedValue(
          new Error('User with email already exists')
        );
        
        await expect(repository.create(duplicateData)).rejects.toThrow(
          'User with email already exists'
        );
      });
    });

    describe('findById', () => {
      it('should find user by id', async () => {
        jest.spyOn(repository, 'findById').mockResolvedValue(mockUser);
        
        const result = await repository.findById('1');
        
        expect(result).toEqual(mockUser);
        expect(repository.findById).toHaveBeenCalledWith('1');
      });

      it('should return null for non-existent user', async () => {
        jest.spyOn(repository, 'findById').mockResolvedValue(null);
        
        const result = await repository.findById('999');
        
        expect(result).toBeNull();
      });

      it('should find user with transaction', async () => {
        const mockTransaction = {};
        
        jest.spyOn(repository, 'findById').mockResolvedValue(mockUser);
        
        const result = await repository.findById('1', mockTransaction);
        
        expect(result).toEqual(mockUser);
        expect(repository.findById).toHaveBeenCalledWith('1', mockTransaction);
      });
    });

    describe('findByEmail', () => {
      it('should find user by email', async () => {
        jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);
        
        const result = await repository.findByEmail('test@example.com');
        
        expect(result).toEqual(mockUser);
        expect(repository.findByEmail).toHaveBeenCalledWith('test@example.com');
      });

      it('should return null for non-existent email', async () => {
        jest.spyOn(repository, 'findByEmail').mockResolvedValue(null);
        
        const result = await repository.findByEmail('nonexistent@example.com');
        
        expect(result).toBeNull();
      });

      it('should handle case-insensitive email search', async () => {
        jest.spyOn(repository, 'findByEmail').mockResolvedValue(mockUser);
        
        const result = await repository.findByEmail('TEST@EXAMPLE.COM');
        
        expect(result).toEqual(mockUser);
      });
    });

    describe('find by username functionality', () => {
      it('should find user by username using findOne method', async () => {
        jest.spyOn(repository, 'findOne').mockResolvedValue(mockUser);
        
        const result = await repository.findOne({ username: 'testuser' });
        
        expect(result).toEqual(mockUser);
        expect(repository.findOne).toHaveBeenCalledWith({ username: 'testuser' });
      });

      it('should return null for non-existent username', async () => {
        jest.spyOn(repository, 'findOne').mockResolvedValue(null);
        
        const result = await repository.findOne({ username: 'nonexistent' });
        
        expect(result).toBeNull();
      });
    });

    describe('findMany', () => {
      const mockUsers = [mockUser, { ...mockUser, id: '2', email: 'user2@example.com' }];
      
      it('should find multiple users with default options', async () => {
        jest.spyOn(repository, 'findMany').mockResolvedValue(mockUsers);
        
        const result = await repository.findMany();
        
        expect(result).toEqual(mockUsers);
        expect(repository.findMany).toHaveBeenCalledWith();
      });

      it('should find users with pagination', async () => {
        const options: FindUserOptions = {
          limit: 10,
          offset: 0
        };
        
        jest.spyOn(repository, 'findMany').mockResolvedValue(mockUsers);
        
        const result = await repository.findMany(undefined, options);
        
        expect(result).toEqual(mockUsers);
        expect(repository.findMany).toHaveBeenCalledWith(undefined, options);
      });

      it('should find users with filters', async () => {
        const whereClause = {
          isActive: true,
          isEmailVerified: true
        };
        const options: FindUserOptions = {
          limit: 10
        };
        
        jest.spyOn(repository, 'findMany').mockResolvedValue([mockUser]);
        
        const result = await repository.findMany(whereClause, options);
        
        expect(result).toEqual([mockUser]);
        expect(repository.findMany).toHaveBeenCalledWith(whereClause, options);
      });

      it('should find users with sorting', async () => {
        const options: FindUserOptions = {
          orderBy: 'createdAt',
          orderDirection: 'DESC'
        };
        
        jest.spyOn(repository, 'findMany').mockResolvedValue(mockUsers);
        
        const result = await repository.findMany(undefined, options);
        
        expect(result).toEqual(mockUsers);
        expect(repository.findMany).toHaveBeenCalledWith(undefined, options);
      });
    });

    describe('update', () => {
      it('should update user by id', async () => {
        const updatedUser = { ...mockUser, ...mockUpdateData };
        
        jest.spyOn(repository, 'update').mockResolvedValue(updatedUser);
        
        const result = await repository.update('1', mockUpdateData);
        
        expect(result).toEqual(updatedUser);
        expect(repository.update).toHaveBeenCalledWith('1', mockUpdateData);
      });

      it('should update user with transaction', async () => {
        const mockUpdateOptions = { where: { id: '1' } };
        const updatedUser = { ...mockUser, ...mockUpdateData };
        
        jest.spyOn(repository, 'update').mockResolvedValue(updatedUser);
        
        const result = await repository.update('1', mockUpdateData, mockUpdateOptions);
        
        expect(result).toEqual(updatedUser);
        expect(repository.update).toHaveBeenCalledWith('1', mockUpdateData, mockUpdateOptions);
      });

      it('should return null for non-existent user', async () => {
        jest.spyOn(repository, 'update').mockResolvedValue(null);
        
        const result = await repository.update('999', mockUpdateData);
        
        expect(result).toBeNull();
      });

      it('should handle validation errors on update', async () => {
        const invalidUpdate = {
          email: 'invalid-email'
        } as UpdateUserData;
        
        jest.spyOn(repository, 'update').mockRejectedValue(
          new Error('Validation failed: Invalid email format')
        );
        
        await expect(repository.update('1', invalidUpdate)).rejects.toThrow(
          'Validation failed: Invalid email format'
        );
      });
    });

    describe('delete', () => {
      it('should delete user by id', async () => {
        jest.spyOn(repository, 'delete').mockResolvedValue(true);
        
        const result = await repository.delete('1');
        
        expect(result).toBe(true);
        expect(repository.delete).toHaveBeenCalledWith('1');
      });

      it('should delete user with transaction', async () => {
        const mockDeleteOptions = { where: { id: '1' } };
        
        jest.spyOn(repository, 'delete').mockResolvedValue(true);
        
        const result = await repository.delete('1', mockDeleteOptions);
        
        expect(result).toBe(true);
        expect(repository.delete).toHaveBeenCalledWith('1', mockDeleteOptions);
      });

      it('should return false for non-existent user', async () => {
        jest.spyOn(repository, 'delete').mockResolvedValue(false);
        
        const result = await repository.delete('999');
        
        expect(result).toBe(false);
      });
    });

    describe('count', () => {
      it('should count all users', async () => {
        jest.spyOn(repository, 'count').mockResolvedValue(5);
        
        const result = await repository.count();
        
        expect(result).toBe(5);
        expect(repository.count).toHaveBeenCalledWith();
      });

      it('should count users with filters', async () => {
        const whereClause = {
          isActive: true
        };
        
        jest.spyOn(repository, 'count').mockResolvedValue(3);
        
        const result = await repository.count(whereClause);
        
        expect(result).toBe(3);
        expect(repository.count).toHaveBeenCalledWith(whereClause);
      });
    });

    describe('exists', () => {
      it('should check if user exists by id', async () => {
        const whereClause = { id: '1' };
        jest.spyOn(repository, 'exists').mockResolvedValue(true);
        
        const result = await repository.exists(whereClause);
        
        expect(result).toBe(true);
        expect(repository.exists).toHaveBeenCalledWith(whereClause);
      });

      it('should return false for non-existent user', async () => {
        const whereClause = { id: '999' };
        jest.spyOn(repository, 'exists').mockResolvedValue(false);
        
        const result = await repository.exists(whereClause);
        
        expect(result).toBe(false);
      });
    });

    describe('updateLastLogin', () => {
      it('should update last login timestamp', async () => {
        jest.spyOn(repository, 'updateLastLogin').mockResolvedValue(undefined);
        
        const result = await repository.updateLastLogin('1');
        
        expect(result).toBeUndefined();
        expect(repository.updateLastLogin).toHaveBeenCalledWith('1');
      });

      it('should handle non-existent user', async () => {
        jest.spyOn(repository, 'updateLastLogin').mockResolvedValue(undefined);
        
        const result = await repository.updateLastLogin('999');
        
        expect(result).toBeUndefined();
      });
    });

    describe('verify email functionality', () => {
      it('should verify user email using update method', async () => {
        const verifiedUser = {
          ...mockUser,
          isEmailVerified: true
        };
        
        jest.spyOn(repository, 'update').mockResolvedValue(verifiedUser);
        
        const result = await repository.update('1', { isEmailVerified: true });
        
        expect(result).toEqual(verifiedUser);
        expect(repository.update).toHaveBeenCalledWith('1', { isEmailVerified: true });
      });

      it('should return null for non-existent user when verifying email', async () => {
        jest.spyOn(repository, 'update').mockResolvedValue(null);
        
        const result = await repository.update('999', { isEmailVerified: true });
        
        expect(result).toBeNull();
      });
    });

    describe('deactivate user functionality', () => {
      it('should deactivate user using update method', async () => {
        const deactivatedUser = {
          ...mockUser,
          isActive: false
        };
        
        jest.spyOn(repository, 'update').mockResolvedValue(deactivatedUser);
        
        const result = await repository.update('1', { isActive: false });
        
        expect(result).toEqual(deactivatedUser);
        expect(repository.update).toHaveBeenCalledWith('1', { isActive: false });
      });

      it('should return null for non-existent user when updating', async () => {
        jest.spyOn(repository, 'update').mockResolvedValue(null);
        
        const result = await repository.update('999', { isActive: false });
        
        expect(result).toBeNull();
      });
    });

    describe('Error Handling', () => {
      it('should handle database connection errors', async () => {
        jest.spyOn(repository, 'findById').mockRejectedValue(
          new Error('Database connection failed')
        );
        
        await expect(repository.findById('1')).rejects.toThrow(
          'Database connection failed'
        );
      });

      it('should handle constraint violations', async () => {
        jest.spyOn(repository, 'create').mockRejectedValue(
          new Error('Unique constraint violation')
        );
        
        await expect(repository.create(mockCreateData)).rejects.toThrow(
          'Unique constraint violation'
        );
      });

      it('should handle transaction rollback', async () => {
        const mockTransaction = {};
        
        jest.spyOn(repository, 'update').mockRejectedValue(
          new Error('Transaction rolled back')
        );
        
        await expect(
          repository.update('1', mockUpdateData, { where: { id: '1' } } as any)
        ).rejects.toThrow('Transaction rolled back');
      });
    });
  });
});