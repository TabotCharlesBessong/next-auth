import { TokenService, createTokenService } from '../TokenService';
import { AuthError, UnauthorizedError } from '../types';
import { User } from '../../database/types';

// Mock environment variables
const mockEnv = {
  JWT_SECRET: 'test-secret-key-for-testing-purposes-only',
  JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing-purposes-only',
};

// Helper function to create mock users
const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: '123',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  fullName: 'Test User',
  isEmailVerified: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    tokenService = createTokenService({
      jwtSecret: mockEnv.JWT_SECRET,
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d',
      issuer: 'test-issuer'
    });
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid access token', () => {
      const user = createMockUser();
      const token = tokenService.generateAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should generate different tokens for different users', () => {
      const user1 = createMockUser({ id: '123', email: 'test1@example.com' });
      const user2 = createMockUser({ id: '456', email: 'test2@example.com' });

      const token1 = tokenService.generateAccessToken(user1);
      const token2 = tokenService.generateAccessToken(user2);

      expect(token1).not.toBe(token2);
    });

    it('should include custom expiry time', () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token = tokenService.generateAccessToken(user);

      const decoded = tokenService.verifyToken(token);
      expect(decoded.exp).toBeDefined();
    });

    it('should handle minimal user data', () => {
      const user = createMockUser({ id: '123' });
      const token = tokenService.generateAccessToken(user);
      expect(token).toBeDefined();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', async () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token = await tokenService.generateRefreshToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different refresh tokens', async () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token1 = await tokenService.generateRefreshToken(user);
      const token2 = await tokenService.generateRefreshToken(user);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid access token', () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token = tokenService.generateAccessToken(user);
      const decoded = tokenService.verifyToken(token);

      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should verify valid refresh token', async () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token = await tokenService.generateRefreshToken(user);
      const decoded = await tokenService.verifyToken(token, 'refresh');

      expect(decoded.userId).toBe(user.id);
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      
      await expect(tokenService.verifyToken(invalidToken, 'access'))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should reject expired token', async () => {
      // Create a token service with very short expiry
      const shortExpiryTokenService = createTokenService({
        jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
        accessTokenExpiry: '1s',
        refreshTokenExpiry: '7d',
        issuer: 'test-issuer'
      });
      
      const user = createMockUser({ id: '123' });
      const expiredToken = shortExpiryTokenService.generateAccessToken(user);
      
      // Wait a moment to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      expect(() => shortExpiryTokenService.verifyToken(expiredToken))
        .toThrow(AuthError);
    });

    it('should reject token with wrong secret', () => {
      const user = createMockUser({ id: '123' });
      const accessToken = tokenService.generateAccessToken(user);
      
      // Create a different token service with different secret
      const differentTokenService = createTokenService({
        jwtSecret: 'different-secret-that-is-at-least-32-characters-long',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'test-issuer'
      });
      
      expect(() => differentTokenService.verifyToken(accessToken))
        .toThrow(AuthError);
    });

    it('should handle malformed token', async () => {
      const malformedToken = 'not.a.valid.jwt.token';
      
      await expect(tokenService.verifyToken(malformedToken, 'access'))
        .rejects.toThrow(UnauthorizedError);
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify valid refresh token', async () => {
      const user = createMockUser({ id: '123' });
      const refreshToken = tokenService.generateRefreshToken(user);

      const tokenData = tokenService.verifyRefreshToken(refreshToken);

      expect(tokenData).toBeDefined();
      expect(tokenData.userId).toBe(user.id);
      expect(tokenData.isRevoked).toBe(false);
    });

    it('should reject invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid.refresh.token';

      expect(() => tokenService.verifyRefreshToken(invalidRefreshToken))
        .toThrow(AuthError);
    });

    it('should reject expired refresh token', async () => {
      const shortExpiryTokenService = createTokenService({
        jwtSecret: 'test-secret-key-that-is-at-least-32-characters-long',
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '1s',
        issuer: 'test-issuer'
      });
      const user = createMockUser({ id: '123' });
      const expiredRefreshToken = shortExpiryTokenService.generateRefreshToken(user);

      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(() => shortExpiryTokenService.verifyRefreshToken(expiredRefreshToken))
        .toThrow(AuthError);
    });
  });

  describe('revokeToken', () => {
    it('should revoke a refresh token successfully', async () => {
      const user = createMockUser({ id: '123' });
      const refreshToken = tokenService.generateRefreshToken(user);

      // Verify token is valid before revocation
      const tokenData = tokenService.verifyRefreshToken(refreshToken);
      expect(tokenData.isRevoked).toBe(false);

      await tokenService.revokeToken(refreshToken);

      // Token should now be invalid
      expect(() => tokenService.verifyRefreshToken(refreshToken))
        .toThrow(AuthError);
    });

    it('should handle revoking already revoked token', async () => {
      const user = createMockUser({ id: '123' });
      const refreshToken = tokenService.generateRefreshToken(user);

      await tokenService.revokeToken(refreshToken);
      await tokenService.revokeToken(refreshToken); // Revoke again

      expect(() => tokenService.verifyRefreshToken(refreshToken))
        .toThrow(AuthError);
    });

    it('should handle revoking invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      await expect(tokenService.revokeToken(invalidToken)).resolves.not.toThrow();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all refresh tokens for a user', async () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      
      // Generate multiple refresh tokens for the same user
      const refreshToken1 = tokenService.generateRefreshToken(user);
      const refreshToken2 = tokenService.generateRefreshToken(user);
      
      // Verify tokens are valid before revocation
      expect(() => tokenService.verifyRefreshToken(refreshToken1)).not.toThrow();
      expect(() => tokenService.verifyRefreshToken(refreshToken2)).not.toThrow();
      
      await tokenService.revokeAllUserTokens(user.id);
      
      // All refresh tokens should now be invalid
      expect(() => tokenService.verifyRefreshToken(refreshToken1)).toThrow(AuthError);
      expect(() => tokenService.verifyRefreshToken(refreshToken2)).toThrow(AuthError);
    });

    it('should handle revoking tokens for non-existent user', async () => {
      const nonExistentUserId = 'non-existent-user';
      await expect(tokenService.revokeAllUserTokens(nonExistentUserId)).resolves.not.toThrow();
    });
  });



  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens', async () => {
      const user = createMockUser({ id: '123' });
      
      // Generate some tokens with short expiry
      const shortExpiryTokenService = createTokenService({
        jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
        accessTokenExpiry: '1s',
        refreshTokenExpiry: '7d',
        issuer: 'test-issuer'
      });
      const shortLivedToken = shortExpiryTokenService.generateAccessToken(user);
      await tokenService.revokeToken(shortLivedToken);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      await tokenService.cleanupExpiredTokens();
    });

    it('should not clean up non-expired tokens', async () => {
      const user = createMockUser({ id: '123' });
      const refreshToken = tokenService.generateRefreshToken(user);
      await tokenService.revokeToken(refreshToken);
      
      await tokenService.cleanupExpiredTokens();
      
      // The refresh token should still be revoked (not cleaned up since it's not expired)
      expect(() => tokenService.verifyRefreshToken(refreshToken))
        .toThrow(AuthError);
    });
  });

  describe('token utilities', () => {
    it('should decode token information for valid token', () => {
      const user = createMockUser({ id: '123', email: 'test@example.com' });
      const token = tokenService.generateAccessToken(user);
      
      const decoded = tokenService.decodeToken(token);
      
      expect(decoded).toBeTruthy();
      expect(typeof decoded).toBe('object');
      if (decoded && typeof decoded === 'object') {
        expect(decoded.userId).toBe(user.id);
        expect(decoded.email).toBe(user.email);
      }
    });

    it('should check if token is expired', async () => {
      const shortExpiryTokenService = createTokenService({
        jwtSecret: 'test-secret-that-is-at-least-32-characters-long',
        accessTokenExpiry: '1s',
        refreshTokenExpiry: '7d',
        issuer: 'test-issuer'
      });
      
      const user = createMockUser({ id: '123' });
      const token = shortExpiryTokenService.generateAccessToken(user);
      
      // First check that token is not expired immediately
      const isExpiredBefore = shortExpiryTokenService.isTokenExpired(token);
      expect(isExpiredBefore).toBe(false);
      
      // Wait for token to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Now check that token is expired
      const isExpiredAfter = shortExpiryTokenService.isTokenExpired(token);
      expect(isExpiredAfter).toBe(true);
    });

    it('should return null for malformed token decode', () => {
      const malformedToken = 'invalid.token.format';
      
      const decoded = tokenService.decodeToken(malformedToken);
      
      expect(decoded).toBeNull();
    });

    it('should get token expiry date', () => {
      const user = createMockUser({ id: '123' });
      const token = tokenService.generateAccessToken(user);
      
      const expiry = tokenService.getTokenExpiry(token);
      
      expect(expiry).toBeInstanceOf(Date);
      expect(expiry!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = {
        jwtSecret: 'custom-secret-that-is-at-least-32-characters-long',
        accessTokenExpiry: '30m',
        refreshTokenExpiry: '14d',
        issuer: 'custom-issuer',
        audience: 'custom-audience'
      };
      
      const customTokenService = createTokenService(customConfig);
      
      expect(customTokenService).toBeInstanceOf(TokenService);
    });

    it('should use default values for missing optional config', () => {
      const minimalConfig = {
        jwtSecret: 'minimal-secret-that-is-at-least-32-characters-long'
      };
      
      const minimalTokenService = createTokenService(minimalConfig);
      
      expect(minimalTokenService).toBeInstanceOf(TokenService);
    });

    it('should throw error for missing JWT secret', () => {
      expect(() => {
        createTokenService({} as any);
      }).toThrow('JWT secret is required');
    });

    it('should throw error for short JWT secret', () => {
      expect(() => {
        createTokenService({ jwtSecret: 'short' });
      }).toThrow('JWT secret must be at least 32 characters long');
    });
  });

  describe('edge cases', () => {
    it('should handle user with additional data', () => {
      const user = createMockUser({ 
        id: '123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      });
      
      const token = tokenService.generateAccessToken(user);
      const decoded = tokenService.verifyToken(token);
      
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
    });

    it('should handle special characters in user data', () => {
      const user = createMockUser({
        id: '123',
        email: 'josé.maría@example.com',
        firstName: 'José María',
        lastName: 'González'
      });
      
      const token = tokenService.generateAccessToken(user);
      const decoded = tokenService.verifyToken(token);
      
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
    });

    it('should handle concurrent token operations', () => {
      const user = createMockUser({ id: '123' });
      
      // Generate multiple tokens concurrently
      const tokens = Array(10).fill(null).map(() => 
        tokenService.generateAccessToken(user)
      );
      
      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
      
      // All tokens should be valid
      const decodedTokens = tokens.map(token => 
        tokenService.verifyToken(token)
      );
      
      decodedTokens.forEach(decoded => {
        expect(decoded.userId).toBe(user.id);
      });
    });
  });

  describe('security', () => {
    it('should not accept tokens signed with different secret', () => {
      // Create a token with a different service (different secret)
      const differentSecret = 'different-secret-that-is-at-least-32-characters-long';
      
      const differentTokenService = createTokenService({
        jwtSecret: differentSecret,
        accessTokenExpiry: '15m',
        refreshTokenExpiry: '7d',
        issuer: 'test-issuer'
      });
      const user = createMockUser({ id: '123' });
      const tokenFromDifferentService = differentTokenService.generateAccessToken(user);
      
      // Original service should reject the token
      expect(() => tokenService.verifyToken(tokenFromDifferentService))
        .toThrow(AuthError);
    });

    it('should handle token tampering', () => {
      const user = createMockUser({ id: '123' });
      const token = tokenService.generateAccessToken(user);
      
      // Tamper with the token
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: '456' })).toString('base64');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      
      expect(() => tokenService.verifyToken(tamperedToken))
        .toThrow(AuthError);
    });
  });
});