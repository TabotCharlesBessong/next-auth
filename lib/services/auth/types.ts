import { User } from '../../database/types';

// Authentication Data Types
export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  [key: string]: unknown; // For custom fields
}

export interface LoginData {
  email: string;
  password: string;
}

// Alias for consistency
export type LoginCredentials = LoginData;

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

// Alias for consistency
export type PasswordResetRequest = PasswordResetData;

export interface EmailVerificationRequest {
  token: string;
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

// Alias for consistency
export interface OAuthUserData extends OAuthUserInfo {
  emailVerified?: boolean;
}

// OAuth Provider type
export type OAuthProvider = 'google' | 'facebook' | 'github';

// User types
export type AuthUser = User;
export type UserProfile = User;
export type UserRole = 'user' | 'admin' | 'moderator';

// Token types
export type TokenData = TokenPayload;
export interface TokenConfig {
  accessTokenSecret: string;
  refreshTokenSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
  issuer?: string;
}

// Email configuration
export interface EmailConfig {
  provider: 'smtp' | 'sendgrid' | 'mailgun';
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  sendgrid?: {
    apiKey: string;
  };
  mailgun?: {
    apiKey: string;
    domain: string;
  };
  from: {
    name: string;
    email: string;
  };
}

// Hash configuration
export interface HashConfig {
  saltRounds: number;
  pepper?: string;
}

// Error types
export type AuthErrorCode = 
  | 'INVALID_CREDENTIALS'
  | 'USER_EXISTS'
  | 'USER_NOT_FOUND'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_TOKEN'
  | 'RATE_LIMIT_EXCEEDED';

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

export type GoogleConfig = OAuthConfig;
export type FacebookConfig = OAuthConfig;
export type GitHubConfig = OAuthConfig;

// Service Interfaces
export interface IAuthService {
  register(userData: RegisterData): Promise<AuthResult>;
  login(credentials: LoginData): Promise<AuthResult>;
  logout(token: string): Promise<void>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
  verifyEmail(token: string): Promise<boolean>;
  requestPasswordReset(request: PasswordResetRequest): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  changePassword(userId: string, data: ChangePasswordData): Promise<void>;
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
  generateTokenPair(userId: string, payload: Partial<TokenPayload>): Promise<TokenPair>;
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
  verifyEmailToken(token: string, type: string): Promise<{ email: string }>;
}

export interface IUserRepository {
  create(userData: RegisterData): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  update(id: string, data: Partial<User>): Promise<User | null>;
  delete(id: string): Promise<void>;
  findByProvider(provider: string, providerId: string): Promise<User | null>;
  findByOAuthId(provider: OAuthProvider, oauthId: string): Promise<User | null>;
  
  // OAuth account management methods
  createOAuthAccount(accountData: { userId: string; provider: string; providerId: string; email?: string; name?: string; avatar?: string; accessToken?: string; refreshToken?: string }): Promise<SocialAccount>;
  findOAuthAccount(provider: string, providerId: string): Promise<SocialAccount | null>;
  getUserOAuthAccounts(userId: string): Promise<SocialAccount[]>;
  deleteOAuthAccount(id: string): Promise<boolean>;
}

// OAuth Provider Interface
export interface IOAuthProvider {
  getAuthUrl(state: string): string;
  exchangeCodeForTokens(code: string): Promise<unknown>;
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