import { AuthService, createAuthService } from '../AuthService';
import { HashService } from '../HashService';
import { TokenService } from '../TokenService';
import { EmailService } from '../EmailService';
import { AuthError } from '../types';

// Mock the database
const mockDatabase = {
  users: new Map(),
  emailVerificationTokens: new Map(),
  passwordResetTokens: new Map(),
  
  async findUserByEmail(email: string) {
    return Array.from(this.users.values()).find((user: any) => user.email === email);
  },
  
  async findUserById(id: string) {
    return this.users.get(id);
  },
  
  async createUser(userData: any) {
    const id = `user_${Date.now()}_${Math.random()}`;
    const user = { id, ...userData, createdAt: new Date(), updatedAt: new Date() };
    this.users.set(id, user);
    return user;
  },
  
  async updateUser(id: string, updates: any) {
    const user = this.users.get(id);
    if (!user) return null;
    
    const updatedUser = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  },
  
  async deleteUser(id: string) {
    return this.users.delete(id);
  },
  
  async storeEmailVerificationToken(userId: string, token: string, expiresAt: Date) {
    this.emailVerificationTokens.set(token, { userId, token, expiresAt });
  },
  
  async getEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.get(token);
  },
  
  async deleteEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.delete(token);
  },
  
  async storePasswordResetToken(userId: string, token: string, expiresAt: Date) {
    this.passwordResetTokens.set(token, { userId, token, expiresAt });
  },
  
  async getPasswordResetToken(token: string) {
    return this.passwordResetTokens.get(token);
  },
  
  async deletePasswordResetToken(token: string) {
    return this.passwordResetTokens.delete(token);
  },
  
  clear() {
    this.users.clear();
    this.emailVerificationTokens.clear();
    this.passwordResetTokens.clear();
  }
};

// Mock environment variables
const mockEnv = {
  JWT_SECRET: 'test-secret-key-for-testing-purposes-only',
  JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing-purposes-only',
  EMAIL_FROM: 'test@example.com',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '587',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
};

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    
    // Clear mock database
    mockDatabase.clear();
    
    // Create auth service with mock database
    authService = createAuthService({
      database: mockDatabase as any,
    });
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await authService.register(userData);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe(userData.email);
      expect(result.user?.firstName).toBe(userData.firstName);
      expect(result.user?.lastName).toBe(userData.lastName);
      expect(result.user?.emailVerified).toBe(false);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
    });

    it('should hash the password before storing', async () => {
      const userData = {
        email: 'test2@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Jane',
        lastName: 'Doe',
      };

      await authService.register(userData);

      const storedUser = await mockDatabase.findUserByEmail(userData.email);
      expect(storedUser.password).not.toBe(userData.password);
      expect(storedUser.password).toMatch(/^\$2b\$/); // bcrypt hash format
    });

    it('should reject registration with existing email', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      await authService.register(userData);

      await expect(authService.register(userData))
        .rejects.toThrow(AuthError);
    });

    it('should reject registration with weak password', async () => {
      const userData = {
        email: 'weak@example.com',
        password: '123',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(authService.register(userData))
        .rejects.toThrow(AuthError);
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      await expect(authService.register(userData))
        .rejects.toThrow(AuthError);
    });

    it('should send email verification when enabled', async () => {
      const userData = {
        email: 'verify@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await authService.register(userData);

      expect(result.emailVerificationSent).toBe(true);
      
      // Check that verification token was stored
      const tokens = Array.from(mockDatabase.emailVerificationTokens.values());
      const userToken = tokens.find((token: any) => token.userId === result.user?.id);
      expect(userToken).toBeDefined();
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      // Create a test user
      await authService.register({
        email: 'login@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('should login with correct credentials', async () => {
      const result = await authService.login({
        email: 'login@example.com',
        password: 'SecureP@ssw0rd123!',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('login@example.com');
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
    });

    it('should reject login with incorrect password', async () => {
      await expect(authService.login({
        email: 'login@example.com',
        password: 'WrongPassword123!',
      })).rejects.toThrow(AuthError);
    });

    it('should reject login with non-existent email', async () => {
      await expect(authService.login({
        email: 'nonexistent@example.com',
        password: 'SecureP@ssw0rd123!',
      })).rejects.toThrow(AuthError);
    });

    it('should update last login timestamp', async () => {
      const userBefore = await mockDatabase.findUserByEmail('login@example.com');
      const lastLoginBefore = userBefore.lastLoginAt;

      await authService.login({
        email: 'login@example.com',
        password: 'SecureP@ssw0rd123!',
      });

      const userAfter = await mockDatabase.findUserByEmail('login@example.com');
      expect(userAfter.lastLoginAt).toBeDefined();
      expect(userAfter.lastLoginAt).not.toBe(lastLoginBefore);
    });

    it('should handle remember me option', async () => {
      const result = await authService.login({
        email: 'login@example.com',
        password: 'SecureP@ssw0rd123!',
        rememberMe: true,
      });

      expect(result.success).toBe(true);
      expect(result.tokens?.refreshToken).toBeDefined();
    });
  });

  describe('logout', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'logout@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      accessToken = registerResult.tokens!.accessToken;
      refreshToken = registerResult.tokens!.refreshToken;
    });

    it('should logout successfully', async () => {
      const result = await authService.logout(accessToken);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Logged out successfully');
    });

    it('should revoke tokens on logout', async () => {
      await authService.logout(accessToken);

      // Tokens should be revoked and invalid
      const tokenService = (authService as any).tokenService;
      const isAccessTokenRevoked = await tokenService.isTokenRevoked(accessToken);
      const isRefreshTokenRevoked = await tokenService.isTokenRevoked(refreshToken);

      expect(isAccessTokenRevoked).toBe(true);
      expect(isRefreshTokenRevoked).toBe(true);
    });

    it('should handle logout with invalid token', async () => {
      const invalidToken = 'invalid.token.here';

      await expect(authService.logout(invalidToken))
        .rejects.toThrow(AuthError);
    });
  });

  describe('refreshToken', () => {
    let refreshToken: string;
    let userId: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'refresh@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      refreshToken = registerResult.tokens!.refreshToken;
      userId = registerResult.user!.id;
    });

    it('should refresh access token successfully', async () => {
      const result = await authService.refreshToken(refreshToken);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBeDefined();
      expect(result.tokens?.refreshToken).toBeDefined();
    });

    it('should reject invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid.refresh.token';

      await expect(authService.refreshToken(invalidRefreshToken))
        .rejects.toThrow(AuthError);
    });

    it('should reject revoked refresh token', async () => {
      // Revoke the refresh token
      const tokenService = (authService as any).tokenService;
      await tokenService.revokeToken(refreshToken);

      await expect(authService.refreshToken(refreshToken))
        .rejects.toThrow(AuthError);
    });
  });

  describe('changePassword', () => {
    let userId: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'changepass@example.com',
        password: 'OldP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      userId = registerResult.user!.id;
    });

    it('should change password successfully', async () => {
      const result = await authService.changePassword(userId, {
        currentPassword: 'OldP@ssw0rd123!',
        newPassword: 'NewP@ssw0rd123!',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password changed successfully');
    });

    it('should verify new password works', async () => {
      await authService.changePassword(userId, {
        currentPassword: 'OldP@ssw0rd123!',
        newPassword: 'NewP@ssw0rd123!',
      });

      // Should be able to login with new password
      const loginResult = await authService.login({
        email: 'changepass@example.com',
        password: 'NewP@ssw0rd123!',
      });

      expect(loginResult.success).toBe(true);
    });

    it('should reject change with incorrect current password', async () => {
      await expect(authService.changePassword(userId, {
        currentPassword: 'WrongP@ssw0rd123!',
        newPassword: 'NewP@ssw0rd123!',
      })).rejects.toThrow(AuthError);
    });

    it('should reject weak new password', async () => {
      await expect(authService.changePassword(userId, {
        currentPassword: 'OldP@ssw0rd123!',
        newPassword: '123',
      })).rejects.toThrow(AuthError);
    });

    it('should reject change for non-existent user', async () => {
      await expect(authService.changePassword('non-existent-user', {
        currentPassword: 'OldP@ssw0rd123!',
        newPassword: 'NewP@ssw0rd123!',
      })).rejects.toThrow(AuthError);
    });

    it('should revoke all user tokens after password change', async () => {
      // Login to get tokens
      const loginResult = await authService.login({
        email: 'changepass@example.com',
        password: 'OldP@ssw0rd123!',
      });

      const accessToken = loginResult.tokens!.accessToken;

      // Change password
      await authService.changePassword(userId, {
        currentPassword: 'OldP@ssw0rd123!',
        newPassword: 'NewP@ssw0rd123!',
      });

      // Old tokens should be revoked
      const tokenService = (authService as any).tokenService;
      const isTokenRevoked = await tokenService.isTokenRevoked(accessToken);
      expect(isTokenRevoked).toBe(true);
    });
  });

  describe('requestPasswordReset', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'reset@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('should request password reset successfully', async () => {
      const result = await authService.requestPasswordReset('reset@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset email sent');
    });

    it('should store password reset token', async () => {
      await authService.requestPasswordReset('reset@example.com');

      const tokens = Array.from(mockDatabase.passwordResetTokens.values());
      expect(tokens.length).toBeGreaterThan(0);

      const user = await mockDatabase.findUserByEmail('reset@example.com');
      const userToken = tokens.find((token: any) => token.userId === user.id);
      expect(userToken).toBeDefined();
    });

    it('should handle password reset for non-existent email', async () => {
      // Should not throw error for security reasons (don't reveal if email exists)
      const result = await authService.requestPasswordReset('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset email sent');
    });
  });

  describe('resetPassword', () => {
    let resetToken: string;

    beforeEach(async () => {
      await authService.register({
        email: 'resetpass@example.com',
        password: 'OldP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      await authService.requestPasswordReset('resetpass@example.com');

      // Get the reset token from the database
      const tokens = Array.from(mockDatabase.passwordResetTokens.values());
      resetToken = tokens[0].token;
    });

    it('should reset password successfully', async () => {
      const result = await authService.resetPassword(resetToken, 'NewP@ssw0rd123!');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset successfully');
    });

    it('should verify new password works after reset', async () => {
      await authService.resetPassword(resetToken, 'NewP@ssw0rd123!');

      // Should be able to login with new password
      const loginResult = await authService.login({
        email: 'resetpass@example.com',
        password: 'NewP@ssw0rd123!',
      });

      expect(loginResult.success).toBe(true);
    });

    it('should reject reset with invalid token', async () => {
      const invalidToken = 'invalid-reset-token';

      await expect(authService.resetPassword(invalidToken, 'NewP@ssw0rd123!'))
        .rejects.toThrow(AuthError);
    });

    it('should reject reset with weak password', async () => {
      await expect(authService.resetPassword(resetToken, '123'))
        .rejects.toThrow(AuthError);
    });

    it('should remove reset token after successful reset', async () => {
      await authService.resetPassword(resetToken, 'NewP@ssw0rd123!');

      const tokenData = mockDatabase.passwordResetTokens.get(resetToken);
      expect(tokenData).toBeUndefined();
    });

    it('should revoke all user tokens after password reset', async () => {
      // Login to get tokens
      const loginResult = await authService.login({
        email: 'resetpass@example.com',
        password: 'OldP@ssw0rd123!',
      });

      const accessToken = loginResult.tokens!.accessToken;

      // Reset password
      await authService.resetPassword(resetToken, 'NewP@ssw0rd123!');

      // Old tokens should be revoked
      const tokenService = (authService as any).tokenService;
      const isTokenRevoked = await tokenService.isTokenRevoked(accessToken);
      expect(isTokenRevoked).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    let verificationToken: string;

    beforeEach(async () => {
      await authService.register({
        email: 'verify@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      // Get the verification token from the database
      const tokens = Array.from(mockDatabase.emailVerificationTokens.values());
      verificationToken = tokens[0].token;
    });

    it('should verify email successfully', async () => {
      const result = await authService.verifyEmail(verificationToken);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
    });

    it('should mark user as email verified', async () => {
      await authService.verifyEmail(verificationToken);

      const user = await mockDatabase.findUserByEmail('verify@example.com');
      expect(user.emailVerified).toBe(true);
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('should reject verification with invalid token', async () => {
      const invalidToken = 'invalid-verification-token';

      await expect(authService.verifyEmail(invalidToken))
        .rejects.toThrow(AuthError);
    });

    it('should remove verification token after successful verification', async () => {
      await authService.verifyEmail(verificationToken);

      const tokenData = mockDatabase.emailVerificationTokens.get(verificationToken);
      expect(tokenData).toBeUndefined();
    });
  });

  describe('resendEmailVerification', () => {
    beforeEach(async () => {
      await authService.register({
        email: 'resend@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });
    });

    it('should resend email verification successfully', async () => {
      const result = await authService.resendEmailVerification('resend@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Verification email sent');
    });

    it('should create new verification token', async () => {
      const tokensBefore = Array.from(mockDatabase.emailVerificationTokens.values());
      const initialCount = tokensBefore.length;

      await authService.resendEmailVerification('resend@example.com');

      const tokensAfter = Array.from(mockDatabase.emailVerificationTokens.values());
      expect(tokensAfter.length).toBeGreaterThan(initialCount);
    });

    it('should handle resend for non-existent email', async () => {
      await expect(authService.resendEmailVerification('nonexistent@example.com'))
        .rejects.toThrow(AuthError);
    });

    it('should handle resend for already verified email', async () => {
      // Verify the email first
      const tokens = Array.from(mockDatabase.emailVerificationTokens.values());
      const verificationToken = tokens[0].token;
      await authService.verifyEmail(verificationToken);

      await expect(authService.resendEmailVerification('resend@example.com'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('updateProfile', () => {
    let userId: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'profile@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      userId = registerResult.user!.id;
    });

    it('should update profile successfully', async () => {
      const updates = {
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '+1234567890',
      };

      const result = await authService.updateProfile(userId, updates);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.firstName).toBe(updates.firstName);
      expect(result.user?.lastName).toBe(updates.lastName);
      expect(result.user?.phone).toBe(updates.phone);
    });

    it('should not allow updating email directly', async () => {
      const updates = {
        email: 'newemail@example.com',
        firstName: 'Jane',
      };

      await expect(authService.updateProfile(userId, updates))
        .rejects.toThrow(AuthError);
    });

    it('should not allow updating password directly', async () => {
      const updates = {
        password: 'NewPassword123!',
        firstName: 'Jane',
      };

      await expect(authService.updateProfile(userId, updates))
        .rejects.toThrow(AuthError);
    });

    it('should handle update for non-existent user', async () => {
      const updates = { firstName: 'Jane' };

      await expect(authService.updateProfile('non-existent-user', updates))
        .rejects.toThrow(AuthError);
    });

    it('should validate profile data', async () => {
      const invalidUpdates = {
        firstName: '<script>alert("xss")</script>',
      };

      await expect(authService.updateProfile(userId, invalidUpdates))
        .rejects.toThrow(AuthError);
    });
  });

  describe('getUserProfile', () => {
    let userId: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'getprofile@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      userId = registerResult.user!.id;
    });

    it('should get user profile successfully', async () => {
      const result = await authService.getUserProfile(userId);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('getprofile@example.com');
      expect(result.user?.firstName).toBe('John');
      expect(result.user?.lastName).toBe('Doe');
      expect(result.user?.password).toBeUndefined(); // Password should not be included
    });

    it('should handle get profile for non-existent user', async () => {
      await expect(authService.getUserProfile('non-existent-user'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('deleteAccount', () => {
    let userId: string;
    let accessToken: string;

    beforeEach(async () => {
      const registerResult = await authService.register({
        email: 'delete@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      userId = registerResult.user!.id;
      accessToken = registerResult.tokens!.accessToken;
    });

    it('should delete account successfully', async () => {
      const result = await authService.deleteAccount(userId, 'SecureP@ssw0rd123!');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Account deleted successfully');
    });

    it('should remove user from database', async () => {
      await authService.deleteAccount(userId, 'SecureP@ssw0rd123!');

      const user = await mockDatabase.findUserById(userId);
      expect(user).toBeUndefined();
    });

    it('should revoke all user tokens on account deletion', async () => {
      await authService.deleteAccount(userId, 'SecureP@ssw0rd123!');

      const tokenService = (authService as any).tokenService;
      const isTokenRevoked = await tokenService.isTokenRevoked(accessToken);
      expect(isTokenRevoked).toBe(true);
    });

    it('should reject deletion with incorrect password', async () => {
      await expect(authService.deleteAccount(userId, 'WrongPassword123!'))
        .rejects.toThrow(AuthError);
    });

    it('should handle deletion for non-existent user', async () => {
      await expect(authService.deleteAccount('non-existent-user', 'SecureP@ssw0rd123!'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database to throw error
      const originalFindUserByEmail = mockDatabase.findUserByEmail;
      mockDatabase.findUserByEmail = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(authService.login({
        email: 'test@example.com',
        password: 'password',
      })).rejects.toThrow();

      // Restore original method
      mockDatabase.findUserByEmail = originalFindUserByEmail;
    });

    it('should handle token service errors gracefully', async () => {
      // Register a user first
      await authService.register({
        email: 'tokentest@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Test',
        lastName: 'User',
      });

      // Mock token service to throw error
      const tokenService = (authService as any).tokenService;
      const originalGenerateAccessToken = tokenService.generateAccessToken;
      tokenService.generateAccessToken = jest.fn().mockRejectedValue(new Error('Token error'));

      await expect(authService.login({
        email: 'tokentest@example.com',
        password: 'SecureP@ssw0rd123!',
      })).rejects.toThrow();

      // Restore original method
      tokenService.generateAccessToken = originalGenerateAccessToken;
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = {
        emailVerification: { enabled: false },
        passwordReset: { enabled: false },
      };

      const customAuthService = createAuthService({
        database: mockDatabase as any,
        ...customConfig,
      });

      expect(customAuthService).toBeDefined();
    });

    it('should handle missing database configuration', () => {
      expect(() => createAuthService({})).toThrow();
    });
  });
});