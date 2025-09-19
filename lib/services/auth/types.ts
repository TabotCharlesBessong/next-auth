import { User } from '../../database/types';

// Authentication Data Types
export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  [key: string]: any; // For custom fields
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role?: string;
  iat: number;
  exp: number;
}

export interface PasswordResetData {
  email: string;
}

export interface ChangePasswordData {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

export interface EmailVerificationData {
  token: string;
}

// OAuth Types
export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  provider: string;
}

export interface SocialAccount {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope?: string[];
}

export interface GoogleConfig extends OAuthConfig {}
export interface FacebookConfig extends OAuthConfig {}
export interface GitHubConfig extends OAuthConfig {}

// Service Interfaces
export interface IAuthService {
  register(userData: RegisterData): Promise<AuthResult>;
  login(credentials: LoginData): Promise<AuthResult>;
  logout(token: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
  verifyEmail(token: string): Promise<boolean>;
  resetPassword(email: string): Promise<void>;
  changePassword(data: ChangePasswordData): Promise<void>;
  validateToken(token: string): Promise<TokenPayload>;
}

export interface IOAuthService {
  getAuthUrl(provider: string, state: string): string;
  handleCallback(provider: string, code: string, state: string): Promise<AuthResult>;
  linkAccount(userId: string, provider: string, code: string): Promise<SocialAccount>;
  unlinkAccount(userId: string, provider: string): Promise<void>;
}

export interface ITokenService {
  generateAccessToken(user: User): string;
  generateRefreshToken(user: User): string;
  verifyToken(token: string): TokenPayload;
  revokeToken(token: string): Promise<void>;
  cleanupExpiredTokens(): Promise<void>;
}

export interface IHashService {
  hashPassword(password: string): Promise<string>;
  comparePassword(password: string, hash: string): Promise<boolean>;
  generateSalt(rounds?: number): Promise<string>;
}

export interface IEmailService {
  sendVerificationEmail(email: string, token: string): Promise<void>;
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

// OAuth Provider Interface
export interface IOAuthProvider {
  getAuthUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<any>;
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;
}

// Configuration Types
export interface AuthConfig {
  jwt: {
    secret: string;
    accessTokenExpiry: string;
    refreshTokenExpiry: string;
  };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    saltRounds: number;
  };
  email: {
    verification: {
      enabled: boolean;
      tokenExpiry: string;
    };
    passwordReset: {
      tokenExpiry: string;
    };
  };
  oauth: {
    google?: GoogleConfig;
    facebook?: FacebookConfig;
    github?: GitHubConfig;
  };
  security: {
    rateLimiting: {
      enabled: boolean;
      maxAttempts: number;
      windowMs: number;
    };
    csrf: {
      enabled: boolean;
    };
  };
}

// Error Types
export class AuthError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends AuthError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AuthError {
  constructor(message: string = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AuthError {
  constructor(message: string = 'Not Found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AuthError {
  constructor(message: string = 'Conflict') {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AuthError {
  constructor(message: string = 'Too Many Requests') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}