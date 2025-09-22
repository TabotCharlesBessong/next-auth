import * as crypto from 'crypto';
import { 
  IOAuthService, 
  IUserRepository, 
  ITokenService,
  OAuthProvider, 
  OAuthConfig, 
  OAuthUserData, 
  AuthUser, 
  AuthResult,
  AuthError,
  SocialAccount
} from './types';
import { User } from '../../database/types';
import { oauthCallbackSchema } from './validation';

interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
}

interface OAuthState {
  state: string;
  provider: OAuthProvider;
  redirectUrl?: string;
  createdAt: Date;
}

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

interface RawOAuthUserData {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  avatar_url?: string;
  verified_email?: boolean;
  email_verified?: boolean;
  first_name?: string;
  last_name?: string;
  login?: string;
  [key: string]: unknown;
}

export class OAuthService implements IOAuthService {
  private userRepository: IUserRepository;
  private tokenService: ITokenService;
  private providers: Map<OAuthProvider, OAuthProviderConfig> = new Map();
  private stateStore: Map<string, OAuthState> = new Map();

  constructor(
    userRepository: IUserRepository,
    tokenService: ITokenService,
    configs: Record<OAuthProvider, OAuthConfig>
  ) {
    this.userRepository = userRepository;
    this.tokenService = tokenService;
    this.initializeProviders(configs);
  }

  /**
   * Initialize OAuth providers with their configurations
   */
  private initializeProviders(configs: Record<OAuthProvider, OAuthConfig>): void {
    // Google OAuth configuration
    if (configs.google) {
      this.providers.set('google', {
        clientId: configs.google.clientId,
        clientSecret: configs.google.clientSecret,
        redirectUri: configs.google.redirectUri,
        scope: configs.google.scope || ['openid', 'email', 'profile'],
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      });
    }

    // Facebook OAuth configuration
    if (configs.facebook) {
      this.providers.set('facebook', {
        clientId: configs.facebook.clientId,
        clientSecret: configs.facebook.clientSecret,
        redirectUri: configs.facebook.redirectUri,
        scope: configs.facebook.scope || ['email', 'public_profile'],
        authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
        tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
        userInfoUrl: 'https://graph.facebook.com/v18.0/me',
      });
    }

    // GitHub OAuth configuration
    if (configs.github) {
      this.providers.set('github', {
        clientId: configs.github.clientId,
        clientSecret: configs.github.clientSecret,
        redirectUri: configs.github.redirectUri,
        scope: configs.github.scope || ['user:email'],
        authUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        userInfoUrl: 'https://api.github.com/user',
      });
    }
  }

  /**
   * Get OAuth authorization URL
   * @param provider - OAuth provider
   * @param state - State parameter for security
   * @returns Authorization URL
   */
  getAuthUrl(provider: string, state: string): string {
    try {
      const oauthProvider = provider as OAuthProvider;
      const providerConfig = this.providers.get(oauthProvider);
      if (!providerConfig) {
        throw new AuthError(`OAuth provider ${provider} is not configured`, 'PROVIDER_NOT_CONFIGURED', 400);
      }

      // Store state information
      this.stateStore.set(state, {
        state,
        provider: oauthProvider,
        createdAt: new Date(),
      });

      // Build authorization URL
      const params = new URLSearchParams({
        client_id: providerConfig.clientId,
        redirect_uri: providerConfig.redirectUri,
        scope: providerConfig.scope.join(' '),
        response_type: 'code',
        state,
      });

      // Add provider-specific parameters
      if (provider === 'google') {
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');
      }

      return `${providerConfig.authUrl}?${params.toString()}`;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Failed to generate authorization URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'OAUTH_URL_ERROR',
        500
      );
    }
  }

  /**
   * Handle OAuth callback and authenticate user
   * @param provider - OAuth provider
   * @param code - Authorization code
   * @param state - State parameter
   * @returns Authentication result
   */
  async handleCallback(provider: OAuthProvider, code: string, state: string): Promise<AuthResult> {
    try {
      // Validate callback parameters
      const validatedData = oauthCallbackSchema.parse({ code, state });

      // Verify state parameter
      const stateData = this.stateStore.get(validatedData.state);
      if (!stateData) {
        throw new AuthError('Invalid or expired state parameter', 'INVALID_STATE', 400);
      }

      if (stateData.provider !== provider) {
        throw new AuthError('State provider mismatch', 'STATE_PROVIDER_MISMATCH', 400);
      }

      // Check state expiry (15 minutes)
      const stateAge = Date.now() - stateData.createdAt.getTime();
      if (stateAge > 15 * 60 * 1000) {
        this.stateStore.delete(validatedData.state);
        throw new AuthError('State parameter has expired', 'STATE_EXPIRED', 400);
      }

      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(provider, validatedData.code);

      // Get user information from provider
      const oauthUserData = await this.getUserInfo(provider, tokenResponse.access_token);

      // Find or create user
      const authResult = await this.findOrCreateUser(provider, oauthUserData);

      // Clean up state
      this.stateStore.delete(validatedData.state);

      return authResult;
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `OAuth callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'OAUTH_CALLBACK_ERROR',
        500
      );
    }
  }

  /**
   * Link OAuth account to existing user
   * @param userId - Existing user ID
   * @param provider - OAuth provider
   * @param code - Authorization code
   * @param state - State parameter
   */
  async linkAccount(userId: string, provider: string, code: string): Promise<SocialAccount> {
    try {
      // Validate input
      const validatedData = oauthCallbackSchema.parse({ code, state: 'link-account' });
      const oauthProvider = provider as OAuthProvider;

      // Validate provider
      if (!this.isProviderConfigured(oauthProvider)) {
        throw new AuthError('OAuth provider not configured', 'INVALID_PROVIDER', 400);
      }

      // Find existing user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      // Exchange code for access token
      const tokenResponse = await this.exchangeCodeForToken(oauthProvider, validatedData.code);

      // Get user information from provider
      const oauthUserData = await this.getUserInfo(oauthProvider, tokenResponse.access_token);

      // Check if OAuth account is already linked to another user
      const existingOAuthUser = await this.userRepository.findByProvider(oauthProvider, oauthUserData.id);
      if (existingOAuthUser && existingOAuthUser.id !== userId) {
        throw new AuthError(
          'This OAuth account is already linked to another user',
          'OAUTH_ACCOUNT_LINKED',
          409
        );
      }

      // Update user with OAuth information
      const oauthAccounts = user.oauthAccounts || {};
      oauthAccounts[oauthProvider] = {
        id: oauthUserData.id,
        email: oauthUserData.email,
        name: oauthUserData.name,
        avatar: oauthUserData.avatar,
        linkedAt: new Date(),
      };

      await this.userRepository.update(userId, {
        oauthAccounts,
      });

      console.log(`OAuth account ${oauthProvider} linked to user ${userId}`);

      // Return the created social account
      return {
        id: crypto.randomUUID(),
        userId,
        provider: oauthProvider,
        providerId: oauthUserData.id,
        email: oauthUserData.email,
        name: oauthUserData.name,
        avatar: oauthUserData.avatar,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Account linking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ACCOUNT_LINKING_ERROR',
        500
      );
    }
  }

  /**
   * Unlink OAuth account from user
   * @param userId - User ID
   * @param provider - OAuth provider to unlink
   */
  async unlinkAccount(userId: string, provider: OAuthProvider): Promise<void> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new AuthError('User not found', 'USER_NOT_FOUND', 404);
      }

      if (!user.oauthAccounts || !user.oauthAccounts[provider]) {
        throw new AuthError('OAuth account not linked', 'OAUTH_ACCOUNT_NOT_LINKED', 400);
      }

      // Check if user has a password or other OAuth accounts
      const hasPassword = !!user.password;
      const otherOAuthAccounts = Object.keys(user.oauthAccounts).filter(p => p !== provider);
      
      if (!hasPassword && otherOAuthAccounts.length === 0) {
        throw new AuthError(
          'Cannot unlink the only authentication method. Please set a password first.',
          'LAST_AUTH_METHOD',
          400
        );
      }

      // Remove OAuth account
      const oauthAccounts = { ...user.oauthAccounts };
      delete oauthAccounts[provider];

      await this.userRepository.update(userId, {
        oauthAccounts,
      });

      console.log(`OAuth account ${provider} unlinked from user ${userId}`);
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `Account unlinking failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ACCOUNT_UNLINKING_ERROR',
        500
      );
    }
  }

  /**
   * Exchange authorization code for access token
   * @param provider - OAuth provider
   * @param code - Authorization code
   * @returns Token response
   */
  private async exchangeCodeForToken(provider: OAuthProvider, code: string): Promise<OAuthTokenResponse> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new AuthError(`Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED', 400);
    }

    const params = new URLSearchParams({
      client_id: providerConfig.clientId,
      client_secret: providerConfig.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: providerConfig.redirectUri,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    // GitHub requires Accept header
    if (provider === 'github') {
      headers['Accept'] = 'application/json';
    }

    const response = await fetch(providerConfig.tokenUrl, {
      method: 'POST',
      headers,
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AuthError(
        `Token exchange failed: ${response.status} ${errorText}`,
        'TOKEN_EXCHANGE_ERROR',
        response.status
      );
    }

    const tokenData = await response.json();
    
    if (!tokenData.access_token) {
      throw new AuthError('No access token received', 'NO_ACCESS_TOKEN', 400);
    }

    return tokenData;
  }

  /**
   * Get user information from OAuth provider
   * @param provider - OAuth provider
   * @param accessToken - Access token
   * @returns User data
   */
  private async getUserInfo(provider: OAuthProvider, accessToken: string): Promise<OAuthUserData> {
    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new AuthError(`Provider ${provider} not configured`, 'PROVIDER_NOT_CONFIGURED', 400);
    }

    let userInfoUrl = providerConfig.userInfoUrl;
    
    // Add fields parameter for Facebook
    if (provider === 'facebook') {
      userInfoUrl += '?fields=id,name,email,picture';
    }

    const response = await fetch(userInfoUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new AuthError(
        `Failed to get user info: ${response.status} ${errorText}`,
        'USER_INFO_ERROR',
        response.status
      );
    }

    const userData = await response.json();

    // Normalize user data based on provider
    return this.normalizeUserData(provider, userData);
  }

  /**
   * Normalize user data from different providers
   * @param provider - OAuth provider
   * @param userData - Raw user data from provider
   * @returns Normalized user data
   */
  private normalizeUserData(provider: OAuthProvider, userData: RawOAuthUserData): OAuthUserData {
    switch (provider) {
      case 'google':
        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.picture,
          emailVerified: userData.verified_email || false,
        };

      case 'facebook':
        return {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar: userData.picture?.data?.url,
          emailVerified: true, // Facebook emails are typically verified
        };

      case 'github':
        return {
          id: userData.id.toString(),
          email: userData.email,
          name: userData.name || userData.login,
          avatar: userData.avatar_url,
          emailVerified: true, // GitHub emails are typically verified
        };

      default:
        throw new AuthError(`Unsupported provider: ${provider}`, 'UNSUPPORTED_PROVIDER', 400);
    }
  }

  /**
   * Find existing user or create new one based on OAuth data
   * @param provider - OAuth provider
   * @param oauthUserData - OAuth user data
   * @returns Authentication result
   */
  private async findOrCreateUser(provider: OAuthProvider, oauthUserData: OAuthUserData): Promise<AuthResult> {
    try {
      // First, try to find user by OAuth ID
      let user = await this.userRepository.findByOAuthId(provider, oauthUserData.id);

      if (user) {
        // Update OAuth account information
        const oauthAccounts = user.oauthAccounts || {};
        oauthAccounts[provider] = {
          id: oauthUserData.id,
          email: oauthUserData.email,
          name: oauthUserData.name,
          avatar: oauthUserData.avatar,
          linkedAt: new Date(),
        };

        user = await this.userRepository.update(user.id, {
          oauthAccounts,
          metadata: {
            ...user.metadata,
            lastLogin: new Date(),
            loginCount: (user.metadata?.loginCount || 0) + 1,
          },
        });
      } else {
        // Try to find user by email
        const existingUser = await this.userRepository.findByEmail(oauthUserData.email);

        if (existingUser) {
          // Link OAuth account to existing user
          const oauthAccounts = existingUser.oauthAccounts || {};
          oauthAccounts[provider] = {
            id: oauthUserData.id,
            email: oauthUserData.email,
            name: oauthUserData.name,
            avatar: oauthUserData.avatar,
            linkedAt: new Date(),
          };

          user = await this.userRepository.update(existingUser.id, {
            oauthAccounts,
            emailVerified: oauthUserData.emailVerified || existingUser.emailVerified,
            metadata: {
              ...existingUser.metadata,
              lastLogin: new Date(),
              loginCount: (existingUser.metadata?.loginCount || 0) + 1,
            },
          });
        } else {
          // Create new user with OAuth data
          const userData: RegisterData = {
            email: oauthUserData.email,
            password: crypto.randomBytes(32).toString('hex'), // Placeholder password for OAuth users
            fullName: oauthUserData.name,
            emailVerified: oauthUserData.emailVerified || true, // OAuth emails are typically verified
            isActive: true,
            profile: {
              firstName: oauthUserData.name?.split(' ')[0] || '',
              lastName: oauthUserData.name?.split(' ').slice(1).join(' ') || '',
              avatar: oauthUserData.avatar,
            },
            oauthAccounts: {
              [provider]: {
                id: oauthUserData.id,
                email: oauthUserData.email,
                name: oauthUserData.name,
                avatar: oauthUserData.avatar,
                linkedAt: new Date(),
              },
            },
            metadata: {
              registrationDate: new Date(),
              lastLogin: new Date(),
              loginCount: 1,
              isOAuthUser: true, // Flag to indicate this is an OAuth user
            },
          };
          
          user = await this.userRepository.create(userData);
        }
      }

      // Generate tokens
      const tokens = await this.tokenService.generateTokenPair(user.id, {
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
      });

      return {
        user: this.sanitizeUser(user),
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        `User creation/update failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'USER_CREATION_ERROR',
        500
      );
    }
  }

  /**
   * Remove sensitive data from user object
   * @param user - User object
   * @returns Sanitized user object
   */
  private sanitizeUser(user: User): AuthUser {
    const { password: _password, ...sanitizedUser } = user;
    return sanitizedUser as AuthUser;
  }

  /**
   * Clean up expired state entries
   */
  async cleanupExpiredStates(): Promise<void> {
    const now = new Date();
    const expiredStates: string[] = [];

    for (const [state, stateData] of Array.from(this.stateStore.entries())) {
      const stateAge = now.getTime() - stateData.createdAt.getTime();
      if (stateAge > 15 * 60 * 1000) { // 15 minutes
        expiredStates.push(state);
      }
    }

    for (const state of expiredStates) {
      this.stateStore.delete(state);
    }

    console.log(`Cleaned up ${expiredStates.length} expired OAuth states`);
  }

  /**
   * Get OAuth service statistics
   */
  getOAuthStats(): {
    totalStates: number;
    expiredStates: number;
    configuredProviders: OAuthProvider[];
  } {
    const now = new Date();
    let expiredStates = 0;

    for (const stateData of Array.from(this.stateStore.values())) {
      const stateAge = now.getTime() - stateData.createdAt.getTime();
      if (stateAge > 15 * 60 * 1000) {
        expiredStates++;
      }
    }

    return {
      totalStates: this.stateStore.size,
      expiredStates,
      configuredProviders: Array.from(this.providers.keys()),
    };
  }

  /**
   * Get list of configured providers
   */
  getConfiguredProviders(): OAuthProvider[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider: OAuthProvider): boolean {
    return this.providers.has(provider);
  }
}

// Export factory function for creating OAuth service instances
export const createOAuthService = (
  userRepository: IUserRepository,
  tokenService: ITokenService,
  configs: Record<OAuthProvider, OAuthConfig>
): OAuthService => {
  return new OAuthService(userRepository, tokenService, configs);
};

// Helper function to create OAuth configuration from environment variables
export const createOAuthConfigFromEnv = (): Record<OAuthProvider, OAuthConfig> => {
  const configs: Partial<Record<OAuthProvider, OAuthConfig>> = {};

  // Google OAuth
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    configs.google = {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/google`,
      scope: ['openid', 'email', 'profile'],
    };
  }

  // Facebook OAuth
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    configs.facebook = {
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      redirectUri: process.env.FACEBOOK_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/facebook`,
      scope: ['email', 'public_profile'],
    };
  }

  // GitHub OAuth
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    configs.github = {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      redirectUri: process.env.GITHUB_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback/github`,
      scope: ['user:email'],
    };
  }

  return configs as Record<OAuthProvider, OAuthConfig>;
};