import { OAuthService, createOAuthService } from '../OAuthService';
import { OAuthError, IUserRepository, ITokenService, OAuthProvider } from '../types';
import { User } from '../../../database/types';
import { createTokenService } from '../TokenService';

interface MockUserData {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  emailVerified?: boolean;
  emailVerifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface MockOAuthAccountData {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MockOAuthStateData {
  provider: string;
  redirectUrl?: string;
  [key: string]: unknown;
}

// Mock axios for HTTP requests
const mockAxios = {
  post: jest.fn(),
  get: jest.fn(),
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxios),
  post: jest.fn(),
  get: jest.fn(),
}));

// Mock crypto for secure random generation
jest.mock('crypto', () => ({
  randomBytes: jest.fn(() => Buffer.from('mock-random-bytes')),
}));

const mockDatabase = {
  users: new Map(),
  oauthAccounts: new Map(),
  oauthStates: new Map(),
  
  async createUser(userData: Partial<MockUserData>): Promise<MockUserData> {
    const user: MockUserData = {
      id: `user-${Date.now()}-${Math.random()}`,
      email: userData.email!,
      firstName: userData.firstName,
      lastName: userData.lastName,
      fullName: userData.fullName || `${userData.firstName || ''} ${userData.lastName || ''}`.trim(),
      emailVerified: userData.emailVerified || false,
      emailVerifiedAt: userData.emailVerifiedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(user.id, user);
    return user;
  },
  
  async findUserByEmail(email: string): Promise<MockUserData | null> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return null;
  },
  
  async findUserById(id: string): Promise<MockUserData | null> {
    return this.users.get(id) || null;
  },
  
  async updateUser(id: string, data: Partial<MockUserData>): Promise<MockUserData | null> {
    const user = this.users.get(id);
    if (!user) return null;
    
    const updatedUser = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updatedUser);
    return updatedUser;
  },
  
  async createOAuthAccount(accountData: Partial<MockOAuthAccountData>): Promise<MockOAuthAccountData> {
    const account: MockOAuthAccountData = {
      id: `account-${Date.now()}-${Math.random()}`,
      userId: accountData.userId!,
      provider: accountData.provider!,
      providerId: accountData.providerId!,
      accessToken: accountData.accessToken,
      refreshToken: accountData.refreshToken,
      expiresAt: accountData.expiresAt,
      scope: accountData.scope,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.oauthAccounts.set(account.id, account);
    return account;
  },
  
  async findOAuthAccount(provider: string, providerId: string): Promise<MockOAuthAccountData | null> {
    for (const account of this.oauthAccounts.values()) {
      if (account.provider === provider && account.providerId === providerId) {
        return account;
      }
    }
    return null;
  },
  
  async updateOAuthAccount(id: string, data: Partial<MockOAuthAccountData>): Promise<MockOAuthAccountData | null> {
    const account = this.oauthAccounts.get(id);
    if (!account) return null;
    
    const updatedAccount = { ...account, ...data, updatedAt: new Date() };
    this.oauthAccounts.set(id, updatedAccount);
    return updatedAccount;
  },
  
  async deleteOAuthAccount(id: string): Promise<boolean> {
    return this.oauthAccounts.delete(id);
  },
  
  async getUserOAuthAccounts(userId: string) {
    return Array.from(this.oauthAccounts.values()).filter((account: MockOAuthAccountData) => 
      account.userId === userId
    );
  },
  
  async storeOAuthState(state: string, data: MockOAuthStateData) {
    this.oauthStates.set(state, { ...data, createdAt: new Date() });
  },
  
  async getOAuthState(state: string) {
    return this.oauthStates.get(state);
  },
  
  async deleteOAuthState(state: string) {
    return this.oauthStates.delete(state);
  },
  
  clear() {
    this.users.clear();
    this.oauthAccounts.clear();
    this.oauthStates.clear();
  }
};

// Create mock user repository that implements IUserRepository interface
const createMockUserRepository = (): IUserRepository => ({
  async create(userData): Promise<User> {
    const user = await mockDatabase.createUser(userData);
    return user as User;
  },
  
  async findById(id: string): Promise<User | null> {
    const user = await mockDatabase.findUserById(id);
    return user as User | null;
  },
  
  async findByEmail(email: string): Promise<User | null> {
    const user = await mockDatabase.findUserByEmail(email);
    return user as User | null;
  },
  
  async update(id: string, data: Partial<User>): Promise<User | null> {
    const user = await mockDatabase.updateUser(id, data);
    return user as User | null;
  },
  
  async delete(id: string): Promise<void> {
    mockDatabase.users.delete(id);
  },
  
  async findByProvider(provider: string, providerId: string): Promise<User | null> {
    const account = await mockDatabase.findOAuthAccount(provider, providerId);
    if (!account) return null;
    return await this.findById(account.userId);
  },
  
  async findByOAuthId(provider: string, oauthId: string): Promise<User | null> {
    return await this.findByProvider(provider, oauthId);
  }
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

const mockEnv = {
  GOOGLE_CLIENT_ID: 'test-google-client-id',
  GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
  FACEBOOK_APP_ID: 'test-facebook-app-id',
  FACEBOOK_APP_SECRET: 'test-facebook-app-secret',
  GITHUB_CLIENT_ID: 'test-github-client-id',
  GITHUB_CLIENT_SECRET: 'test-github-client-secret',
  NEXTAUTH_URL: 'http://localhost:3000',
};

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockUserRepository: IUserRepository;
  let mockTokenService: ITokenService;

  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    
    // Clear mock database
    mockDatabase.clear();
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock services
    mockUserRepository = createMockUserRepository();
    mockTokenService = createMockTokenService();
    
    // Create OAuth service with proper interfaces
    oauthService = createOAuthService(
      mockUserRepository,
      mockTokenService,
      {
        google: {
          clientId: mockEnv.GOOGLE_CLIENT_ID,
          clientSecret: mockEnv.GOOGLE_CLIENT_SECRET,
          redirectUri: `${mockEnv.NEXTAUTH_URL}/api/auth/callback/google`,
        },
        facebook: {
          clientId: mockEnv.FACEBOOK_APP_ID,
          clientSecret: mockEnv.FACEBOOK_APP_SECRET,
          redirectUri: `${mockEnv.NEXTAUTH_URL}/api/auth/callback/facebook`,
        },
        github: {
          clientId: mockEnv.GITHUB_CLIENT_ID,
          clientSecret: mockEnv.GITHUB_CLIENT_SECRET,
          redirectUri: `${mockEnv.NEXTAUTH_URL}/api/auth/callback/github`,
        }
      }
    );
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate Google authorization URL', async () => {
      const result = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');

      expect(result.success).toBe(true);
      expect(result.authUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(result.authUrl).toContain('client_id=test-google-client-id');
      expect(result.authUrl).toContain('redirect_uri=http://localhost:3000/callback');
      expect(result.authUrl).toContain('scope=openid%20email%20profile');
      expect(result.state).toBeDefined();
    });

    it('should generate Facebook authorization URL', async () => {
      const result = await oauthService.getAuthorizationUrl('facebook', 'http://localhost:3000/callback');

      expect(result.success).toBe(true);
      expect(result.authUrl).toContain('https://www.facebook.com/v18.0/dialog/oauth');
      expect(result.authUrl).toContain('client_id=test-facebook-app-id');
      expect(result.authUrl).toContain('redirect_uri=http://localhost:3000/callback');
      expect(result.authUrl).toContain('scope=email');
      expect(result.state).toBeDefined();
    });

    it('should generate GitHub authorization URL', async () => {
      const result = await oauthService.getAuthorizationUrl('github', 'http://localhost:3000/callback');

      expect(result.success).toBe(true);
      expect(result.authUrl).toContain('https://github.com/login/oauth/authorize');
      expect(result.authUrl).toContain('client_id=test-github-client-id');
      expect(result.authUrl).toContain('redirect_uri=http://localhost:3000/callback');
      expect(result.authUrl).toContain('scope=user:email');
      expect(result.state).toBeDefined();
    });

    it('should store state in database', async () => {
      const result = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');

      const storedState = mockDatabase.oauthStates.get(result.state!);
      expect(storedState).toBeDefined();
      expect(storedState.provider).toBe('google');
      expect(storedState.redirectUri).toBe('http://localhost:3000/callback');
    });

    it('should reject unsupported provider', async () => {
      await expect(oauthService.getAuthorizationUrl('unsupported' as OAuthProvider, 'http://localhost:3000/callback'))
        .rejects.toThrow(OAuthError);
    });

    it('should handle custom scopes', async () => {
      const result = await oauthService.getAuthorizationUrl(
        'google', 
        'http://localhost:3000/callback',
        ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar']
      );

      expect(result.authUrl).toContain('scope=openid%20email%20profile%20https://www.googleapis.com/auth/calendar');
    });
  });

  describe('handleCallback', () => {
    let state: string;

    beforeEach(async () => {
      const authResult = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');
      state = authResult.state!;
    });

    it('should handle Google OAuth callback successfully', async () => {
      // Mock token exchange
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'mock-refresh-token',
        },
      });

      // Mock user info retrieval
      mockAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
          given_name: 'John',
          family_name: 'Doe',
          picture: 'https://example.com/avatar.jpg',
          email_verified: true,
        },
      });

      const result = await oauthService.handleCallback('google', 'auth-code', state);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.email).toBe('user@example.com');
      expect(result.user?.firstName).toBe('John');
      expect(result.user?.lastName).toBe('Doe');
      expect(result.isNewUser).toBe(true);
    });

    it('should handle Facebook OAuth callback successfully', async () => {
      // Update state for Facebook
      const fbAuthResult = await oauthService.getAuthorizationUrl('facebook', 'http://localhost:3000/callback');
      state = fbAuthResult.state!;

      // Mock token exchange
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-fb-access-token',
          token_type: 'bearer',
          expires_in: 5184000,
        },
      });

      // Mock user info retrieval
      mockAxios.get.mockResolvedValueOnce({
        data: {
          id: 'facebook-user-123',
          email: 'user@example.com',
          name: 'Jane Doe',
          first_name: 'Jane',
          last_name: 'Doe',
          picture: {
            data: {
              url: 'https://example.com/fb-avatar.jpg',
            },
          },
        },
      });

      const result = await oauthService.handleCallback('facebook', 'auth-code', state);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('user@example.com');
      expect(result.user?.firstName).toBe('Jane');
      expect(result.user?.lastName).toBe('Doe');
    });

    it('should handle GitHub OAuth callback successfully', async () => {
      // Update state for GitHub
      const ghAuthResult = await oauthService.getAuthorizationUrl('github', 'http://localhost:3000/callback');
      state = ghAuthResult.state!;

      // Mock token exchange
      mockAxios.post.mockResolvedValueOnce({
        data: 'access_token=mock-gh-access-token&scope=user:email&token_type=bearer',
      });

      // Mock user info retrieval
      mockAxios.get
        .mockResolvedValueOnce({
          data: {
            id: 12345,
            login: 'johndoe',
            name: 'John Doe',
            email: null, // GitHub might not return email in user endpoint
            avatar_url: 'https://github.com/avatar.jpg',
          },
        })
        .mockResolvedValueOnce({
          data: [
            {
              email: 'user@example.com',
              primary: true,
              verified: true,
            },
          ],
        });

      const result = await oauthService.handleCallback('github', 'auth-code', state);

      expect(result.success).toBe(true);
      expect(result.user?.email).toBe('user@example.com');
      expect(result.user?.firstName).toBe('John');
      expect(result.user?.lastName).toBe('Doe');
    });

    it('should link OAuth account to existing user', async () => {
      // Create existing user
      const existingUser = await mockDatabase.createUser({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
      });

      // Mock OAuth flow
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      mockAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
          given_name: 'John',
          family_name: 'Doe',
          email_verified: true,
        },
      });

      const result = await oauthService.handleCallback('google', 'auth-code', state);

      expect(result.success).toBe(true);
      expect(result.user?.id).toBe(existingUser.id);
      expect(result.isNewUser).toBe(false);

      // Check OAuth account was created
      const oauthAccounts = await mockDatabase.getUserOAuthAccounts(existingUser.id);
      expect(oauthAccounts).toHaveLength(1);
      expect(oauthAccounts[0].provider).toBe('google');
    });

    it('should reject callback with invalid state', async () => {
      const invalidState = 'invalid-state';

      await expect(oauthService.handleCallback('google', 'auth-code', invalidState))
        .rejects.toThrow(OAuthError);
    });

    it('should reject callback with expired state', async () => {
      // Manually expire the state
      const stateData = mockDatabase.oauthStates.get(state);
      stateData.createdAt = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      mockDatabase.oauthStates.set(state, stateData);

      await expect(oauthService.handleCallback('google', 'auth-code', state))
        .rejects.toThrow(OAuthError);
    });

    it('should handle token exchange failure', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Token exchange failed'));

      await expect(oauthService.handleCallback('google', 'auth-code', state))
        .rejects.toThrow(OAuthError);
    });

    it('should handle user info retrieval failure', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      mockAxios.get.mockRejectedValueOnce(new Error('User info retrieval failed'));

      await expect(oauthService.handleCallback('google', 'auth-code', state))
        .rejects.toThrow(OAuthError);
    });

    it('should clean up state after successful callback', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      mockAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
          given_name: 'John',
          family_name: 'Doe',
          email_verified: true,
        },
      });

      await oauthService.handleCallback('google', 'auth-code', state);

      const stateData = mockDatabase.oauthStates.get(state);
      expect(stateData).toBeUndefined();
    });
  });

  describe('linkAccount', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await mockDatabase.createUser({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
      });
      userId = user.id;
    });

    it('should link OAuth account to user successfully', async () => {
      const accountData = {
        provider: 'google' as const,
        providerId: 'google-user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'openid email profile',
      };

      const result = await oauthService.linkAccount(userId, accountData);

      expect(result.success).toBe(true);
      expect(result.account).toBeDefined();
      expect(result.account?.provider).toBe('google');
      expect(result.account?.providerId).toBe('google-user-123');
    });

    it('should reject linking duplicate account', async () => {
      const accountData = {
        provider: 'google' as const,
        providerId: 'google-user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'openid email profile',
      };

      // Link account first time
      await oauthService.linkAccount(userId, accountData);

      // Try to link same account again
      await expect(oauthService.linkAccount(userId, accountData))
        .rejects.toThrow(OAuthError);
    });

    it('should reject linking to non-existent user', async () => {
      const accountData = {
        provider: 'google' as const,
        providerId: 'google-user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'openid email profile',
      };

      await expect(oauthService.linkAccount('non-existent-user', accountData))
        .rejects.toThrow(OAuthError);
    });
  });

  describe('unlinkAccount', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await mockDatabase.createUser({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
      });
      userId = user.id;

      const accountData = {
        provider: 'google' as const,
        providerId: 'google-user-123',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'openid email profile',
      };

      await oauthService.linkAccount(userId, accountData);
    });

    it('should unlink OAuth account successfully', async () => {
      const result = await oauthService.unlinkAccount(userId, 'google');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Account unlinked successfully');

      // Verify account was removed
      const accounts = await mockDatabase.getUserOAuthAccounts(userId);
      expect(accounts).toHaveLength(0);
    });

    it('should reject unlinking non-existent account', async () => {
      await expect(oauthService.unlinkAccount(userId, 'facebook'))
        .rejects.toThrow(OAuthError);
    });

    it('should reject unlinking from non-existent user', async () => {
      await expect(oauthService.unlinkAccount('non-existent-user', 'google'))
        .rejects.toThrow(OAuthError);
    });
  });

  describe('getUserAccounts', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await mockDatabase.createUser({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
      });
      userId = user.id;

      // Link multiple accounts
      await oauthService.linkAccount(userId, {
        provider: 'google',
        providerId: 'google-user-123',
        accessToken: 'google-access-token',
        refreshToken: 'google-refresh-token',
        expiresAt: new Date(Date.now() + 3600000),
        scope: 'openid email profile',
      });

      await oauthService.linkAccount(userId, {
        provider: 'github',
        providerId: 'github-user-456',
        accessToken: 'github-access-token',
        refreshToken: null,
        expiresAt: null,
        scope: 'user:email',
      });
    });

    it('should get all user OAuth accounts', async () => {
      const result = await oauthService.getUserAccounts(userId);

      expect(result.success).toBe(true);
      expect(result.accounts).toHaveLength(2);
      
      const providers = result.accounts!.map(account => account.provider);
      expect(providers).toContain('google');
      expect(providers).toContain('github');
    });

    it('should not expose sensitive token data', async () => {
      const result = await oauthService.getUserAccounts(userId);

      result.accounts!.forEach(account => {
        expect(account.accessToken).toBeUndefined();
        expect(account.refreshToken).toBeUndefined();
      });
    });

    it('should handle user with no OAuth accounts', async () => {
      const newUser = await mockDatabase.createUser({
        email: 'newuser@example.com',
        firstName: 'New',
        lastName: 'User',
        emailVerified: true,
      });

      const result = await oauthService.getUserAccounts(newUser.id);

      expect(result.success).toBe(true);
      expect(result.accounts).toHaveLength(0);
    });

    it('should reject request for non-existent user', async () => {
      await expect(oauthService.getUserAccounts('non-existent-user'))
        .rejects.toThrow(OAuthError);
    });
  });

  describe('refreshAccessToken', () => {
    let userId: string;

    beforeEach(async () => {
      const user = await mockDatabase.createUser({
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        emailVerified: true,
      });
      userId = user.id;

      const accountData = {
        provider: 'google' as const,
        providerId: 'google-user-123',
        accessToken: 'old-access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() - 1000), // Expired
        scope: 'openid email profile',
      };

      await oauthService.linkAccount(userId, accountData);
    });

    it('should refresh Google access token successfully', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      const result = await oauthService.refreshAccessToken(userId, 'google');

      expect(result.success).toBe(true);
      expect(result.accessToken).toBe('new-access-token');
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('should update stored token data', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'new-refresh-token',
        },
      });

      await oauthService.refreshAccessToken(userId, 'google');

      const account = await mockDatabase.findOAuthAccount('google', 'google-user-123');
      expect(account.accessToken).toBe('new-access-token');
      expect(account.refreshToken).toBe('new-refresh-token');
    });

    it('should reject refresh for account without refresh token', async () => {
      // Create GitHub account (typically no refresh token)
      await oauthService.linkAccount(userId, {
        provider: 'github',
        providerId: 'github-user-456',
        accessToken: 'github-access-token',
        refreshToken: null,
        expiresAt: null,
        scope: 'user:email',
      });

      await expect(oauthService.refreshAccessToken(userId, 'github'))
        .rejects.toThrow(OAuthError);
    });

    it('should handle token refresh failure', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('Token refresh failed'));

      await expect(oauthService.refreshAccessToken(userId, 'google'))
        .rejects.toThrow(OAuthError);
    });

    it('should reject refresh for non-existent account', async () => {
      await expect(oauthService.refreshAccessToken(userId, 'facebook'))
        .rejects.toThrow(OAuthError);
    });
  });

  describe('Configuration', () => {
    it('should validate required environment variables', () => {
      delete process.env.GOOGLE_CLIENT_ID;

      expect(() => createOAuthService(
        mockUserRepository,
        mockTokenService,
        {
          google: {
            clientId: '', // Missing client ID
            clientSecret: mockEnv.GOOGLE_CLIENT_SECRET,
            redirectUri: `${mockEnv.NEXTAUTH_URL}/api/auth/callback/google`,
          }
        }
      )).toThrow();
    });

    it('should use custom redirect URI', () => {
      const customOAuthService = createOAuthService(
        mockUserRepository,
        mockTokenService,
        {
          google: {
            clientId: mockEnv.GOOGLE_CLIENT_ID,
            clientSecret: mockEnv.GOOGLE_CLIENT_SECRET,
            redirectUri: 'https://custom-domain.com/api/auth/callback/google',
          }
        }
      );

      expect(customOAuthService).toBeDefined();
    });

    it('should handle missing optional configuration', () => {
      const partialOAuthService = createOAuthService(
        mockUserRepository,
        mockTokenService,
        {
          google: {
            clientId: mockEnv.GOOGLE_CLIENT_ID,
            clientSecret: mockEnv.GOOGLE_CLIENT_SECRET,
            redirectUri: `${mockEnv.NEXTAUTH_URL}/api/auth/callback/google`,
          }
        }
      );

      expect(partialOAuthService).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const originalCreateUser = mockDatabase.createUser;
      mockDatabase.createUser = jest.fn().mockRejectedValue(new Error('Database error'));

      mockAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'mock-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      mockAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'user@example.com',
          name: 'John Doe',
          given_name: 'John',
          family_name: 'Doe',
          email_verified: true,
        },
      });

      const authResult = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');
      
      await expect(oauthService.handleCallback('google', 'auth-code', authResult.state!))
        .rejects.toThrow(OAuthError);

      mockDatabase.createUser = originalCreateUser;
    });

    it('should handle malformed OAuth responses', async () => {
      const authResult = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');

      mockAxios.post.mockResolvedValueOnce({
        data: {
          // Missing access_token
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      await expect(oauthService.handleCallback('google', 'auth-code', authResult.state!))
        .rejects.toThrow(OAuthError);
    });

    it('should handle network errors', async () => {
      const authResult = await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');

      mockAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(oauthService.handleCallback('google', 'auth-code', authResult.state!))
        .rejects.toThrow(OAuthError);
    });
  });

  describe('State Management', () => {
    it('should clean up expired states', async () => {
      // Create multiple states
      await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');
      await oauthService.getAuthorizationUrl('facebook', 'http://localhost:3000/callback');
      await oauthService.getAuthorizationUrl('github', 'http://localhost:3000/callback');

      // Manually expire some states
      const states = Array.from(mockDatabase.oauthStates.entries());
      states[0][1].createdAt = new Date(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      mockDatabase.oauthStates.set(states[0][0], states[0][1]);

      const result = await oauthService.cleanupExpiredStates();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(1);
      expect(mockDatabase.oauthStates.size).toBe(2);
    });

    it('should not clean up valid states', async () => {
      await oauthService.getAuthorizationUrl('google', 'http://localhost:3000/callback');
      await oauthService.getAuthorizationUrl('facebook', 'http://localhost:3000/callback');

      const result = await oauthService.cleanupExpiredStates();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(0);
      expect(mockDatabase.oauthStates.size).toBe(2);
    });
  });
});