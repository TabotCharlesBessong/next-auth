import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { ITokenService, TokenPayload, TokenPair, AuthError, UnauthorizedError } from './types';
import { User } from '../../database/types';

interface RefreshTokenData {
  userId: string;
  tokenId: string;
  expiresAt: Date;
  isRevoked: boolean;
}

interface TokenGenerationPayload {
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export class TokenService implements ITokenService {
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;
  private readonly issuer: string;
  private readonly audience: string;
  
  // In-memory store for refresh tokens (in production, use Redis or database)
  private refreshTokenStore: Map<string, RefreshTokenData> = new Map();

  constructor(config: {
    jwtSecret: string;
    accessTokenExpiry?: string;
    refreshTokenExpiry?: string;
    issuer?: string;
    audience?: string;
  }) {
    this.jwtSecret = config.jwtSecret;
    this.accessTokenExpiry = config.accessTokenExpiry || '15m';
    this.refreshTokenExpiry = config.refreshTokenExpiry || '7d';
    this.issuer = config.issuer || 'next-auth-template';
    this.audience = config.audience || 'next-auth-users';

    if (!this.jwtSecret) {
      throw new Error('JWT secret is required');
    }

    if (this.jwtSecret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters long');
    }
  }

  /**
   * Generate an access token for a user
   * @param user - User object
   * @returns string - JWT access token
   */
  generateAccessToken(user: User): string {
    try {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        userId: user.id,
        email: user.email,
        role: (user as User & { role?: string }).role || 'user',
      };

      const options: jwt.SignOptions = {
        expiresIn: this.accessTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        subject: user.id,
        jwtid: crypto.randomUUID(),
      };
      const token = jwt.sign(payload, this.jwtSecret, options);

      return token;
    } catch (error) {
      throw new AuthError(
        `Failed to generate access token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TOKEN_GENERATION_ERROR',
        500
      );
    }
  }

  /**
   * Generate a refresh token for a user
   * @param user - User object
   * @returns string - Refresh token
   */
  generateRefreshToken(user: User): string {
    try {
      const tokenId = crypto.randomUUID();
      const expiresAt = new Date();
      
      // Calculate expiry date
      const expiryMs = this.parseExpiryToMs(this.refreshTokenExpiry);
      expiresAt.setTime(expiresAt.getTime() + expiryMs);

      // Store refresh token data
      this.refreshTokenStore.set(tokenId, {
        userId: user.id,
        tokenId,
        expiresAt,
        isRevoked: false,
      });

      const payload = {
        userId: user.id,
        tokenId,
        type: 'refresh',
      };

      const options: jwt.SignOptions = {
        expiresIn: this.refreshTokenExpiry,
        issuer: this.issuer,
        audience: this.audience,
        subject: user.id,
        jwtid: tokenId,
      };
      const token = jwt.sign(payload, this.jwtSecret, options);

      return token;
    } catch (error) {
      throw new AuthError(
        `Failed to generate refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TOKEN_GENERATION_ERROR',
        500
      );
    }
  }

  /**
   * Generate both access and refresh tokens for a user
   * @param userId - User ID
   * @param payload - Additional payload data
   * @returns Promise<TokenPair> - Access and refresh tokens
   */
  async generateTokenPair(userId: string, payload: TokenGenerationPayload): Promise<TokenPair> {
    try {
      // Create a user-like object for token generation
      const userForToken = {
        id: userId,
        email: payload.email || '',
        ...payload
      };

      const accessToken = this.generateAccessToken(userForToken as User);
      const refreshToken = this.generateRefreshToken(userForToken as User);

      return {
        accessToken,
        refreshToken
      };
    } catch (error) {
      throw new AuthError(
        `Failed to generate token pair: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TOKEN_GENERATION_ERROR',
        500
      );
    }
  }

  /**
   * Verify and decode a JWT token
   * @param token - JWT token to verify
   * @returns TokenPayload - Decoded token payload
   */
  verifyToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as TokenPayload;

      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      } else if (error instanceof jwt.NotBeforeError) {
        throw new UnauthorizedError('Token not active yet');
      } else {
        throw new UnauthorizedError('Token verification failed');
      }
    }
  }

  /**
   * Verify a refresh token and return its data
   * @param token - Refresh token to verify
   * @returns RefreshTokenData - Token data if valid
   */
  verifyRefreshToken(token: string): RefreshTokenData {
    try {
      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.issuer,
        audience: this.audience,
      }) as jwt.JwtPayload & { type: string; tokenId: string };

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type');
      }

      const tokenData = this.refreshTokenStore.get(decoded.tokenId);
      if (!tokenData) {
        throw new UnauthorizedError('Refresh token not found');
      }

      if (tokenData.isRevoked) {
        throw new UnauthorizedError('Refresh token has been revoked');
      }

      if (tokenData.expiresAt < new Date()) {
        this.refreshTokenStore.delete(decoded.tokenId);
        throw new UnauthorizedError('Refresh token has expired');
      }

      return tokenData;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      } else if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Refresh token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid refresh token');
      } else {
        throw new UnauthorizedError('Refresh token verification failed');
      }
    }
  }

  /**
   * Revoke a token (add to blacklist)
   * @param token - Token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload | null;
      
      if (decoded && typeof decoded === 'object' && decoded.jti) {
        const tokenData = this.refreshTokenStore.get(decoded.jti);
        if (tokenData) {
          tokenData.isRevoked = true;
          this.refreshTokenStore.set(decoded.jti, tokenData);
        }
      }
    } catch (error) {
      // Silently fail for invalid tokens
      console.warn('Failed to revoke token:', error);
    }
  }

  /**
   * Revoke all refresh tokens for a user
   * @param userId - User ID
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    try {
      for (const [tokenId, tokenData] of Array.from(this.refreshTokenStore.entries())) {
        if (tokenData.userId === userId) {
          tokenData.isRevoked = true;
          this.refreshTokenStore.set(tokenId, tokenData);
        }
      }
    } catch (error) {
      throw new AuthError(
        `Failed to revoke user tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TOKEN_REVOCATION_ERROR',
        500
      );
    }
  }

  /**
   * Clean up expired tokens from storage
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      const expiredTokens: string[] = [];

      for (const [tokenId, tokenData] of Array.from(this.refreshTokenStore.entries())) {
        if (tokenData.expiresAt < now) {
          expiredTokens.push(tokenId);
        }
      }

      for (const tokenId of expiredTokens) {
        this.refreshTokenStore.delete(tokenId);
      }

      console.log(`Cleaned up ${expiredTokens.length} expired tokens`);
    } catch (error) {
      console.error('Failed to cleanup expired tokens:', error);
    }
  }

  /**
   * Get token information without verification (for debugging)
   * @param token - JWT token
   * @returns Decoded token payload or null
   */
  decodeToken(token: string): jwt.JwtPayload | string | null {
    try {
      return jwt.decode(token);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Check if a token is expired
   * @param token - JWT token
   * @returns boolean - True if expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload | null;
      if (!decoded || typeof decoded !== 'object' || !decoded.exp) {
        return true;
      }
      
      const now = Math.floor(Date.now() / 1000);
      return decoded.exp < now;
    } catch (_error) {
      return true;
    }
  }

  /**
   * Get token expiry time
   * @param token - JWT token
   * @returns Date - Expiry date or null
   */
  getTokenExpiry(token: string): Date | null {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload | null;
      if (!decoded || typeof decoded !== 'object' || !decoded.exp) {
        return null;
      }
      
      return new Date(decoded.exp * 1000);
    } catch (_error) {
      return null;
    }
  }

  /**
   * Parse expiry string to milliseconds
   * @param expiry - Expiry string (e.g., '15m', '7d', '1h')
   * @returns number - Milliseconds
   */
  private parseExpiryToMs(expiry: string): number {
    const units: { [key: string]: number } = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    const multiplier = units[unit];
    
    if (!multiplier) {
      throw new Error(`Invalid expiry unit: ${unit}`);
    }

    return parseInt(value, 10) * multiplier;
  }

  /**
   * Generate a secure random secret for JWT signing
   * @param length - Length of the secret (default: 64)
   * @returns string - Random secret
   */
  static generateSecret(length: number = 64): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Get refresh token statistics
   * @returns Object with token statistics
   */
  getTokenStats(): {
    totalTokens: number;
    activeTokens: number;
    revokedTokens: number;
    expiredTokens: number;
  } {
    const now = new Date();
    let activeTokens = 0;
    let revokedTokens = 0;
    let expiredTokens = 0;

    for (const tokenData of Array.from(this.refreshTokenStore.values())) {
      if (tokenData.isRevoked) {
        revokedTokens++;
      } else if (tokenData.expiresAt < now) {
        expiredTokens++;
      } else {
        activeTokens++;
      }
    }

    return {
      totalTokens: this.refreshTokenStore.size,
      activeTokens,
      revokedTokens,
      expiredTokens,
    };
  }
}

// Export factory function for creating token service instances
export const createTokenService = (config: {
  jwtSecret: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
  issuer?: string;
  audience?: string;
}): TokenService => {
  return new TokenService(config);
};

// Export default instance (will need to be configured with environment variables)
export const tokenService = new TokenService({
  jwtSecret: process.env.JWT_SECRET || TokenService.generateSecret(),
  accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
  refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '7d',
  issuer: process.env.JWT_ISSUER || 'next-auth-template',
  audience: process.env.JWT_AUDIENCE || 'next-auth-users',
});