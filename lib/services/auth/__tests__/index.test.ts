import {
  AuthService,
  TokenService,
  EmailService,
  HashService,
  OAuthService,
  SecurityService,
  createAuthService,
  createTokenService,
  createEmailService,
  createHashService,
  createOAuthService,
  createSecurityService,
  validateEnvironment,
  getEnvironmentConfig,
  createDefaultEmailConfig,
  IUserRepository,
  ITokenService,
  IEmailService,
  IHashService,
  OAuthProvider,
  OAuthConfig,
} from '../index';
import { User } from '../../../database/types';

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
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  FACEBOOK_APP_ID: 'test-facebook-app-id',
  FACEBOOK_APP_SECRET: 'test-facebook-app-secret',
  GITHUB_CLIENT_ID: 'test-github-client-id',
  GITHUB_CLIENT_SECRET: 'test-github-client-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
  CSRF_SECRET: 'test-csrf-secret-key',
};

// Mock database
const mockDatabase = {
  users: new Map<string, User>(),
  emailVerificationTokens: new Map<string, { userId: string; expiresAt: Date }>(),
  passwordResetTokens: new Map<string, { userId: string; expiresAt: Date }>(),
  oauthAccounts: new Map<string, { id: string; userId: string; provider: string; providerId: string }>(),
  oauthStates: new Map<string, { provider: string; redirectUri: string }>(),
  revokedTokens: new Set<string>(),
  rateLimitData: new Map<string, { count: number; resetTime: number }>(),
  
  async findUserByEmail(email: string): Promise<User | null> {
    return Array.from(this.users.values()).find((user: User) => user.email === email) || null;
  },
  
  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  },
  
  async createUser(userData: Partial<User>): Promise<User> {
    const id = `user_${Date.now()}_${Math.random()}`;
    const user: User = { 
      id, 
      ...userData, 
      createdAt: new Date(), 
      updatedAt: new Date(),
      emailVerified: false,
      role: 'user'
    };
    this.users.set(id, user);
    return user;
  },
  
  async updateUser(id: string, updates: Partial<User>): Promise<User | null> {
    const user = this.users.get(id);
    if (!user) return null;
    
    const updatedUser: User = { ...user, ...updates, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  },
  
  async deleteUser(id: string): Promise<void> {
    this.users.delete(id);
  },
  
  async findUserByProvider(provider: string, providerId: string): Promise<User | null> {
    return Array.from(this.users.values()).find((user: User) => 
      user.oauthAccounts?.[provider]?.id === providerId
    ) || null;
  },
  
  async findUserByOAuthId(provider: string, oauthId: string): Promise<User | null> {
    return Array.from(this.users.values()).find((user: User) => 
      user.oauthAccounts?.[provider]?.id === oauthId
    ) || null;
  },
  
  // Email verification methods
  async storeEmailVerificationToken(userId: string, token: string, expiresAt: Date) {
    this.emailVerificationTokens.set(token, { userId, token, expiresAt });
  },
  
  async getEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.get(token);
  },
  
  async deleteEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.delete(token);
  },
  
  // Password reset methods
  async storePasswordResetToken(userId: string, token: string, expiresAt: Date) {
    this.passwordResetTokens.set(token, { userId, token, expiresAt });
  },
  
  async getPasswordResetToken(token: string) {
    return this.passwordResetTokens.get(token);
  },
  
  async deletePasswordResetToken(token: string) {
    return this.passwordResetTokens.delete(token);
  },
  
  // OAuth methods
  async findOAuthAccount(provider: string, providerId: string) {
    return Array.from(this.oauthAccounts.values()).find((account) => 
      account.provider === provider && account.providerId === providerId
    );
  },
  
  async createOAuthAccount(accountData: { userId: string; provider: string; providerId: string }) {
    const id = `oauth_${Date.now()}_${Math.random()}`;
    const account = { id, ...accountData, createdAt: new Date(), updatedAt: new Date() };
    this.oauthAccounts.set(id, account);
    return account;
  },
  
  async updateOAuthAccount(id: string, updates: Partial<{ userId: string; provider: string; providerId: string }>) {
    const account = this.oauthAccounts.get(id);
    if (!account) return null;
    
    const updatedAccount = { ...account, ...updates, updatedAt: new Date() };
    this.oauthAccounts.set(id, updatedAccount);
    return updatedAccount;
  },
  
  async deleteOAuthAccount(id: string) {
    return this.oauthAccounts.delete(id);
  },
  
  async getUserOAuthAccounts(userId: string) {
    return Array.from(this.oauthAccounts.values()).filter((account) => 
      account.userId === userId
    );
  },
  
  async storeOAuthState(state: string, data: { provider: string; redirectUri: string }) {
    this.oauthStates.set(state, { ...data, createdAt: new Date() });
  },
  
  async getOAuthState(state: string) {
    return this.oauthStates.get(state);
  },
  
  async deleteOAuthState(state: string) {
    return this.oauthStates.delete(state);
  },
  
  // Token revocation methods
  async revokeToken(tokenId: string) {
    this.revokedTokens.add(tokenId);
  },
  
  async isTokenRevoked(tokenId: string) {
    return this.revokedTokens.has(tokenId);
  },
  
  async revokeAllUserTokens(userId: string) {
    // In a real implementation, this would revoke all tokens for a user
    // For testing, we'll just add a marker
    this.revokedTokens.add(`user_${userId}_all`);
  },
  
  async cleanupRevokedTokens() {
    // In a real implementation, this would clean up expired revoked tokens
    return { cleanedCount: 0 }; // Mock cleanup
  },
  
  // Rate limiting methods
  async getRateLimitData(key: string) {
    return this.rateLimitData.get(key);
  },
  
  async setRateLimitData(key: string, data: { count: number; resetTime: number }) {
    this.rateLimitData.set(key, data);
  },
  
  async deleteRateLimitData(key: string) {
    return this.rateLimitData.delete(key);
  },
  
  clear() {
    this.users.clear();
    this.emailVerificationTokens.clear();
    this.passwordResetTokens.clear();
    this.oauthAccounts.clear();
    this.oauthStates.clear();
    this.revokedTokens.clear();
    this.rateLimitData.clear();
  }
};

// Create mock user repository
const createMockUserRepository = (): IUserRepository => ({
  create: mockDatabase.createUser.bind(mockDatabase),
  findById: mockDatabase.findUserById.bind(mockDatabase),
  findByEmail: mockDatabase.findUserByEmail.bind(mockDatabase),
  update: mockDatabase.updateUser.bind(mockDatabase),
  delete: mockDatabase.deleteUser.bind(mockDatabase),
  findByProvider: mockDatabase.findUserByProvider.bind(mockDatabase),
  findByOAuthId: mockDatabase.findUserByOAuthId.bind(mockDatabase)
});

// Create mock token service
const createMockTokenService = (): ITokenService => {
  const tokenService = createTokenService({
    jwtSecret: 'test-secret-key-for-testing-purposes-only',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    issuer: 'test-issuer',
    audience: 'test-audience'
  });
  
  return {
    generateAccessToken: tokenService.generateAccessToken.bind(tokenService),
    generateRefreshToken: tokenService.generateRefreshToken.bind(tokenService),
    generateTokenPair: tokenService.generateTokenPair.bind(tokenService),
    verifyToken: tokenService.verifyToken.bind(tokenService),
    revokeToken: tokenService.revokeToken.bind(tokenService),
    cleanupExpiredTokens: tokenService.cleanupExpiredTokens.bind(tokenService)
  };
};

// Create mock email service
const createMockEmailService = (): IEmailService => {
  const emailService = createEmailService(createDefaultEmailConfig());
  
  return {
    sendVerificationEmail: emailService.sendVerificationEmail.bind(emailService),
    sendPasswordResetEmail: emailService.sendPasswordResetEmail.bind(emailService),
    sendWelcomeEmail: emailService.sendWelcomeEmail.bind(emailService),
    verifyEmailToken: emailService.verifyEmailToken.bind(emailService)
  };
};

// Create mock hash service
const createMockHashService = (): IHashService => {
  const hashService = createHashService();
  
  return {
    hashPassword: hashService.hashPassword.bind(hashService),
    comparePassword: hashService.comparePassword.bind(hashService),
    generateSalt: hashService.generateSalt.bind(hashService)
  };
};

// Create mock OAuth configs
const createMockOAuthConfigs = (): Record<OAuthProvider, OAuthConfig> => ({
  google: {
    clientId: 'test-google-client-id',
    clientSecret: 'test-google-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback/google',
    scope: ['openid', 'profile', 'email']
  },
  facebook: {
    clientId: 'test-facebook-app-id',
    clientSecret: 'test-facebook-app-secret',
    redirectUri: 'http://localhost:3000/auth/callback/facebook',
    scope: ['email', 'public_profile']
  },
  github: {
    clientId: 'test-github-client-id',
    clientSecret: 'test-github-client-secret',
    redirectUri: 'http://localhost:3000/auth/callback/github',
    scope: ['user:email']
  }
});

describe('Auth Services Integration', () => {
  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    
    // Clear mock database
    mockDatabase.clear();
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('Service Exports', () => {
    it('should export all service classes', () => {
      expect(AuthService).toBeDefined();
      expect(TokenService).toBeDefined();
      expect(EmailService).toBeDefined();
      expect(HashService).toBeDefined();
      expect(OAuthService).toBeDefined();
      expect(SecurityService).toBeDefined();
    });

    it('should export all factory functions', () => {
      expect(createAuthService).toBeDefined();
      expect(createTokenService).toBeDefined();
      expect(createEmailService).toBeDefined();
      expect(createHashService).toBeDefined();
      expect(createOAuthService).toBeDefined();
      expect(createSecurityService).toBeDefined();
    });

    it('should export utility functions', () => {
      expect(validateEnvironment).toBeDefined();
      expect(getEnvironmentConfig).toBeDefined();
    });
  });

  describe('Environment Validation', () => {
    it('should validate complete environment successfully', () => {
      const result = validateEnvironment();
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required variables', () => {
      delete process.env.JWT_SECRET;
      delete process.env.EMAIL_FROM;
      
      const result = validateEnvironment();
      
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(error => error.includes('JWT_SECRET'))).toBe(true);
      expect(result.errors.some(error => error.includes('EMAIL_FROM'))).toBe(true);
    });

    it('should detect missing OAuth configuration', () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.FACEBOOK_APP_ID;
      
      const result = validateEnvironment();
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(warning => warning.includes('Google'))).toBe(true);
      expect(result.warnings.some(warning => warning.includes('Facebook'))).toBe(true);
    });

    it('should provide helpful error messages', () => {
      delete process.env.JWT_SECRET;
      
      const result = validateEnvironment();
      
      expect(result.errors[0]).toContain('JWT_SECRET');
      expect(result.errors[0]).toContain('required');
    });
  });

  describe('Environment Configuration', () => {
    it('should get environment configuration', () => {
      const config = getEnvironmentConfig();
      
      expect(config.jwt.secret).toBe(mockEnv.JWT_SECRET);
      expect(config.jwt.refreshSecret).toBe(mockEnv.JWT_REFRESH_SECRET);
      expect(config.email.from).toBe(mockEnv.EMAIL_FROM);
      expect(config.email.provider).toBe(mockEnv.EMAIL_PROVIDER);
      expect(config.oauth.google.clientId).toBe(mockEnv.GOOGLE_CLIENT_ID);
    });

    it('should handle missing optional configuration', () => {
      delete process.env.FACEBOOK_APP_ID;
      delete process.env.GITHUB_CLIENT_ID;
      
      const config = getEnvironmentConfig();
      
      expect(config.oauth.facebook.clientId).toBeUndefined();
      expect(config.oauth.github.clientId).toBeUndefined();
      expect(config.oauth.google.clientId).toBe(mockEnv.GOOGLE_CLIENT_ID);
    });

    it('should provide default values', () => {
      delete process.env.JWT_EXPIRES_IN;
      delete process.env.JWT_REFRESH_EXPIRES_IN;
      
      const config = getEnvironmentConfig();
      
      expect(config.jwt.expiresIn).toBe('15m'); // Default value
      expect(config.jwt.refreshExpiresIn).toBe('7d'); // Default value
    });
  });

  describe('Service Factory Functions', () => {
    it('should create AuthService with dependencies', () => {
      const authService = createAuthService({
        userRepository: createMockUserRepository(),
        tokenService: createMockTokenService(),
        emailService: createMockEmailService(),
        hashService: createMockHashService(),
        options: {
          jwtSecret: 'test-secret',
          jwtRefreshSecret: 'test-refresh-secret',
          jwtExpiresIn: '1h',
          jwtRefreshExpiresIn: '7d',
          emailVerificationExpiresIn: '24h',
          passwordResetExpiresIn: '1h',
          maxLoginAttempts: 5,
          lockoutDuration: '15m',
          enableEmailVerification: true,
          enablePasswordReset: true,
          enableAccountLocking: true
        }
      });
      
      expect(authService).toBeInstanceOf(AuthService);
    });

    it('should create TokenService independently', () => {
      const tokenService = createTokenService();
      
      expect(tokenService).toBeInstanceOf(TokenService);
    });

    it('should create EmailService with database', () => {
      const emailService = createEmailService({
        emailConfig: createDefaultEmailConfig(),
        userRepository: createMockUserRepository()
      });
      
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should create HashService independently', () => {
      const hashService = createHashService();
      
      expect(hashService).toBeInstanceOf(HashService);
    });

    it('should create OAuthService with database', () => {
      const oauthService = createOAuthService({
        userRepository: createMockUserRepository(),
        tokenService: createMockTokenService(),
        configs: createMockOAuthConfigs()
      });
      
      expect(oauthService).toBeInstanceOf(OAuthService);
    });

    it('should create SecurityService with database', () => {
      const securityService = createSecurityService({
        userRepository: createMockUserRepository(),
        options: {
          csrfSecret: 'test-csrf-secret',
          enableCSRF: true,
          enableRateLimit: true,
          rateLimitWindow: '15m',
          rateLimitMax: 100,
          enableBruteForceProtection: true,
          maxFailedAttempts: 5,
          lockoutDuration: '15m'
        }
      });
      
      expect(securityService).toBeInstanceOf(SecurityService);
    });
  });

  describe('Service Integration', () => {
    let authService: AuthService;
    let tokenService: TokenService;
    let hashService: HashService;
    let securityService: SecurityService;

    beforeEach(() => {
      tokenService = createTokenService();
      hashService = createHashService();
      
      authService = createAuthService({
        userRepository: createMockUserRepository(),
        tokenService,
        emailService: createMockEmailService(),
        hashService,
        options: {
          jwtSecret: 'test-secret',
          jwtRefreshSecret: 'test-refresh-secret',
          jwtExpiresIn: '1h',
          jwtRefreshExpiresIn: '7d',
          emailVerificationExpiresIn: '24h',
          passwordResetExpiresIn: '1h',
          maxLoginAttempts: 5,
          lockoutDuration: '15m',
          enableEmailVerification: true,
          enablePasswordReset: true,
          enableAccountLocking: true
        }
      });
      
      emailService = createEmailService({
        emailConfig: createDefaultEmailConfig(),
        userRepository: createMockUserRepository()
      });
      
      oauthService = createOAuthService({
        userRepository: createMockUserRepository(),
        tokenService,
        configs: createMockOAuthConfigs()
      });
      
      securityService = createSecurityService({
        userRepository: createMockUserRepository(),
        options: {
          csrfSecret: 'test-csrf-secret',
          enableCSRF: true,
          enableRateLimit: true,
          rateLimitWindow: '15m',
          rateLimitMax: 100,
          enableBruteForceProtection: true,
          maxFailedAttempts: 5,
          lockoutDuration: '15m'
        }
      });
    });

    it('should complete full registration flow', async () => {
      const userData = {
        email: 'integration@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Integration',
        lastName: 'Test',
      };

      // Register user
      const registerResult = await authService.register(userData);
      expect(registerResult.success).toBe(true);
      expect(registerResult.user).toBeDefined();
      expect(registerResult.tokens).toBeDefined();

      // Verify password was hashed
      const storedUser = await mockDatabase.findUserByEmail(userData.email);
      expect(storedUser.password).not.toBe(userData.password);
      
      // Verify password hash
      const isValidPassword = await hashService.comparePassword(userData.password, storedUser.password);
      expect(isValidPassword).toBe(true);

      // Verify tokens are valid
      const tokenPayload = await tokenService.verifyAccessToken(registerResult.tokens!.accessToken);
      expect(tokenPayload.userId).toBe(registerResult.user!.id);
    });

    it('should complete full login flow', async () => {
      // First register a user
      const userData = {
        email: 'login@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Login',
        lastName: 'Test',
      };

      await authService.register(userData);

      // Then login
      const loginResult = await authService.login({
        email: userData.email,
        password: userData.password,
      });

      expect(loginResult.success).toBe(true);
      expect(loginResult.user).toBeDefined();
      expect(loginResult.tokens).toBeDefined();

      // Verify token is valid
      const tokenPayload = await tokenService.verifyAccessToken(loginResult.tokens!.accessToken);
      expect(tokenPayload.userId).toBe(loginResult.user!.id);
    });

    it('should complete email verification flow', async () => {
      // Register user
      const userData = {
        email: 'verify@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Verify',
        lastName: 'Test',
      };

      const registerResult = await authService.register(userData);
      
      // Get verification token from database
      const tokens = Array.from(mockDatabase.emailVerificationTokens.values());
      const verificationToken = tokens[0].token;

      // Verify email
      const verifyResult = await authService.verifyEmail(verificationToken);
      expect(verifyResult.success).toBe(true);

      // Check user is marked as verified
      const updatedUser = await mockDatabase.findUserById(registerResult.user!.id);
      expect(updatedUser.emailVerified).toBe(true);
    });

    it('should complete password reset flow', async () => {
      // Register user
      const userData = {
        email: 'reset@example.com',
        password: 'OldP@ssw0rd123!',
        firstName: 'Reset',
        lastName: 'Test',
      };

      await authService.register(userData);

      // Request password reset
      const resetRequestResult = await authService.requestPasswordReset(userData.email);
      expect(resetRequestResult.success).toBe(true);

      // Get reset token from database
      const tokens = Array.from(mockDatabase.passwordResetTokens.values());
      const resetToken = tokens[0].token;

      // Reset password
      const newPassword = 'NewP@ssw0rd123!';
      const resetResult = await authService.resetPassword(resetToken, newPassword);
      expect(resetResult.success).toBe(true);

      // Verify new password works
      const loginResult = await authService.login({
        email: userData.email,
        password: newPassword,
      });
      expect(loginResult.success).toBe(true);
    });

    it('should handle token refresh flow', async () => {
      // Register user
      const userData = {
        email: 'refresh@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Refresh',
        lastName: 'Test',
      };

      const registerResult = await authService.register(userData);
      const refreshToken = registerResult.tokens!.refreshToken;

      // Refresh tokens
      const refreshResult = await authService.refreshToken(refreshToken);
      expect(refreshResult.success).toBe(true);
      expect(refreshResult.tokens).toBeDefined();
      expect(refreshResult.tokens!.accessToken).not.toBe(registerResult.tokens!.accessToken);
    });

    it('should handle logout and token revocation', async () => {
      // Register and login user
      const userData = {
        email: 'logout@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Logout',
        lastName: 'Test',
      };

      const registerResult = await authService.register(userData);
      const accessToken = registerResult.tokens!.accessToken;

      // Logout
      const logoutResult = await authService.logout(accessToken);
      expect(logoutResult.success).toBe(true);

      // Verify token is revoked
      const isRevoked = await tokenService.isTokenRevoked(accessToken);
      expect(isRevoked).toBe(true);
    });

    it('should integrate with security service for rate limiting', async () => {
      const clientIp = '192.168.1.1';
      
      // Check rate limit
      const rateLimitResult = await securityService.checkRateLimit(clientIp, 'login');
      expect(rateLimitResult.allowed).toBe(true);
      expect(rateLimitResult.remaining).toBeGreaterThan(0);
    });

    it('should integrate with security service for CSRF protection', async () => {
      // Generate CSRF token
      const csrfResult = await securityService.generateCSRFToken('session-123');
      expect(csrfResult.success).toBe(true);
      expect(csrfResult.token).toBeDefined();

      // Verify CSRF token
      const verifyResult = await securityService.verifyCSRFToken('session-123', csrfResult.token!);
      expect(verifyResult.valid).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle service dependency failures gracefully', () => {
      // Test with invalid userRepository
      expect(() => createAuthService({ 
        userRepository: null as unknown as IUserRepository,
        tokenService: createMockTokenService(),
        emailService: createMockEmailService(),
        hashService: createMockHashService()
      })).toThrow();
    });

    it('should handle missing environment variables', () => {
      delete process.env.JWT_SECRET;
      
      expect(() => createTokenService())
        .toThrow();
    });

    it('should handle invalid configuration', () => {
      process.env.EMAIL_PROVIDER = 'invalid-provider';
      
      expect(() => createEmailService({
        emailConfig: createDefaultEmailConfig(),
        userRepository: createMockUserRepository()
      }))
        .toThrow();
    });
  });

  describe('Performance and Cleanup', () => {
    let authService: AuthService;
    let emailService: EmailService;
    let oauthService: OAuthService;
    let tokenService: TokenService;

    beforeEach(() => {
      tokenService = createTokenService();
      
      authService = createAuthService({
        userRepository: createMockUserRepository(),
        tokenService,
        emailService: createMockEmailService(),
        hashService: createMockHashService(),
        options: {
          jwtSecret: 'test-secret',
          jwtRefreshSecret: 'test-refresh-secret',
          jwtExpiresIn: '1h',
          jwtRefreshExpiresIn: '7d',
          emailVerificationExpiresIn: '24h',
          passwordResetExpiresIn: '1h',
          maxLoginAttempts: 5,
          lockoutDuration: '15m',
          enableEmailVerification: true,
          enablePasswordReset: true,
          enableAccountLocking: true
        }
      });
      
      emailService = createEmailService({
        emailConfig: createDefaultEmailConfig(),
        userRepository: createMockUserRepository()
      });
      
      oauthService = createOAuthService({
        userRepository: createMockUserRepository(),
        tokenService,
        configs: createMockOAuthConfigs()
      });
    });

    it('should clean up expired tokens', async () => {
      // Create some tokens
      await emailService.sendVerificationEmail('user1', 'user1@example.com', 'User 1');
      await emailService.sendPasswordResetEmail('user2', 'user2@example.com', 'User 2');

      // Manually expire tokens
      const verificationTokens = Array.from(mockDatabase.emailVerificationTokens.entries());
      const resetTokens = Array.from(mockDatabase.passwordResetTokens.entries());

      verificationTokens[0][1].expiresAt = new Date(Date.now() - 1000);
      mockDatabase.emailVerificationTokens.set(verificationTokens[0][0], verificationTokens[0][1]);

      resetTokens[0][1].expiresAt = new Date(Date.now() - 1000);
      mockDatabase.passwordResetTokens.set(resetTokens[0][0], resetTokens[0][1]);

      // Clean up
      const cleanupResult = await emailService.cleanupExpiredTokens();
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.cleanedCount).toBe(2);
    });

    it('should clean up expired OAuth states', async () => {
      // Create OAuth states
      await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');
      await oauthService.getAuthorizationUrl('facebook', 'http://localhost:3000/callback');

      // Manually expire one state
      const states = Array.from(mockDatabase.oauthStates.entries());
      states[0][1].createdAt = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      mockDatabase.oauthStates.set(states[0][0], states[0][1]);

      // Clean up
      const cleanupResult = await oauthService.cleanupExpiredStates();
      expect(cleanupResult.success).toBe(true);
      expect(cleanupResult.cleanedCount).toBe(1);
    });

    it('should handle concurrent operations', async () => {
      const userData = {
        email: 'concurrent@example.com',
        password: 'SecureP@ssw0rd123!',
        firstName: 'Concurrent',
        lastName: 'Test',
      };

      // Run multiple operations concurrently
      const operations = [
        authService.register(userData),
        emailService.sendVerificationEmail('user1', 'user1@example.com', 'User 1'),
        emailService.sendPasswordResetEmail('user2', 'user2@example.com', 'User 2'),
      ];

      const results = await Promise.all(operations);
      
      expect(results[0].success).toBe(true); // Registration
      expect(results[1].success).toBe(true); // Verification email
      expect(results[2].success).toBe(true); // Reset email
    });
  });

  describe('Configuration Flexibility', () => {
    it('should support custom configuration', () => {
      const customAuthService = createAuthService({
        userRepository: createMockUserRepository(),
        tokenService: createMockTokenService(),
        emailService: createMockEmailService(),
        hashService: createMockHashService(),
        options: {
          emailVerification: { enabled: false },
          passwordReset: { enabled: false },
          oauth: { enabled: false },
        },
      });

      expect(customAuthService).toBeDefined();
    });

    it('should support environment-specific configurations', () => {
      process.env.NODE_ENV = 'development';
      
      const devConfig = getEnvironmentConfig();
      expect(devConfig).toBeDefined();

      process.env.NODE_ENV = 'production';
      
      const prodConfig = getEnvironmentConfig();
      expect(prodConfig).toBeDefined();

      delete process.env.NODE_ENV;
    });

    it('should validate configuration consistency', () => {
      const validation = validateEnvironment();
      
      if (!validation.isValid) {
        expect(validation.errors.length).toBeGreaterThan(0);
        validation.errors.forEach(error => {
          expect(typeof error).toBe('string');
          expect(error.length).toBeGreaterThan(0);
        });
      }
    });
  });
});