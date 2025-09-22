// Core service exports
export { AuthService, createAuthService } from './AuthService';
export { TokenService, createTokenService } from './TokenService';
export { EmailService, createEmailService, defaultEmailTemplates, createDefaultEmailConfig } from './EmailService';
export { HashService, createHashService, hashService } from './HashService';
export { OAuthService, createOAuthService } from './OAuthService';
export { 
  SecurityService, 
  createSecurityService,
  createDevelopmentSecurityConfig,
  createProductionSecurityConfig,
  createCSRFMiddleware,
  createRateLimitMiddleware
} from './SecurityService';

// Type definitions
export type {
  // Core interfaces
  IAuthService,
  ITokenService,
  IEmailService,
  IHashService,
  IOAuthService,
  IUserRepository,
  
  // Authentication types
  AuthUser,
  AuthResult,
  LoginCredentials,
  RegisterData,
  TokenPair,
  TokenData,
  UserProfile,
  UserRole,
  
  // Request/Response types
  PasswordResetRequest,
  EmailVerificationRequest,
  OAuthProvider,
  OAuthConfig,
  OAuthUserData,
  
  // Configuration types
  AuthConfig,
  TokenConfig,
  EmailConfig,
  HashConfig,
  
  // Error types
  AuthError,
  AuthErrorCode,
} from './types';

// Validation schemas
export {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema,
  profileUpdateSchema,
  oauthCallbackSchema,
  tokenRefreshSchema,
  rateLimitSchema,
  validateRegistration,
  validateLogin,
  validatePasswordReset,
  validateEmailVerification,
  validateProfileUpdate,
  validateOAuthCallback,
  validateTokenRefresh,
} from './validation';

// Utility functions and constants
export const AUTH_CONSTANTS = {
  TOKEN_TYPES: {
    ACCESS: 'access' as const,
    REFRESH: 'refresh' as const,
  },
  USER_ROLES: {
    USER: 'user' as const,
    ADMIN: 'admin' as const,
    MODERATOR: 'moderator' as const,
  },
  OAUTH_PROVIDERS: {
    GOOGLE: 'google' as const,
    FACEBOOK: 'facebook' as const,
    GITHUB: 'github' as const,
  },
  ERROR_CODES: {
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS' as const,
    USER_EXISTS: 'USER_EXISTS' as const,
    USER_NOT_FOUND: 'USER_NOT_FOUND' as const,
    EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED' as const,
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED' as const,
    TOKEN_EXPIRED: 'TOKEN_EXPIRED' as const,
    INVALID_TOKEN: 'INVALID_TOKEN' as const,
    RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED' as const,
  },
} as const;

// Helper functions for creating service instances
export interface AuthServiceFactory {
  userRepository: IUserRepository;
  tokenService?: ITokenService;
  emailService?: IEmailService;
  hashService?: IHashService;
  config?: {
    requireEmailVerification?: boolean;
    enablePasswordReset?: boolean;
    maxLoginAttempts?: number;
    lockoutDuration?: number;
    sessionDuration?: number;
    refreshTokenDuration?: number;
  };
}

/**
 * Factory function to create a complete authentication service setup
 * @param factory - Configuration for creating auth services
 * @returns Complete auth service instance
 */
export const createCompleteAuthService = (factory: AuthServiceFactory): AuthService => {
  // Create default services if not provided
  const hashService = factory.hashService || createHashService();
  const tokenService = factory.tokenService || createTokenService({
    accessTokenSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret',
    refreshTokenSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
    accessTokenExpiry: '1h',
    refreshTokenExpiry: '7d',
    issuer: process.env.JWT_ISSUER || 'next-auth-template',
  });
  const emailService = factory.emailService || createEmailService(createDefaultEmailConfig());

  return createAuthService({
    userRepository: factory.userRepository,
    tokenService,
    emailService,
    hashService,
    options: factory.config,
  });
};

/**
 * Default configuration for development environment
 */
export const createDevelopmentAuthConfig = () => ({
  requireEmailVerification: false,
  enablePasswordReset: true,
  maxLoginAttempts: 10,
  lockoutDuration: 5, // 5 minutes
  sessionDuration: 120, // 2 hours
  refreshTokenDuration: 30, // 30 days
});

/**
 * Default configuration for production environment
 */
export const createProductionAuthConfig = () => ({
  requireEmailVerification: true,
  enablePasswordReset: true,
  maxLoginAttempts: 5,
  lockoutDuration: 15, // 15 minutes
  sessionDuration: 60, // 1 hour
  refreshTokenDuration: 7, // 7 days
});

/**
 * Utility function to validate environment variables
 */
export const validateAuthEnvironment = (): {
  isValid: boolean;
  missingVars: string[];
  warnings: string[];
} => {
  const requiredVars = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
  ];

  const optionalVars = [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM_NAME',
    'EMAIL_FROM_ADDRESS',
    'NEXT_PUBLIC_APP_URL',
  ];

  const missingVars: string[] = [];
  const warnings: string[] = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  // Check optional variables and warn if missing
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      warnings.push(`Optional environment variable ${varName} is not set`);
    }
  }

  return {
    isValid: missingVars.length === 0,
    missingVars,
    warnings,
  };
};

/**
 * Utility function to create auth service with environment validation
 */
export const createAuthServiceWithValidation = (factory: AuthServiceFactory): {
  authService: AuthService;
  environmentStatus: ReturnType<typeof validateAuthEnvironment>;
} => {
  const environmentStatus = validateAuthEnvironment();
  
  if (!environmentStatus.isValid) {
    console.warn('Auth service created with missing environment variables:', environmentStatus.missingVars);
  }

  if (environmentStatus.warnings.length > 0) {
    console.warn('Auth service warnings:', environmentStatus.warnings);
  }

  const authService = createCompleteAuthService(factory);

  return {
    authService,
    environmentStatus,
  };
};

// Re-export error class for convenience
export { AuthError } from './types';