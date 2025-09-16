# Social Authentication Provider Integration Architecture

## Overview

This document outlines the architecture for integrating multiple social authentication providers (Google, Facebook, GitHub, Twitter, LinkedIn) into the Next.js authentication template. The design emphasizes flexibility, security, and maintainability while providing a consistent interface across all providers.

## Core Principles

### 1. Provider Abstraction
- **Unified Interface**: All providers implement the same interface
- **Pluggable Architecture**: Easy to add/remove providers
- **Configuration-Driven**: Provider selection based on environment variables
- **Type Safety**: Strong TypeScript typing throughout

### 2. Security First
- **OAuth 2.0 / OpenID Connect**: Industry-standard protocols
- **PKCE Support**: Enhanced security for public clients
- **State Parameter**: CSRF protection for OAuth flows
- **Secure Token Storage**: Encrypted token management

### 3. Flexibility
- **Multiple Providers**: Support for simultaneous provider usage
- **Account Linking**: Link multiple social accounts to one user
- **Custom Scopes**: Configurable permission requests
- **Provider-Specific Features**: Access to unique provider capabilities

## Architecture Components

### 1. Provider Interface Layer

```typescript
// src/lib/auth/providers/interfaces/oauth-provider.interface.ts
export interface OAuthProvider {
  readonly name: string;
  readonly displayName: string;
  readonly iconUrl?: string;
  readonly supportedScopes: string[];
  
  // Configuration
  configure(config: ProviderConfig): void;
  isConfigured(): boolean;
  
  // OAuth Flow
  getAuthorizationUrl(state: string, redirectUri: string, scopes?: string[]): Promise<string>;
  exchangeCodeForTokens(code: string, redirectUri: string, state?: string): Promise<TokenResponse>;
  refreshAccessToken(refreshToken: string): Promise<TokenResponse>;
  
  // User Information
  getUserProfile(accessToken: string): Promise<UserProfile>;
  getUserEmail(accessToken: string): Promise<string>;
  
  // Token Management
  validateToken(accessToken: string): Promise<boolean>;
  revokeToken(accessToken: string): Promise<boolean>;
  
  // Provider-specific features
  getProviderSpecificData(accessToken: string): Promise<Record<string, any>>;
}

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string[];
  additionalParams?: Record<string, string>;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
  idToken?: string; // For OpenID Connect
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  username?: string;
  verified?: boolean;
  locale?: string;
  timezone?: string;
  providerData: Record<string, any>;
}
```

### 2. Base OAuth Provider Implementation

```typescript
// src/lib/auth/providers/base/base-oauth-provider.ts
import { OAuthProvider, ProviderConfig, TokenResponse, UserProfile } from '../interfaces/oauth-provider.interface';
import { OAuthError, TokenExpiredError, InvalidTokenError } from '../errors/oauth-errors';
import { HttpClient } from '../../utils/http-client';
import { TokenValidator } from '../../utils/token-validator';

export abstract class BaseOAuthProvider implements OAuthProvider {
  protected config: ProviderConfig | null = null;
  protected httpClient: HttpClient;
  protected tokenValidator: TokenValidator;

  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly iconUrl?: string
  ) {
    this.httpClient = new HttpClient();
    this.tokenValidator = new TokenValidator();
  }

  // Abstract methods that must be implemented by each provider
  abstract readonly supportedScopes: string[];
  abstract readonly authorizationEndpoint: string;
  abstract readonly tokenEndpoint: string;
  abstract readonly userInfoEndpoint: string;
  abstract readonly revokeEndpoint?: string;

  configure(config: ProviderConfig): void {
    this.validateConfig(config);
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config !== null && 
           !!this.config.clientId && 
           !!this.config.clientSecret;
  }

  async getAuthorizationUrl(
    state: string, 
    redirectUri: string, 
    scopes?: string[]
  ): Promise<string> {
    if (!this.isConfigured()) {
      throw new OAuthError('Provider not configured', this.name);
    }

    const params = new URLSearchParams({
      client_id: this.config!.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      state,
      scope: this.buildScopeString(scopes),
      ...this.getAdditionalAuthParams()
    });

    return `${this.authorizationEndpoint}?${params.toString()}`;
  }

  async exchangeCodeForTokens(
    code: string, 
    redirectUri: string, 
    state?: string
  ): Promise<TokenResponse> {
    if (!this.isConfigured()) {
      throw new OAuthError('Provider not configured', this.name);
    }

    const tokenData = {
      client_id: this.config!.clientId,
      client_secret: this.config!.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...this.getAdditionalTokenParams()
    };

    try {
      const response = await this.httpClient.post(this.tokenEndpoint, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return this.parseTokenResponse(response.data);
    } catch (error) {
      throw new OAuthError(
        `Token exchange failed: ${error.message}`, 
        this.name, 
        error
      );
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    if (!this.isConfigured()) {
      throw new OAuthError('Provider not configured', this.name);
    }

    const tokenData = {
      client_id: this.config!.clientId,
      client_secret: this.config!.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    };

    try {
      const response = await this.httpClient.post(this.tokenEndpoint, tokenData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return this.parseTokenResponse(response.data);
    } catch (error) {
      throw new TokenExpiredError(
        `Token refresh failed: ${error.message}`, 
        this.name, 
        error
      );
    }
  }

  async validateToken(accessToken: string): Promise<boolean> {
    try {
      await this.getUserProfile(accessToken);
      return true;
    } catch (error) {
      if (error instanceof InvalidTokenError || error instanceof TokenExpiredError) {
        return false;
      }
      throw error;
    }
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    if (!this.revokeEndpoint) {
      return true; // Some providers don't support token revocation
    }

    try {
      await this.httpClient.post(this.revokeEndpoint, {
        token: accessToken,
        client_id: this.config!.clientId,
        client_secret: this.config!.clientSecret
      });
      return true;
    } catch (error) {
      console.warn(`Token revocation failed for ${this.name}:`, error.message);
      return false;
    }
  }

  // Abstract methods for provider-specific implementation
  abstract getUserProfile(accessToken: string): Promise<UserProfile>;
  abstract getUserEmail(accessToken: string): Promise<string>;
  abstract getProviderSpecificData(accessToken: string): Promise<Record<string, any>>;

  // Helper methods
  protected buildScopeString(scopes?: string[]): string {
    const requestedScopes = scopes || this.config?.scopes || this.getDefaultScopes();
    return requestedScopes.join(' ');
  }

  protected abstract getDefaultScopes(): string[];
  protected abstract getAdditionalAuthParams(): Record<string, string>;
  protected abstract getAdditionalTokenParams(): Record<string, string>;
  protected abstract parseTokenResponse(data: any): TokenResponse;

  protected validateConfig(config: ProviderConfig): void {
    if (!config.clientId) {
      throw new OAuthError('Client ID is required', this.name);
    }
    if (!config.clientSecret) {
      throw new OAuthError('Client Secret is required', this.name);
    }
    if (!config.redirectUri) {
      throw new OAuthError('Redirect URI is required', this.name);
    }
  }

  protected async makeAuthenticatedRequest(
    url: string, 
    accessToken: string, 
    options: any = {}
  ): Promise<any> {
    try {
      const response = await this.httpClient.get(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          ...options.headers
        }
      });
      return response.data;
    } catch (error) {
      if (error.response?.status === 401) {
        throw new InvalidTokenError('Invalid or expired access token', this.name);
      }
      throw new OAuthError(
        `API request failed: ${error.message}`, 
        this.name, 
        error
      );
    }
  }
}
```

### 3. Provider Implementations

#### Google OAuth Provider

```typescript
// src/lib/auth/providers/implementations/google-provider.ts
import { BaseOAuthProvider } from '../base/base-oauth-provider';
import { UserProfile, TokenResponse } from '../interfaces/oauth-provider.interface';

export class GoogleOAuthProvider extends BaseOAuthProvider {
  readonly supportedScopes = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  readonly authorizationEndpoint = 'https://accounts.google.com/o/oauth2/v2/auth';
  readonly tokenEndpoint = 'https://oauth2.googleapis.com/token';
  readonly userInfoEndpoint = 'https://www.googleapis.com/oauth2/v2/userinfo';
  readonly revokeEndpoint = 'https://oauth2.googleapis.com/revoke';

  constructor() {
    super(
      'google',
      'Google',
      'https://developers.google.com/identity/images/g-logo.png'
    );
  }

  protected getDefaultScopes(): string[] {
    return ['openid', 'email', 'profile'];
  }

  protected getAdditionalAuthParams(): Record<string, string> {
    return {
      access_type: 'offline',
      prompt: 'consent'
    };
  }

  protected getAdditionalTokenParams(): Record<string, string> {
    return {};
  }

  protected parseTokenResponse(data: any): TokenResponse {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope,
      idToken: data.id_token
    };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const userData = await this.makeAuthenticatedRequest(
      this.userInfoEndpoint,
      accessToken
    );

    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      firstName: userData.given_name,
      lastName: userData.family_name,
      avatar: userData.picture,
      verified: userData.verified_email,
      locale: userData.locale,
      providerData: userData
    };
  }

  async getUserEmail(accessToken: string): Promise<string> {
    const profile = await this.getUserProfile(accessToken);
    return profile.email;
  }

  async getProviderSpecificData(accessToken: string): Promise<Record<string, any>> {
    // Get additional Google-specific data
    const [userInfo, profile] = await Promise.all([
      this.makeAuthenticatedRequest(this.userInfoEndpoint, accessToken),
      this.makeAuthenticatedRequest(
        'https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses,photos,locales',
        accessToken
      )
    ]);

    return {
      userInfo,
      profile,
      provider: 'google'
    };
  }
}
```

#### GitHub OAuth Provider

```typescript
// src/lib/auth/providers/implementations/github-provider.ts
import { BaseOAuthProvider } from '../base/base-oauth-provider';
import { UserProfile, TokenResponse } from '../interfaces/oauth-provider.interface';

export class GitHubOAuthProvider extends BaseOAuthProvider {
  readonly supportedScopes = [
    'user',
    'user:email',
    'read:user',
    'user:follow',
    'public_repo',
    'repo'
  ];

  readonly authorizationEndpoint = 'https://github.com/login/oauth/authorize';
  readonly tokenEndpoint = 'https://github.com/login/oauth/access_token';
  readonly userInfoEndpoint = 'https://api.github.com/user';
  readonly userEmailEndpoint = 'https://api.github.com/user/emails';

  constructor() {
    super(
      'github',
      'GitHub',
      'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png'
    );
  }

  protected getDefaultScopes(): string[] {
    return ['user:email'];
  }

  protected getAdditionalAuthParams(): Record<string, string> {
    return {};
  }

  protected getAdditionalTokenParams(): Record<string, string> {
    return {};
  }

  protected parseTokenResponse(data: any): TokenResponse {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer',
      scope: data.scope
    };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const [userData, emails] = await Promise.all([
      this.makeAuthenticatedRequest(this.userInfoEndpoint, accessToken),
      this.getUserEmails(accessToken)
    ]);

    const primaryEmail = emails.find(email => email.primary)?.email || emails[0]?.email;

    return {
      id: userData.id.toString(),
      email: primaryEmail,
      name: userData.name || userData.login,
      firstName: userData.name?.split(' ')[0],
      lastName: userData.name?.split(' ').slice(1).join(' '),
      avatar: userData.avatar_url,
      username: userData.login,
      verified: emails.find(email => email.primary)?.verified || false,
      providerData: userData
    };
  }

  async getUserEmail(accessToken: string): Promise<string> {
    const emails = await this.getUserEmails(accessToken);
    const primaryEmail = emails.find(email => email.primary);
    return primaryEmail?.email || emails[0]?.email;
  }

  private async getUserEmails(accessToken: string): Promise<any[]> {
    return await this.makeAuthenticatedRequest(
      this.userEmailEndpoint,
      accessToken
    );
  }

  async getProviderSpecificData(accessToken: string): Promise<Record<string, any>> {
    const [user, emails, repos] = await Promise.all([
      this.makeAuthenticatedRequest(this.userInfoEndpoint, accessToken),
      this.getUserEmails(accessToken),
      this.makeAuthenticatedRequest(
        'https://api.github.com/user/repos?sort=updated&per_page=10',
        accessToken
      )
    ]);

    return {
      user,
      emails,
      recentRepos: repos,
      provider: 'github'
    };
  }
}
```

#### Facebook OAuth Provider

```typescript
// src/lib/auth/providers/implementations/facebook-provider.ts
import { BaseOAuthProvider } from '../base/base-oauth-provider';
import { UserProfile, TokenResponse } from '../interfaces/oauth-provider.interface';

export class FacebookOAuthProvider extends BaseOAuthProvider {
  readonly supportedScopes = [
    'email',
    'public_profile',
    'user_friends',
    'user_photos',
    'user_posts'
  ];

  readonly authorizationEndpoint = 'https://www.facebook.com/v18.0/dialog/oauth';
  readonly tokenEndpoint = 'https://graph.facebook.com/v18.0/oauth/access_token';
  readonly userInfoEndpoint = 'https://graph.facebook.com/v18.0/me';

  constructor() {
    super(
      'facebook',
      'Facebook',
      'https://upload.wikimedia.org/wikipedia/commons/5/51/Facebook_f_logo_%282019%29.svg'
    );
  }

  protected getDefaultScopes(): string[] {
    return ['email', 'public_profile'];
  }

  protected getAdditionalAuthParams(): Record<string, string> {
    return {};
  }

  protected getAdditionalTokenParams(): Record<string, string> {
    return {};
  }

  protected parseTokenResponse(data: any): TokenResponse {
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type || 'Bearer'
    };
  }

  async getUserProfile(accessToken: string): Promise<UserProfile> {
    const userData = await this.makeAuthenticatedRequest(
      `${this.userInfoEndpoint}?fields=id,name,email,first_name,last_name,picture.width(200).height(200)`,
      accessToken
    );

    return {
      id: userData.id,
      email: userData.email,
      name: userData.name,
      firstName: userData.first_name,
      lastName: userData.last_name,
      avatar: userData.picture?.data?.url,
      verified: true, // Facebook emails are typically verified
      providerData: userData
    };
  }

  async getUserEmail(accessToken: string): Promise<string> {
    const profile = await this.getUserProfile(accessToken);
    return profile.email;
  }

  async getProviderSpecificData(accessToken: string): Promise<Record<string, any>> {
    const userData = await this.makeAuthenticatedRequest(
      `${this.userInfoEndpoint}?fields=id,name,email,first_name,last_name,picture.width(400).height(400),cover,locale,timezone,verified`,
      accessToken
    );

    return {
      user: userData,
      provider: 'facebook'
    };
  }
}
```

### 4. Provider Factory

```typescript
// src/lib/auth/providers/factory/provider-factory.ts
import { OAuthProvider } from '../interfaces/oauth-provider.interface';
import { GoogleOAuthProvider } from '../implementations/google-provider';
import { GitHubOAuthProvider } from '../implementations/github-provider';
import { FacebookOAuthProvider } from '../implementations/facebook-provider';
import { TwitterOAuthProvider } from '../implementations/twitter-provider';
import { LinkedInOAuthProvider } from '../implementations/linkedin-provider';

export enum SupportedProvider {
  GOOGLE = 'google',
  GITHUB = 'github',
  FACEBOOK = 'facebook',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin'
}

export class ProviderFactory {
  private static providers: Map<string, OAuthProvider> = new Map();

  public static getProvider(providerName: SupportedProvider): OAuthProvider {
    if (!this.providers.has(providerName)) {
      const provider = this.createProvider(providerName);
      this.providers.set(providerName, provider);
    }
    return this.providers.get(providerName)!;
  }

  public static getAllProviders(): OAuthProvider[] {
    return Object.values(SupportedProvider).map(provider => 
      this.getProvider(provider)
    );
  }

  public static getConfiguredProviders(): OAuthProvider[] {
    return this.getAllProviders().filter(provider => provider.isConfigured());
  }

  public static isProviderSupported(providerName: string): boolean {
    return Object.values(SupportedProvider).includes(providerName as SupportedProvider);
  }

  private static createProvider(providerName: SupportedProvider): OAuthProvider {
    switch (providerName) {
      case SupportedProvider.GOOGLE:
        return new GoogleOAuthProvider();
      case SupportedProvider.GITHUB:
        return new GitHubOAuthProvider();
      case SupportedProvider.FACEBOOK:
        return new FacebookOAuthProvider();
      case SupportedProvider.TWITTER:
        return new TwitterOAuthProvider();
      case SupportedProvider.LINKEDIN:
        return new LinkedInOAuthProvider();
      default:
        throw new Error(`Unsupported provider: ${providerName}`);
    }
  }

  public static configureProvider(
    providerName: SupportedProvider, 
    config: ProviderConfig
  ): void {
    const provider = this.getProvider(providerName);
    provider.configure(config);
  }

  public static configureAllProviders(): void {
    Object.values(SupportedProvider).forEach(providerName => {
      const config = this.getProviderConfigFromEnv(providerName);
      if (config) {
        this.configureProvider(providerName, config);
      }
    });
  }

  private static getProviderConfigFromEnv(providerName: SupportedProvider): ProviderConfig | null {
    const prefix = providerName.toUpperCase();
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    const redirectUri = process.env[`${prefix}_REDIRECT_URI`] || 
                       process.env.OAUTH_REDIRECT_URI ||
                       `${process.env.NEXTAUTH_URL}/api/auth/callback/${providerName}`;

    if (!clientId || !clientSecret) {
      return null;
    }

    return {
      clientId,
      clientSecret,
      redirectUri,
      scopes: process.env[`${prefix}_SCOPES`]?.split(','),
      additionalParams: this.parseAdditionalParams(process.env[`${prefix}_ADDITIONAL_PARAMS`])
    };
  }

  private static parseAdditionalParams(params?: string): Record<string, string> {
    if (!params) return {};
    
    try {
      return JSON.parse(params);
    } catch {
      return {};
    }
  }
}
```

### 5. OAuth Service Layer

```typescript
// src/lib/auth/services/oauth.service.ts
import { OAuthProvider, UserProfile, TokenResponse } from '../providers/interfaces/oauth-provider.interface';
import { ProviderFactory, SupportedProvider } from '../providers/factory/provider-factory';
import { StateManager } from '../utils/state-manager';
import { TokenManager } from '../utils/token-manager';
import { UserService } from './user.service';
import { OAuthAccountRepository } from '../../database/interfaces/oauth-repository.interface';
import { User } from '../../database/types/user.types';
import { OAuthAccount } from '../../database/types/oauth.types';

export interface OAuthAuthenticationResult {
  user: User;
  isNewUser: boolean;
  linkedAccount: OAuthAccount;
  tokens: TokenResponse;
}

export class OAuthService {
  constructor(
    private userService: UserService,
    private oauthRepository: OAuthAccountRepository,
    private stateManager: StateManager,
    private tokenManager: TokenManager
  ) {}

  /**
   * Get authorization URL for a provider
   */
  async getAuthorizationUrl(
    providerName: SupportedProvider,
    redirectUri?: string,
    scopes?: string[]
  ): Promise<{ url: string; state: string }> {
    const provider = ProviderFactory.getProvider(providerName);
    
    if (!provider.isConfigured()) {
      throw new Error(`Provider ${providerName} is not configured`);
    }

    const state = await this.stateManager.generateState({
      provider: providerName,
      timestamp: Date.now(),
      redirectUri
    });

    const authUrl = await provider.getAuthorizationUrl(
      state,
      redirectUri || this.getDefaultRedirectUri(providerName),
      scopes
    );

    return { url: authUrl, state };
  }

  /**
   * Handle OAuth callback and authenticate user
   */
  async handleCallback(
    providerName: SupportedProvider,
    code: string,
    state: string,
    redirectUri?: string
  ): Promise<OAuthAuthenticationResult> {
    // Validate state
    const stateData = await this.stateManager.validateState(state);
    if (!stateData || stateData.provider !== providerName) {
      throw new Error('Invalid state parameter');
    }

    const provider = ProviderFactory.getProvider(providerName);
    
    // Exchange code for tokens
    const tokens = await provider.exchangeCodeForTokens(
      code,
      redirectUri || this.getDefaultRedirectUri(providerName),
      state
    );

    // Get user profile from provider
    const profile = await provider.getUserProfile(tokens.accessToken);

    // Find or create user
    const result = await this.findOrCreateUser(providerName, profile, tokens);

    // Store/update OAuth account
    await this.storeOAuthAccount(result.user.id, providerName, profile, tokens);

    return result;
  }

  /**
   * Link an OAuth account to an existing user
   */
  async linkAccount(
    userId: string,
    providerName: SupportedProvider,
    code: string,
    state: string,
    redirectUri?: string
  ): Promise<OAuthAccount> {
    // Validate state
    const stateData = await this.stateManager.validateState(state);
    if (!stateData || stateData.provider !== providerName) {
      throw new Error('Invalid state parameter');
    }

    const provider = ProviderFactory.getProvider(providerName);
    
    // Exchange code for tokens
    const tokens = await provider.exchangeCodeForTokens(
      code,
      redirectUri || this.getDefaultRedirectUri(providerName),
      state
    );

    // Get user profile from provider
    const profile = await provider.getUserProfile(tokens.accessToken);

    // Check if account is already linked to another user
    const existingAccount = await this.oauthRepository.findByProvider(
      providerName,
      profile.id
    );

    if (existingAccount && existingAccount.userId !== userId) {
      throw new Error('This account is already linked to another user');
    }

    // Store OAuth account
    return await this.storeOAuthAccount(userId, providerName, profile, tokens);
  }

  /**
   * Unlink an OAuth account from a user
   */
  async unlinkAccount(userId: string, providerName: SupportedProvider): Promise<boolean> {
    return await this.oauthRepository.unlinkAccount(userId, providerName);
  }

  /**
   * Get linked providers for a user
   */
  async getLinkedProviders(userId: string): Promise<string[]> {
    return await this.oauthRepository.getLinkedProviders(userId);
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(
    userId: string,
    providerName: SupportedProvider
  ): Promise<TokenResponse | null> {
    const account = await this.oauthRepository.findByUserAndProvider(userId, providerName);
    if (!account || !account.refreshToken) {
      return null;
    }

    const provider = ProviderFactory.getProvider(providerName);
    
    try {
      const newTokens = await provider.refreshAccessToken(account.refreshToken);
      
      // Update stored tokens
      await this.oauthRepository.updateTokens(
        account.id,
        newTokens.accessToken,
        newTokens.refreshToken
      );

      return newTokens;
    } catch (error) {
      console.error(`Failed to refresh tokens for ${providerName}:`, error);
      return null;
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): Array<{ name: string; displayName: string; iconUrl?: string }> {
    return ProviderFactory.getConfiguredProviders().map(provider => ({
      name: provider.name,
      displayName: provider.displayName,
      iconUrl: provider.iconUrl
    }));
  }

  private async findOrCreateUser(
    providerName: SupportedProvider,
    profile: UserProfile,
    tokens: TokenResponse
  ): Promise<{ user: User; isNewUser: boolean }> {
    // First, check if account is already linked
    const existingAccount = await this.oauthRepository.findByProvider(
      providerName,
      profile.id
    );

    if (existingAccount) {
      const user = await this.userService.findById(existingAccount.userId);
      if (user) {
        return { user, isNewUser: false };
      }
    }

    // Check if user exists by email
    let user = await this.userService.findByEmail(profile.email);
    
    if (user) {
      return { user, isNewUser: false };
    }

    // Create new user
    user = await this.userService.createUser({
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      fullName: profile.name,
      avatar: profile.avatar,
      isEmailVerified: profile.verified || false
    });

    return { user, isNewUser: true };
  }

  private async storeOAuthAccount(
    userId: string,
    providerName: SupportedProvider,
    profile: UserProfile,
    tokens: TokenResponse
  ): Promise<OAuthAccount> {
    const existingAccount = await this.oauthRepository.findByUserAndProvider(
      userId,
      providerName
    );

    if (existingAccount) {
      // Update existing account
      await this.oauthRepository.updateTokens(
        existingAccount.id,
        tokens.accessToken,
        tokens.refreshToken
      );
      return existingAccount;
    }

    // Create new account link
    return await this.oauthRepository.linkAccount({
      userId,
      provider: providerName as any,
      providerId: profile.id,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresIn ? 
        new Date(Date.now() + tokens.expiresIn * 1000) : undefined,
      scope: tokens.scope,
      providerData: profile.providerData
    });
  }

  private getDefaultRedirectUri(providerName: SupportedProvider): string {
    return `${process.env.NEXTAUTH_URL}/api/auth/callback/${providerName}`;
  }
}
```

### 6. API Routes Implementation

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OAuthService } from '../../../../lib/auth/services/oauth.service';
import { ProviderFactory, SupportedProvider } from '../../../../lib/auth/providers/factory/provider-factory';
import { getRepositoryFactory } from '../../../../lib/database';
import { createUserService } from '../../../../services/user.service';
import { StateManager } from '../../../../lib/auth/utils/state-manager';
import { TokenManager } from '../../../../lib/auth/utils/token-manager';

// Initialize providers
ProviderFactory.configureAllProviders();

export async function GET(request: NextRequest) {
  const { pathname, searchParams } = new URL(request.url);
  const pathSegments = pathname.split('/').filter(Boolean);
  const action = pathSegments[pathSegments.length - 1];
  const provider = pathSegments[pathSegments.length - 2];

  try {
    switch (action) {
      case 'signin':
        return handleSignIn(provider as SupportedProvider, searchParams);
      
      case 'callback':
        return handleCallback(provider as SupportedProvider, searchParams);
      
      case 'providers':
        return handleGetProviders();
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('OAuth error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}

async function handleSignIn(
  provider: SupportedProvider,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  if (!ProviderFactory.isProviderSupported(provider)) {
    return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 });
  }

  const oauthService = await createOAuthService();
  const redirectUri = searchParams.get('redirect_uri');
  const scopes = searchParams.get('scopes')?.split(',');

  const { url, state } = await oauthService.getAuthorizationUrl(
    provider,
    redirectUri || undefined,
    scopes
  );

  return NextResponse.redirect(url);
}

async function handleCallback(
  provider: SupportedProvider,
  searchParams: URLSearchParams
): Promise<NextResponse> {
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/auth/error?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing code or state parameter' },
      { status: 400 }
    );
  }

  const oauthService = await createOAuthService();
  
  try {
    const result = await oauthService.handleCallback(provider, code, state);
    
    // Create session or JWT token
    const sessionToken = await createUserSession(result.user);
    
    // Redirect to success page or dashboard
    const response = NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/dashboard`
    );
    
    // Set session cookie
    response.cookies.set('session-token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 days
    });

    return response;
  } catch (error) {
    console.error('Callback error:', error);
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/auth/error?error=${encodeURIComponent(error.message)}`
    );
  }
}

async function handleGetProviders(): Promise<NextResponse> {
  const oauthService = await createOAuthService();
  const providers = oauthService.getAvailableProviders();
  
  return NextResponse.json({ providers });
}

async function createOAuthService(): Promise<OAuthService> {
  const repositoryFactory = await getRepositoryFactory();
  const userService = await createUserService();
  const oauthRepository = repositoryFactory.getOAuthRepository();
  const stateManager = new StateManager();
  const tokenManager = new TokenManager();

  return new OAuthService(
    userService,
    oauthRepository,
    stateManager,
    tokenManager
  );
}

async function createUserSession(user: User): Promise<string> {
  // Implementation depends on session management strategy
  // This could be JWT, database sessions, etc.
  return 'session-token-placeholder';
}
```

### 7. Frontend Components

#### Social Login Button Component

```typescript
// src/components/auth/SocialLoginButton.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { Button } from '../ui/button';

interface SocialLoginButtonProps {
  provider: {
    name: string;
    displayName: string;
    iconUrl?: string;
  };
  onLogin: (providerName: string) => void;
  disabled?: boolean;
  className?: string;
}

export function SocialLoginButton({
  provider,
  onLogin,
  disabled = false,
  className = ''
}: SocialLoginButtonProps) {
  const handleClick = () => {
    if (!disabled) {
      onLogin(provider.name);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      className={`w-full flex items-center justify-center gap-3 ${className}`}
    >
      {provider.iconUrl && (
        <Image
          src={provider.iconUrl}
          alt={`${provider.displayName} icon`}
          width={20}
          height={20}
          className="w-5 h-5"
        />
      )}
      Continue with {provider.displayName}
    </Button>
  );
}
```

#### Social Login Container

```typescript
// src/components/auth/SocialLoginContainer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { SocialLoginButton } from './SocialLoginButton';
import { Separator } from '../ui/separator';

interface Provider {
  name: string;
  displayName: string;
  iconUrl?: string;
}

interface SocialLoginContainerProps {
  onProviderSelect?: (provider: string) => void;
  className?: string;
}

export function SocialLoginContainer({
  onProviderSelect,
  className = ''
}: SocialLoginContainerProps) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/auth/providers');
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderLogin = (providerName: string) => {
    if (onProviderSelect) {
      onProviderSelect(providerName);
    } else {
      // Default behavior: redirect to OAuth flow
      window.location.href = `/api/auth/signin/${providerName}`;
    }
  };

  if (loading) {
    return (
      <div className={`space-y-3 ${className}`}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="relative">
        <Separator />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="bg-white px-2 text-sm text-gray-500">
            Or continue with
          </span>
        </div>
      </div>
      
      <div className="space-y-3">
        {providers.map((provider) => (
          <SocialLoginButton
            key={provider.name}
            provider={provider}
            onLogin={handleProviderLogin}
          />
        ))}
      </div>
    </div>
  );
}
```

## Security Considerations

### 1. State Parameter Protection

```typescript
// src/lib/auth/utils/state-manager.ts
import { randomBytes, createHmac } from 'crypto';

export interface StateData {
  provider: string;
  timestamp: number;
  redirectUri?: string;
  userId?: string; // For account linking
}

export class StateManager {
  private readonly secret: string;
  private readonly expirationTime: number = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.secret = process.env.OAUTH_STATE_SECRET || 'default-secret';
  }

  async generateState(data: StateData): Promise<string> {
    const payload = JSON.stringify(data);
    const nonce = randomBytes(16).toString('hex');
    const signature = this.createSignature(payload + nonce);
    
    const state = Buffer.from(
      JSON.stringify({ payload, nonce, signature })
    ).toString('base64url');
    
    return state;
  }

  async validateState(state: string): Promise<StateData | null> {
    try {
      const decoded = JSON.parse(
        Buffer.from(state, 'base64url').toString()
      );
      
      const { payload, nonce, signature } = decoded;
      
      // Verify signature
      const expectedSignature = this.createSignature(payload + nonce);
      if (signature !== expectedSignature) {
        return null;
      }
      
      const data: StateData = JSON.parse(payload);
      
      // Check expiration
      if (Date.now() - data.timestamp > this.expirationTime) {
        return null;
      }
      
      return data;
    } catch (error) {
      return null;
    }
  }

  private createSignature(data: string): string {
    return createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');
  }
}
```

### 2. Token Security

```typescript
// src/lib/auth/utils/token-manager.ts
import { createCipher, createDecipher, randomBytes } from 'crypto';

export class TokenManager {
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || 'default-key';
  }

  encryptToken(token: string): string {
    const iv = randomBytes(16);
    const cipher = createCipher('aes-256-cbc', this.encryptionKey);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  decryptToken(encryptedToken: string): string {
    const [ivHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    
    const decipher = createDecipher('aes-256-cbc', this.encryptionKey);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  isTokenExpired(expiresAt?: Date): boolean {
    if (!expiresAt) return false;
    return Date.now() >= expiresAt.getTime();
  }
}
```

## Configuration Management

### Environment Variables

```bash
# .env.example

# Database Configuration
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:password@localhost:5432/auth_db

# Application URLs
NEXTAUTH_URL=http://localhost:3000
OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/callback

# Security Keys
OAUTH_STATE_SECRET=your-state-secret-key
TOKEN_ENCRYPTION_KEY=your-token-encryption-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_SCOPES=openid,email,profile

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_SCOPES=user:email

# Facebook OAuth
FACEBOOK_CLIENT_ID=your-facebook-app-id
FACEBOOK_CLIENT_SECRET=your-facebook-app-secret
FACEBOOK_SCOPES=email,public_profile

# Twitter OAuth
TWITTER_CLIENT_ID=your-twitter-client-id
TWITTER_CLIENT_SECRET=your-twitter-client-secret

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=your-linkedin-client-id
LINKEDIN_CLIENT_SECRET=your-linkedin-client-secret
```

### Provider Configuration Schema

```typescript
// src/lib/auth/config/provider-config.schema.ts
import { z } from 'zod';

export const ProviderConfigSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  redirectUri: z.string().url('Invalid redirect URI'),
  scopes: z.array(z.string()).optional(),
  additionalParams: z.record(z.string()).optional()
});

export const OAuthConfigSchema = z.object({
  providers: z.record(ProviderConfigSchema),
  stateSecret: z.string().min(32, 'State secret must be at least 32 characters'),
  tokenEncryptionKey: z.string().min(32, 'Token encryption key must be at least 32 characters'),
  sessionDuration: z.number().positive().default(7 * 24 * 60 * 60), // 7 days in seconds
  allowAccountLinking: z.boolean().default(true),
  requireEmailVerification: z.boolean().default(true)
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
```

This social authentication architecture provides a robust, secure, and flexible foundation for integrating multiple OAuth providers into the Next.js authentication template. The design emphasizes security best practices, maintainability, and ease of configuration while supporting the diverse requirements of different social authentication providers.