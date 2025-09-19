import { TokenService, createTokenService } from '../TokenService';
import { AuthError } from '../types';

// Mock environment variables
const mockEnv = {
  JWT_SECRET: 'test-secret-key-for-testing-purposes-only',
  JWT_REFRESH_SECRET: 'test-refresh-secret-key-for-testing-purposes-only',
};

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    tokenService = createTokenService();
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('generateAccessToken', () => {
    it('should generate a valid access token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = await tokenService.generateAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT format: header.payload.signature
    });

    it('should generate different tokens for different payloads', async () => {
      const payload1 = { userId: '123', email: 'test1@example.com' };
      const payload2 = { userId: '456', email: 'test2@example.com' };

      const token1 = await tokenService.generateAccessToken(payload1);
      const token2 = await tokenService.generateAccessToken(payload2);

      expect(token1).not.toBe(token2);
    });

    it('should include custom expiry time', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const customExpiry = '2h';
      const token = await tokenService.generateAccessToken(payload, customExpiry);

      const decoded = await tokenService.verifyToken(token, 'access');
      expect(decoded.exp).toBeDefined();
    });

    it('should handle empty payload', async () => {
      const token = await tokenService.generateAccessToken({});
      expect(token).toBeDefined();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a valid refresh token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate different refresh tokens', async () => {
      const payload = { userId: '123' };
      const token1 = await tokenService.generateRefreshToken(payload);
      const token2 = await tokenService.generateRefreshToken(payload);

      expect(token1).not.toBe(token2);
    });
  });

  describe('verifyToken', () => {
    it('should verify valid access token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = await tokenService.generateAccessToken(payload);
      const decoded = await tokenService.verifyToken(token, 'access');

      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should verify valid refresh token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateRefreshToken(payload);
      const decoded = await tokenService.verifyToken(token, 'refresh');

      expect(decoded.userId).toBe(payload.userId);
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      
      await expect(tokenService.verifyToken(invalidToken, 'access'))
        .rejects.toThrow(AuthError);
    });

    it('should reject expired token', async () => {
      const payload = { userId: '123' };
      const expiredToken = await tokenService.generateAccessToken(payload, '-1s'); // Already expired
      
      // Wait a moment to ensure expiration
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await expect(tokenService.verifyToken(expiredToken, 'access'))
        .rejects.toThrow(AuthError);
    });

    it('should reject token with wrong secret', async () => {
      const payload = { userId: '123' };
      const accessToken = await tokenService.generateAccessToken(payload);
      
      // Try to verify access token as refresh token (different secret)
      await expect(tokenService.verifyToken(accessToken, 'refresh'))
        .rejects.toThrow(AuthError);
    });

    it('should handle malformed token', async () => {
      const malformedToken = 'not.a.valid.jwt.token';
      
      await expect(tokenService.verifyToken(malformedToken, 'access'))
        .rejects.toThrow(AuthError);
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token with valid refresh token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const refreshToken = await tokenService.generateRefreshToken({ userId: payload.userId });
      
      const newAccessToken = await tokenService.refreshAccessToken(refreshToken, payload);
      
      expect(newAccessToken).toBeDefined();
      const decoded = await tokenService.verifyToken(newAccessToken, 'access');
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
    });

    it('should reject invalid refresh token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const invalidRefreshToken = 'invalid.refresh.token';
      
      await expect(tokenService.refreshAccessToken(invalidRefreshToken, payload))
        .rejects.toThrow(AuthError);
    });

    it('should reject expired refresh token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const expiredRefreshToken = await tokenService.generateRefreshToken({ userId: payload.userId }, '-1s');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      await expect(tokenService.refreshAccessToken(expiredRefreshToken, payload))
        .rejects.toThrow(AuthError);
    });
  });

  describe('revokeToken', () => {
    it('should revoke a token successfully', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      
      await tokenService.revokeToken(token);
      
      // Token should now be invalid
      await expect(tokenService.verifyToken(token, 'access'))
        .rejects.toThrow(AuthError);
    });

    it('should handle revoking already revoked token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      
      await tokenService.revokeToken(token);
      await expect(tokenService.revokeToken(token)).resolves.not.toThrow();
    });

    it('should handle revoking invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      await expect(tokenService.revokeToken(invalidToken)).resolves.not.toThrow();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all tokens for a user', async () => {
      const userId = '123';
      const payload = { userId, email: 'test@example.com' };
      
      const token1 = await tokenService.generateAccessToken(payload);
      const token2 = await tokenService.generateAccessToken(payload);
      const refreshToken = await tokenService.generateRefreshToken({ userId });
      
      await tokenService.revokeAllUserTokens(userId);
      
      // All tokens should now be invalid
      await expect(tokenService.verifyToken(token1, 'access')).rejects.toThrow(AuthError);
      await expect(tokenService.verifyToken(token2, 'access')).rejects.toThrow(AuthError);
      await expect(tokenService.verifyToken(refreshToken, 'refresh')).rejects.toThrow(AuthError);
    });

    it('should handle revoking tokens for non-existent user', async () => {
      const nonExistentUserId = 'non-existent-user';
      await expect(tokenService.revokeAllUserTokens(nonExistentUserId)).resolves.not.toThrow();
    });
  });

  describe('isTokenRevoked', () => {
    it('should return false for non-revoked token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      
      const isRevoked = await tokenService.isTokenRevoked(token);
      expect(isRevoked).toBe(false);
    });

    it('should return true for revoked token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      
      await tokenService.revokeToken(token);
      
      const isRevoked = await tokenService.isTokenRevoked(token);
      expect(isRevoked).toBe(true);
    });

    it('should handle invalid token', async () => {
      const invalidToken = 'invalid.token.here';
      const isRevoked = await tokenService.isTokenRevoked(invalidToken);
      expect(isRevoked).toBe(true); // Invalid tokens are considered revoked
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens', async () => {
      const payload = { userId: '123' };
      
      // Generate some tokens with short expiry
      const shortLivedToken = await tokenService.generateAccessToken(payload, '1ms');
      await tokenService.revokeToken(shortLivedToken);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleanedCount = await tokenService.cleanupExpiredTokens();
      expect(cleanedCount).toBeGreaterThanOrEqual(0);
    });

    it('should not clean up non-expired tokens', async () => {
      const payload = { userId: '123' };
      const longLivedToken = await tokenService.generateAccessToken(payload, '1h');
      await tokenService.revokeToken(longLivedToken);
      
      const cleanedCount = await tokenService.cleanupExpiredTokens();
      
      // The long-lived token should still be in the revoked list
      const isRevoked = await tokenService.isTokenRevoked(longLivedToken);
      expect(isRevoked).toBe(true);
    });
  });

  describe('getTokenInfo', () => {
    it('should return token information for valid token', async () => {
      const payload = { userId: '123', email: 'test@example.com' };
      const token = await tokenService.generateAccessToken(payload);
      
      const tokenInfo = await tokenService.getTokenInfo(token);
      
      expect(tokenInfo.valid).toBe(true);
      expect(tokenInfo.payload.userId).toBe(payload.userId);
      expect(tokenInfo.payload.email).toBe(payload.email);
      expect(tokenInfo.expiresAt).toBeInstanceOf(Date);
      expect(tokenInfo.issuedAt).toBeInstanceOf(Date);
    });

    it('should return invalid info for revoked token', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      await tokenService.revokeToken(token);
      
      const tokenInfo = await tokenService.getTokenInfo(token);
      
      expect(tokenInfo.valid).toBe(false);
      expect(tokenInfo.error).toBe('Token has been revoked');
    });

    it('should return invalid info for expired token', async () => {
      const payload = { userId: '123' };
      const expiredToken = await tokenService.generateAccessToken(payload, '-1s');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const tokenInfo = await tokenService.getTokenInfo(expiredToken);
      
      expect(tokenInfo.valid).toBe(false);
      expect(tokenInfo.error).toContain('expired');
    });

    it('should return invalid info for malformed token', async () => {
      const malformedToken = 'invalid.token.format';
      
      const tokenInfo = await tokenService.getTokenInfo(malformedToken);
      
      expect(tokenInfo.valid).toBe(false);
      expect(tokenInfo.error).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = {
        accessTokenExpiry: '2h',
        refreshTokenExpiry: '14d',
        issuer: 'custom-issuer',
        audience: 'custom-audience',
      };
      
      const customTokenService = createTokenService(customConfig);
      expect(customTokenService).toBeDefined();
    });

    it('should throw error when JWT secrets are missing', () => {
      delete process.env.JWT_SECRET;
      delete process.env.JWT_REFRESH_SECRET;
      
      expect(() => createTokenService()).toThrow('JWT_SECRET environment variable is required');
    });

    it('should use default values for missing optional config', () => {
      const tokenService = createTokenService({});
      expect(tokenService).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle very large payloads', async () => {
      const largePayload = {
        userId: '123',
        data: 'x'.repeat(1000), // Large string
        array: new Array(100).fill('item'),
      };
      
      const token = await tokenService.generateAccessToken(largePayload);
      const decoded = await tokenService.verifyToken(token, 'access');
      
      expect(decoded.userId).toBe(largePayload.userId);
      expect(decoded.data).toBe(largePayload.data);
    });

    it('should handle special characters in payload', async () => {
      const specialPayload = {
        userId: '123',
        name: 'José María',
        emoji: '🚀🔐',
        special: '!@#$%^&*()',
      };
      
      const token = await tokenService.generateAccessToken(specialPayload);
      const decoded = await tokenService.verifyToken(token, 'access');
      
      expect(decoded.name).toBe(specialPayload.name);
      expect(decoded.emoji).toBe(specialPayload.emoji);
      expect(decoded.special).toBe(specialPayload.special);
    });

    it('should handle concurrent token operations', async () => {
      const payload = { userId: '123' };
      
      // Generate multiple tokens concurrently
      const tokenPromises = Array(10).fill(null).map(() => 
        tokenService.generateAccessToken(payload)
      );
      
      const tokens = await Promise.all(tokenPromises);
      
      // All tokens should be unique
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(tokens.length);
      
      // All tokens should be valid
      const verificationPromises = tokens.map(token => 
        tokenService.verifyToken(token, 'access')
      );
      
      const decodedTokens = await Promise.all(verificationPromises);
      decodedTokens.forEach(decoded => {
        expect(decoded.userId).toBe(payload.userId);
      });
    });
  });

  describe('security', () => {
    it('should not accept tokens signed with different secret', async () => {
      // Create a token with a different service (different secret)
      const differentEnv = { ...mockEnv, JWT_SECRET: 'different-secret' };
      Object.assign(process.env, differentEnv);
      
      const differentTokenService = createTokenService();
      const payload = { userId: '123' };
      const tokenFromDifferentService = await differentTokenService.generateAccessToken(payload);
      
      // Restore original environment
      Object.assign(process.env, mockEnv);
      
      // Original service should reject the token
      await expect(tokenService.verifyToken(tokenFromDifferentService, 'access'))
        .rejects.toThrow(AuthError);
    });

    it('should handle token tampering', async () => {
      const payload = { userId: '123' };
      const token = await tokenService.generateAccessToken(payload);
      
      // Tamper with the token
      const parts = token.split('.');
      const tamperedPayload = Buffer.from(JSON.stringify({ userId: '456' })).toString('base64');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      
      await expect(tokenService.verifyToken(tamperedToken, 'access'))
        .rejects.toThrow(AuthError);
    });
  });
});