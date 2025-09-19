import { 
  IAuthService, 
  IUserRepository, 
  ITokenService, 
  IEmailService, 
  IHashService,
  AuthUser, 
  LoginCredentials, 
  RegisterData, 
  AuthResult, 
  AuthError,
  TokenPair,
  UserProfile,
  PasswordResetRequest,
  EmailVerificationRequest
} from './types';
import { 
  registerSchema, 
  loginSchema, 
  passwordResetRequestSchema, 
  passwordResetSchema,
  emailVerificationSchema,
  profileUpdateSchema
} from './validation';

interface AuthServiceConfig {
  userRepository: IUserRepository;
  tokenService: ITokenService;
  emailService: IEmailService;
  hashService: IHashService;
  options?: {
    requireEmailVerification?: boolean;
    enablePasswordReset?: boolean;
    maxLoginAttempts?: number;
    lockoutDuration?: number; // in minutes
    sessionDuration?: number; // in minutes
    refreshTokenDuration?: number; // in days
  };
}

interface LoginAttempt {
  email: string;
  attempts: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

export class AuthService implements IAuthService {
  private userRepository: IUserRepository;
  private tokenService: ITokenService;
  private emailService: IEmailService;
  private hashService: IHashService;
  private config: Required<AuthServiceConfig['options']>;
  private loginAttempts: Map<string, LoginAttempt> = new Map();

  constructor(serviceConfig: AuthServiceConfig) {
    this.userRepository = serviceConfig.userRepository;
    this.tokenService = serviceConfig.tokenService;
    this.emailService = serviceConfig.emailService;
    this.hashService = serviceConfig.hashService;
    
    // Set default configuration
    this.config = {
      requireEmailVerification: true,
      enablePasswordReset: true,
      maxLoginAttempts: 5,
      lockoutDuration: 15, // 15 minutes
      sessionDuration: 60, // 1 hour
      refreshTokenDuration: 7, // 7 days
      ...serviceConfig.options,
    };
  }

  /**
   * Register a new user
   * @param data - Registration data
   * @returns Promise<AuthResult>
   */
  async register(data: RegisterData): Promise<AuthResult> {
    try {
      // Validate input data
      const validatedData = registerSchema.parse(data);

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(validatedData.email);
      if (existingUser) {
        throw new AuthError('User already exists with this email', 'USER_EXISTS', 409);
      }

      // Hash password
      const hashedPassword = await this.hashService.hashPassword(validatedData.password);

      // Create user
      const newUser = await this.userRepository.create({
        email: validatedData.email,
        password: hashedPassword,
        name: validatedData.name,
        emailVerified: !this.config.requireEmailVerification,
        isActive: true,
        profile: {
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          avatar: validatedData.avatar,
        },
        metadata: {
          registrationDate: new Date(),
          lastLogin: null,
          loginCount: 0,
        },
      });

      // Send verification email if required
      if (this.config.requireEmailVerification) {
        await this.emailService.sendVerificationEmail(newUser.email);
      } else {
        // Send welcome email if verification is not required
        await this.emailService.sendWelcomeEmail(newUser.email, newUser.name);
      }

      // Generate tokens
      const tokens = await this.tokenService.generateTokenPair(newUser.id, {
        email: newUser.email,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
      });

      return {
        success: true,
        user: this.sanitizeUser(newUser),
        tokens,
        message: this.config.requireEmailVerification 
          ? 'Registration successful. Please check your email to verify your account.'
          : 'Registration successful. Welcome!',
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REGISTRATION_ERROR',
        500
      );
    }
  }

  /**
   * Authenticate user login
   * @param credentials - Login credentials
   * @returns Promise<AuthResult>
   */
  async login(credentials: LoginCredentials): Promise<AuthResult> {
    try {
      // Validate input data
      const validatedCredentials = loginSchema.parse(credentials);

      // Check for account lockout
      await this.checkAccountLockout(validatedCredentials.email);

      // Find user by email
      const user = await this.userRepository.findByEmail(validatedCredentials.email);
      if (!user) {
        await this.recordFailedLogin(validatedCredentials.email);
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AuthError('Account is deactivated', 'ACCOUNT_DEACTIVATED', 403);
      }

      // Verify password
      const isPasswordValid = await this.hashService.comparePassword(
        validatedCredentials.password,
        user.password
      );

      if (!isPasswordValid) {
        await this.recordFailedLogin(validatedCredentials.email);
        throw new AuthError('Invalid email or password', 'INVALID_CREDENTIALS', 401);
      }

      // Check email verification if required
      if (this.config.requireEmailVerification && !user.emailVerified) {
        throw new AuthError(
          'Please verify your email address before logging in',
          'EMAIL_NOT_VERIFIED',
          403
        );
      }

      // Clear failed login attempts
      this.loginAttempts.delete(validatedCredentials.email);

      // Update user login metadata
      await this.userRepository.update(user.id, {
        metadata: {
          ...user.metadata,
          lastLogin: new Date(),
          loginCount: (user.metadata?.loginCount || 0) + 1,
        },
      });

      // Generate tokens
      const tokens = await this.tokenService.generateTokenPair(user.id, {
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      });

      return {
        success: true,
        user: this.sanitizeUser(user),
        tokens,
        message: 'Login successful',
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LOGIN_ERROR',
        500
      );
    }
  }

  /**
   * Logout user and revoke tokens
   * @param userId - User ID
   * @param refreshToken - Refresh token to revoke
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    try {
      // Revoke refresh token if provided
      if (refreshToken) {
        await this.tokenService.revokeToken(refreshToken);
      }

      // Revoke all user tokens (optional - for complete logout from all devices)
      // await this.tokenService.revokeAllUserTokens(userId);

      console.log(`User ${userId} logged out successfully`);
    } catch (error) {
      throw new AuthError(
        `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LOGOUT_ERROR',
        500
      );
    }
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken - Refresh token
   * @returns Promise<TokenPair>
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const tokenData = await this.tokenService.verifyToken(refreshToken, 'refresh');
      
      // Get user data
      const user = await this.userRepository.findById(tokenData.userId);
      if (!user || !user.isActive) {
        throw new AuthError('User not found or inactive', 'USER_NOT_FOUND', 404);
      }

      // Generate new token pair
      const tokens = await this.tokenService.generateTokenPair(user.id, {
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      });

      // Revoke old refresh token
      await this.tokenService.revokeToken(refreshToken);

      return tokens;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'TOKEN_REFRESH_ERROR',
        401
      );
    }
  }

  /**
   * Verify email address
   * @param request - Email verification request
   */
  async verifyEmail(request: EmailVerificationRequest): Promise<void> {
    try {
      // Validate input
      const validatedRequest = emailVerificationSchema.parse(request);

      // Verify email token
      const tokenData = this.emailService.verifyEmailToken(validatedRequest.token, 'verification');

      // Find user by email
      const user = await this.userRepository.findByEmail(tokenData.email);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Update user email verification status
      await this.userRepository.update(user.id, {
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      // Mark token as used
      this.emailService.markTokenAsUsed(validatedRequest.token);

      // Send welcome email
      await this.emailService.sendWelcomeEmail(user.email, user.name);

      console.log(`Email verified for user: ${user.email}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Email verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_VERIFICATION_ERROR',
        500
      );
    }
  }

  /**
   * Request password reset
   * @param request - Password reset request
   */
  async requestPasswordReset(request: PasswordResetRequest): Promise<void> {
    try {
      // Validate input
      const validatedRequest = passwordResetRequestSchema.parse(request);

      if (!this.config.enablePasswordReset) {
        throw new AuthError('Password reset is not enabled', 'FEATURE_DISABLED', 403);
      }

      // Find user by email
      const user = await this.userRepository.findByEmail(validatedRequest.email);
      if (!user) {
        // Don't reveal if user exists or not for security
        console.log(`Password reset requested for non-existent email: ${validatedRequest.email}`);
        return;
      }

      // Send password reset email
      await this.emailService.sendPasswordResetEmail(user.email);

      console.log(`Password reset email sent to: ${user.email}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Password reset request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PASSWORD_RESET_REQUEST_ERROR',
        500
      );
    }
  }

  /**
   * Reset password using reset token
   * @param token - Reset token
   * @param newPassword - New password
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    try {
      // Validate input
      const validatedData = passwordResetSchema.parse({ token, newPassword });

      // Verify reset token
      const tokenData = this.emailService.verifyEmailToken(validatedData.token, 'password-reset');

      // Find user by email
      const user = await this.userRepository.findByEmail(tokenData.email);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Hash new password
      const hashedPassword = await this.hashService.hashPassword(validatedData.newPassword);

      // Update user password
      await this.userRepository.update(user.id, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      });

      // Mark token as used
      this.emailService.markTokenAsUsed(validatedData.token);

      // Revoke all user tokens to force re-login
      // await this.tokenService.revokeAllUserTokens(user.id);

      console.log(`Password reset successful for user: ${user.email}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Password reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PASSWORD_RESET_ERROR',
        500
      );
    }
  }

  /**
   * Change user password (authenticated)
   * @param userId - User ID
   * @param currentPassword - Current password
   * @param newPassword - New password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      // Find user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await this.hashService.comparePassword(
        currentPassword,
        user.password
      );

      if (!isCurrentPasswordValid) {
        throw new AuthError('Current password is incorrect', 'INVALID_PASSWORD', 400);
      }

      // Hash new password
      const hashedPassword = await this.hashService.hashPassword(newPassword);

      // Update user password
      await this.userRepository.update(userId, {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      });

      console.log(`Password changed for user: ${user.email}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Password change failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PASSWORD_CHANGE_ERROR',
        500
      );
    }
  }

  /**
   * Update user profile
   * @param userId - User ID
   * @param profileData - Profile data to update
   * @returns Promise<AuthUser>
   */
  async updateProfile(userId: string, profileData: Partial<UserProfile>): Promise<AuthUser> {
    try {
      // Validate input
      const validatedData = profileUpdateSchema.parse(profileData);

      // Find user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Update user profile
      const updatedUser = await this.userRepository.update(userId, {
        name: validatedData.name || user.name,
        profile: {
          ...user.profile,
          ...validatedData,
        },
      });

      return this.sanitizeUser(updatedUser);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Profile update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROFILE_UPDATE_ERROR',
        500
      );
    }
  }

  /**
   * Get user profile
   * @param userId - User ID
   * @returns Promise<AuthUser>
   */
  async getProfile(userId: string): Promise<AuthUser> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      return this.sanitizeUser(user);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Failed to get profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PROFILE_GET_ERROR',
        500
      );
    }
  }

  /**
   * Deactivate user account
   * @param userId - User ID
   */
  async deactivateAccount(userId: string): Promise<void> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      await this.userRepository.update(userId, {
        isActive: false,
        deactivatedAt: new Date(),
      });

      // Revoke all user tokens
      // await this.tokenService.revokeAllUserTokens(userId);

      console.log(`Account deactivated for user: ${user.email}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Account deactivation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ACCOUNT_DEACTIVATION_ERROR',
        500
      );
    }
  }

  /**
   * Check account lockout status
   * @param email - User email
   */
  private async checkAccountLockout(email: string): Promise<void> {
    const attempt = this.loginAttempts.get(email);
    if (!attempt) return;

    if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
      const remainingTime = Math.ceil((attempt.lockedUntil.getTime() - Date.now()) / 60000);
      throw new AuthError(
        `Account is locked. Try again in ${remainingTime} minutes.`,
        'ACCOUNT_LOCKED',
        423
      );
    }

    // Clear expired lockout
    if (attempt.lockedUntil && attempt.lockedUntil <= new Date()) {
      this.loginAttempts.delete(email);
    }
  }

  /**
   * Record failed login attempt
   * @param email - User email
   */
  private async recordFailedLogin(email: string): Promise<void> {
    const now = new Date();
    const attempt = this.loginAttempts.get(email) || {
      email,
      attempts: 0,
      lastAttempt: now,
    };

    attempt.attempts++;
    attempt.lastAttempt = now;

    if (attempt.attempts >= this.config.maxLoginAttempts) {
      attempt.lockedUntil = new Date(now.getTime() + this.config.lockoutDuration * 60000);
    }

    this.loginAttempts.set(email, attempt);
  }

  /**
   * Remove sensitive data from user object
   * @param user - User object
   * @returns Sanitized user object
   */
  private sanitizeUser(user: any): AuthUser {
    const { password, ...sanitizedUser } = user;
    return sanitizedUser as AuthUser;
  }

  /**
   * Clean up expired login attempts
   */
  async cleanupExpiredAttempts(): Promise<void> {
    const now = new Date();
    const expiredEmails: string[] = [];

    for (const [email, attempt] of this.loginAttempts.entries()) {
      if (attempt.lockedUntil && attempt.lockedUntil <= now) {
        expiredEmails.push(email);
      }
    }

    for (const email of expiredEmails) {
      this.loginAttempts.delete(email);
    }

    console.log(`Cleaned up ${expiredEmails.length} expired login attempts`);
  }

  /**
   * Get authentication service statistics
   */
  getAuthStats(): {
    totalLoginAttempts: number;
    lockedAccounts: number;
    activeUsers: number;
  } {
    const now = new Date();
    let lockedAccounts = 0;

    for (const attempt of this.loginAttempts.values()) {
      if (attempt.lockedUntil && attempt.lockedUntil > now) {
        lockedAccounts++;
      }
    }

    return {
      totalLoginAttempts: this.loginAttempts.size,
      lockedAccounts,
      activeUsers: 0, // This would need to be implemented based on your user repository
    };
  }
}

// Export factory function for creating auth service instances
export const createAuthService = (config: AuthServiceConfig): AuthService => {
  return new AuthService(config);
};