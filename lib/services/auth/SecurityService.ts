import * as crypto from 'crypto';
import { AuthError } from './types';

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (identifier: string) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked: boolean;
}

interface CSRFTokenData {
  token: string;
  sessionId: string;
  createdAt: Date;
  expiresAt: Date;
}

interface SecurityConfig {
  csrf: {
    enabled: boolean;
    tokenLength: number;
    tokenExpiry: number; // in minutes
    cookieName: string;
    headerName: string;
    sameSite: 'strict' | 'lax' | 'none';
    secure: boolean;
  };
  rateLimit: {
    enabled: boolean;
    global: RateLimitConfig;
    login: RateLimitConfig;
    register: RateLimitConfig;
    passwordReset: RateLimitConfig;
    emailVerification: RateLimitConfig;
  };
  inputValidation: {
    enabled: boolean;
    maxFieldLength: number;
    allowedCharsets: {
      email: RegExp;
      password: RegExp;
      name: RegExp;
    };
    blockedPatterns: RegExp[];
  };
  session: {
    cookieName: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number; // in seconds
  };
}

export class SecurityService {
  private config: SecurityConfig;
  private rateLimitStore: Map<string, RateLimitEntry> = new Map();
  private csrfTokenStore: Map<string, CSRFTokenData> = new Map();
  private blockedIPs: Set<string> = new Set();
  private suspiciousActivity: Map<string, number> = new Map();

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = this.mergeWithDefaults(config);
  }

  /**
   * Merge user config with default security configuration
   */
  private mergeWithDefaults(userConfig: Partial<SecurityConfig>): SecurityConfig {
    const defaultConfig: SecurityConfig = {
      csrf: {
        enabled: true,
        tokenLength: 32,
        tokenExpiry: 60, // 1 hour
        cookieName: '__csrf-token',
        headerName: 'x-csrf-token',
        sameSite: 'strict',
        secure: process.env.NODE_ENV === 'production',
      },
      rateLimit: {
        enabled: true,
        global: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 100,
        },
        login: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          maxRequests: 5,
          skipSuccessfulRequests: true,
        },
        register: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 3,
        },
        passwordReset: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 3,
        },
        emailVerification: {
          windowMs: 60 * 60 * 1000, // 1 hour
          maxRequests: 5,
        },
      },
      inputValidation: {
        enabled: true,
        maxFieldLength: 1000,
        allowedCharsets: {
          email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
          password: /^[\x20-\x7E]*$/, // Printable ASCII characters
          name: /^[a-zA-Z\s\-'\.]+$/,
        },
        blockedPatterns: [
          /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
          /javascript:/gi, // JavaScript protocol
          /on\w+\s*=/gi, // Event handlers
          /expression\s*\(/gi, // CSS expressions
          /vbscript:/gi, // VBScript protocol
        ],
      },
      session: {
        cookieName: '__session',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60, // 24 hours
      },
    };

    return {
      csrf: { ...defaultConfig.csrf, ...userConfig.csrf },
      rateLimit: {
        enabled: userConfig.rateLimit?.enabled ?? defaultConfig.rateLimit.enabled,
        global: { ...defaultConfig.rateLimit.global, ...userConfig.rateLimit?.global },
        login: { ...defaultConfig.rateLimit.login, ...userConfig.rateLimit?.login },
        register: { ...defaultConfig.rateLimit.register, ...userConfig.rateLimit?.register },
        passwordReset: { ...defaultConfig.rateLimit.passwordReset, ...userConfig.rateLimit?.passwordReset },
        emailVerification: { ...defaultConfig.rateLimit.emailVerification, ...userConfig.rateLimit?.emailVerification },
      },
      inputValidation: { ...defaultConfig.inputValidation, ...userConfig.inputValidation },
      session: { ...defaultConfig.session, ...userConfig.session },
    };
  }

  /**
   * Generate CSRF token for a session
   * @param sessionId - Session identifier
   * @returns CSRF token
   */
  generateCSRFToken(sessionId: string): string {
    if (!this.config.csrf.enabled) {
      return '';
    }

    const token = crypto.randomBytes(this.config.csrf.tokenLength).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.csrf.tokenExpiry * 60 * 1000);

    this.csrfTokenStore.set(token, {
      token,
      sessionId,
      createdAt: now,
      expiresAt,
    });

    return token;
  }

  /**
   * Validate CSRF token
   * @param token - CSRF token to validate
   * @param sessionId - Session identifier
   * @returns boolean indicating if token is valid
   */
  validateCSRFToken(token: string, sessionId: string): boolean {
    if (!this.config.csrf.enabled) {
      return true;
    }

    if (!token || !sessionId) {
      return false;
    }

    const tokenData = this.csrfTokenStore.get(token);
    if (!tokenData) {
      return false;
    }

    // Check if token belongs to the session
    if (tokenData.sessionId !== sessionId) {
      return false;
    }

    // Check if token has expired
    if (tokenData.expiresAt < new Date()) {
      this.csrfTokenStore.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Revoke CSRF token
   * @param token - CSRF token to revoke
   */
  revokeCSRFToken(token: string): void {
    this.csrfTokenStore.delete(token);
  }

  /**
   * Check rate limit for a specific endpoint and identifier
   * @param endpoint - Endpoint name (login, register, etc.)
   * @param identifier - Identifier (IP address, user ID, etc.)
   * @param success - Whether the request was successful
   * @returns boolean indicating if request is allowed
   */
  checkRateLimit(endpoint: keyof SecurityConfig['rateLimit'], identifier: string, success?: boolean): boolean {
    if (!this.config.rateLimit.enabled || endpoint === 'enabled') {
      return true;
    }

    // Check if IP is blocked
    if (this.blockedIPs.has(identifier)) {
      throw new AuthError('IP address is blocked', 'IP_BLOCKED', 429);
    }

    const rateLimitConfig = this.config.rateLimit[endpoint] as RateLimitConfig;
    if (!rateLimitConfig) {
      return true;
    }

    const key = rateLimitConfig.keyGenerator ? rateLimitConfig.keyGenerator(identifier) : `${endpoint}:${identifier}`;
    const now = Date.now();
    
    let entry = this.rateLimitStore.get(key);
    
    // Initialize or reset if window has passed
    if (!entry || now >= entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + rateLimitConfig.windowMs,
        blocked: false,
      };
    }

    // Skip counting based on configuration
    const shouldSkip = (
      (success && rateLimitConfig.skipSuccessfulRequests) ||
      (!success && rateLimitConfig.skipFailedRequests)
    );

    if (!shouldSkip) {
      entry.count++;
    }

    // Check if limit exceeded
    if (entry.count > rateLimitConfig.maxRequests) {
      entry.blocked = true;
      this.rateLimitStore.set(key, entry);
      
      // Track suspicious activity
      this.trackSuspiciousActivity(identifier);
      
      throw new AuthError(
        `Rate limit exceeded for ${endpoint}. Try again later.`,
        'RATE_LIMIT_EXCEEDED',
        429
      );
    }

    this.rateLimitStore.set(key, entry);
    return true;
  }

  /**
   * Get remaining requests for rate limit
   * @param endpoint - Endpoint name
   * @param identifier - Identifier
   * @returns Remaining requests and reset time
   */
  getRateLimitInfo(endpoint: keyof SecurityConfig['rateLimit'], identifier: string): {
    remaining: number;
    resetTime: number;
    blocked: boolean;
  } {
    if (!this.config.rateLimit.enabled || endpoint === 'enabled') {
      return { remaining: Infinity, resetTime: 0, blocked: false };
    }

    const rateLimitConfig = this.config.rateLimit[endpoint] as RateLimitConfig;
    if (!rateLimitConfig) {
      return { remaining: Infinity, resetTime: 0, blocked: false };
    }

    const key = rateLimitConfig.keyGenerator ? rateLimitConfig.keyGenerator(identifier) : `${endpoint}:${identifier}`;
    const entry = this.rateLimitStore.get(key);

    if (!entry || Date.now() >= entry.resetTime) {
      return {
        remaining: rateLimitConfig.maxRequests,
        resetTime: Date.now() + rateLimitConfig.windowMs,
        blocked: false,
      };
    }

    return {
      remaining: Math.max(0, rateLimitConfig.maxRequests - entry.count),
      resetTime: entry.resetTime,
      blocked: entry.blocked,
    };
  }

  /**
   * Validate input data against security rules
   * @param data - Input data to validate
   * @param fieldType - Type of field (email, password, name)
   * @returns boolean indicating if input is valid
   */
  validateInput(data: string, fieldType: keyof SecurityConfig['inputValidation']['allowedCharsets']): boolean {
    if (!this.config.inputValidation.enabled) {
      return true;
    }

    // Check field length
    if (data.length > this.config.inputValidation.maxFieldLength) {
      throw new AuthError('Input exceeds maximum allowed length', 'INPUT_TOO_LONG', 400);
    }

    // Check against allowed charset
    const allowedPattern = this.config.inputValidation.allowedCharsets[fieldType];
    if (allowedPattern && !allowedPattern.test(data)) {
      throw new AuthError('Input contains invalid characters', 'INVALID_INPUT_FORMAT', 400);
    }

    // Check against blocked patterns
    for (const pattern of this.config.inputValidation.blockedPatterns) {
      if (pattern.test(data)) {
        throw new AuthError('Input contains potentially malicious content', 'MALICIOUS_INPUT', 400);
      }
    }

    return true;
  }

  /**
   * Sanitize input data
   * @param data - Input data to sanitize
   * @returns Sanitized data
   */
  sanitizeInput(data: string): string {
    if (!this.config.inputValidation.enabled) {
      return data;
    }

    // Remove potentially dangerous characters
    let sanitized = data
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();

    // Limit length
    if (sanitized.length > this.config.inputValidation.maxFieldLength) {
      sanitized = sanitized.substring(0, this.config.inputValidation.maxFieldLength);
    }

    return sanitized;
  }

  /**
   * Track suspicious activity
   * @param identifier - Identifier (IP address, user ID, etc.)
   */
  private trackSuspiciousActivity(identifier: string): void {
    const currentCount = this.suspiciousActivity.get(identifier) || 0;
    const newCount = currentCount + 1;
    
    this.suspiciousActivity.set(identifier, newCount);

    // Block IP after multiple suspicious activities
    if (newCount >= 10) {
      this.blockedIPs.add(identifier);
      console.warn(`IP ${identifier} has been blocked due to suspicious activity`);
    }
  }

  /**
   * Block IP address
   * @param ip - IP address to block
   * @param reason - Reason for blocking
   */
  blockIP(ip: string, reason: string = 'Manual block'): void {
    this.blockedIPs.add(ip);
    console.warn(`IP ${ip} blocked: ${reason}`);
  }

  /**
   * Unblock IP address
   * @param ip - IP address to unblock
   */
  unblockIP(ip: string): void {
    this.blockedIPs.delete(ip);
    this.suspiciousActivity.delete(ip);
    console.info(`IP ${ip} unblocked`);
  }

  /**
   * Check if IP is blocked
   * @param ip - IP address to check
   * @returns boolean indicating if IP is blocked
   */
  isIPBlocked(ip: string): boolean {
    return this.blockedIPs.has(ip);
  }

  /**
   * Generate secure session ID
   * @returns Secure session ID
   */
  generateSessionId(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate session ID format
   * @param sessionId - Session ID to validate
   * @returns boolean indicating if session ID is valid
   */
  validateSessionId(sessionId: string): boolean {
    // Check if session ID is a valid hex string of expected length
    return /^[a-f0-9]{64}$/.test(sessionId);
  }

  /**
   * Generate secure random token
   * @param length - Token length in bytes
   * @returns Secure random token
   */
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash sensitive data
   * @param data - Data to hash
   * @param salt - Optional salt
   * @returns Hashed data
   */
  hashSensitiveData(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHash('sha256');
    hash.update(data + actualSalt);
    return hash.digest('hex');
  }

  /**
   * Clean up expired tokens and rate limit entries
   */
  async cleanup(): Promise<void> {
    const now = new Date();
    const currentTime = Date.now();

    // Clean up expired CSRF tokens
    let expiredCSRFTokens = 0;
    for (const [token, tokenData] of Array.from(this.csrfTokenStore.entries())) {
      if (tokenData.expiresAt < now) {
        this.csrfTokenStore.delete(token);
        expiredCSRFTokens++;
      }
    }

    // Clean up expired rate limit entries
    let expiredRateLimits = 0;
    for (const [key, entry] of Array.from(this.rateLimitStore.entries())) {
      if (currentTime >= entry.resetTime) {
        this.rateLimitStore.delete(key);
        expiredRateLimits++;
      }
    }

    console.log(`Security cleanup: ${expiredCSRFTokens} CSRF tokens, ${expiredRateLimits} rate limit entries`);
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    csrfTokens: number;
    rateLimitEntries: number;
    blockedIPs: number;
    suspiciousActivities: number;
  } {
    return {
      csrfTokens: this.csrfTokenStore.size,
      rateLimitEntries: this.rateLimitStore.size,
      blockedIPs: this.blockedIPs.size,
      suspiciousActivities: this.suspiciousActivity.size,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param newConfig - New configuration to merge
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = this.mergeWithDefaults(newConfig);
  }

  /**
   * Reset all security data (use with caution)
   */
  reset(): void {
    this.rateLimitStore.clear();
    this.csrfTokenStore.clear();
    this.blockedIPs.clear();
    this.suspiciousActivity.clear();
    console.warn('All security data has been reset');
  }
}

// Export factory function for creating security service instances
export const createSecurityService = (config?: Partial<SecurityConfig>): SecurityService => {
  return new SecurityService(config);
};

// Export default configurations for different environments
export const createDevelopmentSecurityConfig = (): Partial<SecurityConfig> => ({
  csrf: {
    enabled: false, // Disabled for easier development
    secure: false,
  },
  rateLimit: {
    enabled: true,
    login: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 20, // More lenient for development
    },
    register: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 10,
    },
  },
  session: {
    secure: false,
  },
} as any);

export const createProductionSecurityConfig = (): Partial<SecurityConfig> => ({
  csrf: {
    enabled: true,
    secure: true,
    sameSite: 'strict',
  },
  rateLimit: {
    enabled: true,
    login: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5, // Strict rate limiting
    },
    register: {
      windowMs: 60 * 60 * 1000,
      maxRequests: 3,
    },
  },
  session: {
    secure: true,
    sameSite: 'strict',
  },
} as any);

// Middleware helper functions
interface MiddlewareRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: Record<string, unknown>;
  sessionID?: string;
  session?: { id?: string };
  ip?: string;
  connection?: { remoteAddress?: string };
}

interface MiddlewareResponse {
  status: (code: number) => { json: (data: Record<string, unknown>) => void };
}

type NextFunction = (error?: any) => void;

export const createCSRFMiddleware = (securityService: SecurityService) => {
  return (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next();
    }

    const token = req.headers[securityService.getConfig().csrf.headerName] || req.body?._csrf;
    const sessionId = req.sessionID || req.session?.id;

    if (!securityService.validateCSRFToken(token as string, sessionId as string)) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
  };
};

export const createRateLimitMiddleware = (securityService: SecurityService, endpoint: keyof SecurityConfig['rateLimit']) => {
  return (req: MiddlewareRequest, res: MiddlewareResponse, next: NextFunction) => {
    try {
      const identifier = req.ip || req.connection?.remoteAddress;
      securityService.checkRateLimit(endpoint, identifier as string);
      next();
    } catch (error) {
      if (error instanceof AuthError && error.code === 'RATE_LIMIT_EXCEEDED') {
        return res.status(429).json({ error: error.message });
      }
      next(error);
    }
  };
};