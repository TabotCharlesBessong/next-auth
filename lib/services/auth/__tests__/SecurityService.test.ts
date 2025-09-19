import { SecurityService, createSecurityService, createDevelopmentSecurityConfig, createProductionSecurityConfig } from '../SecurityService';
import { AuthError } from '../types';

describe('SecurityService', () => {
  let securityService: SecurityService;

  beforeEach(() => {
    securityService = createSecurityService();
  });

  describe('CSRF Protection', () => {
    describe('generateCSRFToken', () => {
      it('should generate a valid CSRF token', () => {
        const sessionId = 'test-session-123';
        const token = securityService.generateCSRFToken(sessionId);

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);
      });

      it('should generate different tokens for different sessions', () => {
        const sessionId1 = 'session-1';
        const sessionId2 = 'session-2';

        const token1 = securityService.generateCSRFToken(sessionId1);
        const token2 = securityService.generateCSRFToken(sessionId2);

        expect(token1).not.toBe(token2);
      });

      it('should return empty string when CSRF is disabled', () => {
        const disabledService = createSecurityService({
          csrf: { enabled: false, tokenLength: 32, tokenExpiry: 60, cookieName: '__csrf-token', headerName: 'x-csrf-token', sameSite: 'strict', secure: false }
        });

        const token = disabledService.generateCSRFToken('session-123');
        expect(token).toBe('');
      });
    });

    describe('validateCSRFToken', () => {
      it('should validate correct CSRF token', () => {
        const sessionId = 'test-session-123';
        const token = securityService.generateCSRFToken(sessionId);

        const isValid = securityService.validateCSRFToken(token, sessionId);
        expect(isValid).toBe(true);
      });

      it('should reject token for different session', () => {
        const sessionId1 = 'session-1';
        const sessionId2 = 'session-2';
        const token = securityService.generateCSRFToken(sessionId1);

        const isValid = securityService.validateCSRFToken(token, sessionId2);
        expect(isValid).toBe(false);
      });

      it('should reject invalid token', () => {
        const sessionId = 'test-session-123';
        const invalidToken = 'invalid-token';

        const isValid = securityService.validateCSRFToken(invalidToken, sessionId);
        expect(isValid).toBe(false);
      });

      it('should reject empty token', () => {
        const sessionId = 'test-session-123';

        const isValid = securityService.validateCSRFToken('', sessionId);
        expect(isValid).toBe(false);
      });

      it('should reject empty session ID', () => {
        const token = securityService.generateCSRFToken('session-123');

        const isValid = securityService.validateCSRFToken(token, '');
        expect(isValid).toBe(false);
      });

      it('should return true when CSRF is disabled', () => {
        const disabledService = createSecurityService({
          csrf: { enabled: false, tokenLength: 32, tokenExpiry: 60, cookieName: '__csrf-token', headerName: 'x-csrf-token', sameSite: 'strict', secure: false }
        });

        const isValid = disabledService.validateCSRFToken('any-token', 'any-session');
        expect(isValid).toBe(true);
      });
    });

    describe('revokeCSRFToken', () => {
      it('should revoke CSRF token', () => {
        const sessionId = 'test-session-123';
        const token = securityService.generateCSRFToken(sessionId);

        expect(securityService.validateCSRFToken(token, sessionId)).toBe(true);

        securityService.revokeCSRFToken(token);

        expect(securityService.validateCSRFToken(token, sessionId)).toBe(false);
      });

      it('should handle revoking non-existent token', () => {
        expect(() => securityService.revokeCSRFToken('non-existent-token')).not.toThrow();
      });
    });
  });

  describe('Rate Limiting', () => {
    describe('checkRateLimit', () => {
      it('should allow requests within limit', () => {
        const identifier = '192.168.1.1';

        expect(() => securityService.checkRateLimit('login', identifier)).not.toThrow();
        expect(() => securityService.checkRateLimit('login', identifier)).not.toThrow();
      });

      it('should block requests exceeding limit', () => {
        const identifier = '192.168.1.2';
        const config = securityService.getConfig();
        const maxRequests = config.rateLimit.login.maxRequests;

        // Make requests up to the limit
        for (let i = 0; i < maxRequests; i++) {
          expect(() => securityService.checkRateLimit('login', identifier)).not.toThrow();
        }

        // Next request should be blocked
        expect(() => securityService.checkRateLimit('login', identifier))
          .toThrow(AuthError);
      });

      it('should reset rate limit after window expires', async () => {
        const shortWindowService = createSecurityService({
          rateLimit: {
            enabled: true,
            login: {
              windowMs: 100, // 100ms window
              maxRequests: 2,
            },
            global: { windowMs: 15 * 60 * 1000, maxRequests: 100 },
            register: { windowMs: 60 * 60 * 1000, maxRequests: 3 },
            passwordReset: { windowMs: 60 * 60 * 1000, maxRequests: 3 },
            emailVerification: { windowMs: 60 * 60 * 1000, maxRequests: 5 },
          }
        });

        const identifier = '192.168.1.3';

        // Exhaust the limit
        shortWindowService.checkRateLimit('login', identifier);
        shortWindowService.checkRateLimit('login', identifier);

        expect(() => shortWindowService.checkRateLimit('login', identifier))
          .toThrow(AuthError);

        // Wait for window to expire
        await new Promise(resolve => setTimeout(resolve, 150));

        // Should be allowed again
        expect(() => shortWindowService.checkRateLimit('login', identifier)).not.toThrow();
      });

      it('should skip successful requests when configured', () => {
        const identifier = '192.168.1.4';
        const config = securityService.getConfig();
        const maxRequests = config.rateLimit.login.maxRequests;

        // Make successful requests (should be skipped)
        for (let i = 0; i < maxRequests + 2; i++) {
          expect(() => securityService.checkRateLimit('login', identifier, true)).not.toThrow();
        }

        // Failed request should still count
        expect(() => securityService.checkRateLimit('login', identifier, false)).not.toThrow();
      });

      it('should return true when rate limiting is disabled', () => {
        const disabledService = createSecurityService({
          rateLimit: { enabled: false, global: { windowMs: 0, maxRequests: 0 }, login: { windowMs: 0, maxRequests: 0 }, register: { windowMs: 0, maxRequests: 0 }, passwordReset: { windowMs: 0, maxRequests: 0 }, emailVerification: { windowMs: 0, maxRequests: 0 } }
        });

        const identifier = '192.168.1.5';

        for (let i = 0; i < 100; i++) {
          expect(() => disabledService.checkRateLimit('login', identifier)).not.toThrow();
        }
      });

      it('should handle different endpoints separately', () => {
        const identifier = '192.168.1.6';

        // Exhaust login limit
        const loginLimit = securityService.getConfig().rateLimit.login.maxRequests;
        for (let i = 0; i < loginLimit; i++) {
          securityService.checkRateLimit('login', identifier);
        }

        expect(() => securityService.checkRateLimit('login', identifier))
          .toThrow(AuthError);

        // Register should still work
        expect(() => securityService.checkRateLimit('register', identifier)).not.toThrow();
      });
    });

    describe('getRateLimitInfo', () => {
      it('should return correct rate limit info', () => {
        const identifier = '192.168.1.7';
        const config = securityService.getConfig();
        const maxRequests = config.rateLimit.login.maxRequests;

        const info = securityService.getRateLimitInfo('login', identifier);

        expect(info.remaining).toBe(maxRequests);
        expect(info.resetTime).toBeGreaterThan(Date.now());
        expect(info.blocked).toBe(false);
      });

      it('should update remaining count after requests', () => {
        const identifier = '192.168.1.8';
        const config = securityService.getConfig();
        const maxRequests = config.rateLimit.login.maxRequests;

        securityService.checkRateLimit('login', identifier);

        const info = securityService.getRateLimitInfo('login', identifier);
        expect(info.remaining).toBe(maxRequests - 1);
      });

      it('should show blocked status when limit exceeded', () => {
        const identifier = '192.168.1.9';
        const config = securityService.getConfig();
        const maxRequests = config.rateLimit.login.maxRequests;

        // Exhaust the limit
        for (let i = 0; i < maxRequests; i++) {
          securityService.checkRateLimit('login', identifier);
        }

        try {
          securityService.checkRateLimit('login', identifier);
        } catch (error) {
          // Expected to throw
        }

        const info = securityService.getRateLimitInfo('login', identifier);
        expect(info.remaining).toBe(0);
        expect(info.blocked).toBe(true);
      });
    });
  });

  describe('Input Validation', () => {
    describe('validateInput', () => {
      it('should validate correct email format', () => {
        const validEmail = 'test@example.com';
        expect(() => securityService.validateInput(validEmail, 'email')).not.toThrow();
      });

      it('should reject invalid email format', () => {
        const invalidEmail = 'invalid-email';
        expect(() => securityService.validateInput(invalidEmail, 'email'))
          .toThrow(AuthError);
      });

      it('should validate correct password format', () => {
        const validPassword = 'SecureP@ssw0rd123!';
        expect(() => securityService.validateInput(validPassword, 'password')).not.toThrow();
      });

      it('should reject password with invalid characters', () => {
        const invalidPassword = 'password\x00\x01'; // Contains null bytes
        expect(() => securityService.validateInput(invalidPassword, 'password'))
          .toThrow(AuthError);
      });

      it('should validate correct name format', () => {
        const validName = "John O'Connor-Smith";
        expect(() => securityService.validateInput(validName, 'name')).not.toThrow();
      });

      it('should reject name with invalid characters', () => {
        const invalidName = 'John<script>alert("xss")</script>';
        expect(() => securityService.validateInput(invalidName, 'name'))
          .toThrow(AuthError);
      });

      it('should reject input exceeding maximum length', () => {
        const longInput = 'a'.repeat(2000);
        expect(() => securityService.validateInput(longInput, 'email'))
          .toThrow(AuthError);
      });

      it('should detect script injection attempts', () => {
        const maliciousInput = '<script>alert("xss")</script>';
        expect(() => securityService.validateInput(maliciousInput, 'name'))
          .toThrow(AuthError);
      });

      it('should detect javascript protocol injection', () => {
        const maliciousInput = 'javascript:alert("xss")';
        expect(() => securityService.validateInput(maliciousInput, 'name'))
          .toThrow(AuthError);
      });

      it('should detect event handler injection', () => {
        const maliciousInput = 'onclick=alert("xss")';
        expect(() => securityService.validateInput(maliciousInput, 'name'))
          .toThrow(AuthError);
      });

      it('should return true when validation is disabled', () => {
        const disabledService = createSecurityService({
          inputValidation: { enabled: false, maxFieldLength: 1000, allowedCharsets: { email: /.*/, password: /.*/, name: /.*/ }, blockedPatterns: [] }
        });

        const maliciousInput = '<script>alert("xss")</script>';
        expect(() => disabledService.validateInput(maliciousInput, 'name')).not.toThrow();
      });
    });

    describe('sanitizeInput', () => {
      it('should remove angle brackets', () => {
        const input = 'Hello <world>';
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized).toBe('Hello world');
      });

      it('should remove javascript protocol', () => {
        const input = 'javascript:alert("xss")';
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized).toBe('alert("xss")');
      });

      it('should remove event handlers', () => {
        const input = 'onclick=alert("xss")';
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized).toBe('');
      });

      it('should trim whitespace', () => {
        const input = '  hello world  ';
        const sanitized = securityService.sanitizeInput(input);
        expect(sanitized).toBe('hello world');
      });

      it('should limit length', () => {
        const longInput = 'a'.repeat(2000);
        const sanitized = securityService.sanitizeInput(longInput);
        expect(sanitized.length).toBeLessThanOrEqual(1000);
      });

      it('should return original input when validation is disabled', () => {
        const disabledService = createSecurityService({
          inputValidation: { enabled: false, maxFieldLength: 1000, allowedCharsets: { email: /.*/, password: /.*/, name: /.*/ }, blockedPatterns: [] }
        });

        const maliciousInput = '<script>alert("xss")</script>';
        const sanitized = disabledService.sanitizeInput(maliciousInput);
        expect(sanitized).toBe(maliciousInput);
      });
    });
  });

  describe('IP Blocking', () => {
    describe('blockIP', () => {
      it('should block IP address', () => {
        const ip = '192.168.1.100';
        securityService.blockIP(ip, 'Test block');

        expect(securityService.isIPBlocked(ip)).toBe(true);
      });

      it('should handle blocking already blocked IP', () => {
        const ip = '192.168.1.101';
        securityService.blockIP(ip);
        expect(() => securityService.blockIP(ip)).not.toThrow();
      });
    });

    describe('unblockIP', () => {
      it('should unblock IP address', () => {
        const ip = '192.168.1.102';
        securityService.blockIP(ip);
        expect(securityService.isIPBlocked(ip)).toBe(true);

        securityService.unblockIP(ip);
        expect(securityService.isIPBlocked(ip)).toBe(false);
      });

      it('should handle unblocking non-blocked IP', () => {
        const ip = '192.168.1.103';
        expect(() => securityService.unblockIP(ip)).not.toThrow();
      });
    });

    describe('isIPBlocked', () => {
      it('should return false for non-blocked IP', () => {
        const ip = '192.168.1.104';
        expect(securityService.isIPBlocked(ip)).toBe(false);
      });

      it('should return true for blocked IP', () => {
        const ip = '192.168.1.105';
        securityService.blockIP(ip);
        expect(securityService.isIPBlocked(ip)).toBe(true);
      });
    });

    it('should block IP after multiple suspicious activities', () => {
      const ip = '192.168.1.106';

      // Trigger suspicious activity by exceeding rate limits multiple times
      for (let i = 0; i < 15; i++) {
        try {
          // Use a high number to trigger rate limit
          for (let j = 0; j < 10; j++) {
            securityService.checkRateLimit('login', ip);
          }
        } catch (error) {
          // Expected rate limit errors
        }
      }

      // IP should be blocked after multiple suspicious activities
      expect(securityService.isIPBlocked(ip)).toBe(true);
    });
  });

  describe('Session Management', () => {
    describe('generateSessionId', () => {
      it('should generate valid session ID', () => {
        const sessionId = securityService.generateSessionId();

        expect(sessionId).toBeDefined();
        expect(typeof sessionId).toBe('string');
        expect(sessionId.length).toBe(64); // 32 bytes * 2 (hex)
      });

      it('should generate unique session IDs', () => {
        const sessionId1 = securityService.generateSessionId();
        const sessionId2 = securityService.generateSessionId();

        expect(sessionId1).not.toBe(sessionId2);
      });
    });

    describe('validateSessionId', () => {
      it('should validate correct session ID format', () => {
        const sessionId = securityService.generateSessionId();
        expect(securityService.validateSessionId(sessionId)).toBe(true);
      });

      it('should reject invalid session ID format', () => {
        const invalidSessionId = 'invalid-session-id';
        expect(securityService.validateSessionId(invalidSessionId)).toBe(false);
      });

      it('should reject session ID with wrong length', () => {
        const shortSessionId = 'abc123';
        expect(securityService.validateSessionId(shortSessionId)).toBe(false);
      });

      it('should reject session ID with invalid characters', () => {
        const invalidSessionId = 'g'.repeat(64); // 'g' is not a valid hex character
        expect(securityService.validateSessionId(invalidSessionId)).toBe(false);
      });
    });
  });

  describe('Utility Functions', () => {
    describe('generateSecureToken', () => {
      it('should generate secure token with default length', () => {
        const token = securityService.generateSecureToken();

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBe(64); // 32 bytes * 2 (hex)
      });

      it('should generate secure token with custom length', () => {
        const customLength = 16;
        const token = securityService.generateSecureToken(customLength);

        expect(token.length).toBe(customLength * 2); // bytes * 2 (hex)
      });

      it('should generate unique tokens', () => {
        const token1 = securityService.generateSecureToken();
        const token2 = securityService.generateSecureToken();

        expect(token1).not.toBe(token2);
      });
    });

    describe('hashSensitiveData', () => {
      it('should hash data consistently with same salt', () => {
        const data = 'sensitive-data';
        const salt = 'test-salt';

        const hash1 = securityService.hashSensitiveData(data, salt);
        const hash2 = securityService.hashSensitiveData(data, salt);

        expect(hash1).toBe(hash2);
      });

      it('should generate different hashes with different salts', () => {
        const data = 'sensitive-data';
        const salt1 = 'salt1';
        const salt2 = 'salt2';

        const hash1 = securityService.hashSensitiveData(data, salt1);
        const hash2 = securityService.hashSensitiveData(data, salt2);

        expect(hash1).not.toBe(hash2);
      });

      it('should generate hash without explicit salt', () => {
        const data = 'sensitive-data';
        const hash = securityService.hashSensitiveData(data);

        expect(hash).toBeDefined();
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Cleanup and Maintenance', () => {
    describe('cleanup', () => {
      it('should clean up expired tokens and entries', async () => {
        // Generate some tokens that will expire quickly
        const sessionId = 'test-session';
        const token = securityService.generateCSRFToken(sessionId);

        // Manually expire the token by modifying internal state
        const tokenStore = (securityService as any).csrfTokenStore;
        const tokenData = tokenStore.get(token);
        if (tokenData) {
          tokenData.expiresAt = new Date(Date.now() - 1000); // Expired 1 second ago
          tokenStore.set(token, tokenData);
        }

        await securityService.cleanup();

        // Token should be cleaned up
        expect(securityService.validateCSRFToken(token, sessionId)).toBe(false);
      });

      it('should not clean up non-expired tokens', async () => {
        const sessionId = 'test-session';
        const token = securityService.generateCSRFToken(sessionId);

        await securityService.cleanup();

        // Token should still be valid
        expect(securityService.validateCSRFToken(token, sessionId)).toBe(true);
      });
    });

    describe('getSecurityStats', () => {
      it('should return security statistics', () => {
        const stats = securityService.getSecurityStats();

        expect(stats).toHaveProperty('csrfTokens');
        expect(stats).toHaveProperty('rateLimitEntries');
        expect(stats).toHaveProperty('blockedIPs');
        expect(stats).toHaveProperty('suspiciousActivities');

        expect(typeof stats.csrfTokens).toBe('number');
        expect(typeof stats.rateLimitEntries).toBe('number');
        expect(typeof stats.blockedIPs).toBe('number');
        expect(typeof stats.suspiciousActivities).toBe('number');
      });

      it('should update stats when operations are performed', () => {
        const initialStats = securityService.getSecurityStats();

        // Generate a CSRF token
        securityService.generateCSRFToken('test-session');

        // Block an IP
        securityService.blockIP('192.168.1.200');

        const updatedStats = securityService.getSecurityStats();

        expect(updatedStats.csrfTokens).toBeGreaterThan(initialStats.csrfTokens);
        expect(updatedStats.blockedIPs).toBeGreaterThan(initialStats.blockedIPs);
      });
    });

    describe('reset', () => {
      it('should reset all security data', () => {
        // Add some data
        securityService.generateCSRFToken('test-session');
        securityService.blockIP('192.168.1.201');
        securityService.checkRateLimit('login', '192.168.1.202');

        const statsBeforeReset = securityService.getSecurityStats();
        expect(statsBeforeReset.csrfTokens).toBeGreaterThan(0);

        securityService.reset();

        const statsAfterReset = securityService.getSecurityStats();
        expect(statsAfterReset.csrfTokens).toBe(0);
        expect(statsAfterReset.rateLimitEntries).toBe(0);
        expect(statsAfterReset.blockedIPs).toBe(0);
        expect(statsAfterReset.suspiciousActivities).toBe(0);
      });
    });
  });

  describe('Configuration', () => {
    describe('getConfig', () => {
      it('should return current configuration', () => {
        const config = securityService.getConfig();

        expect(config).toHaveProperty('csrf');
        expect(config).toHaveProperty('rateLimit');
        expect(config).toHaveProperty('inputValidation');
        expect(config).toHaveProperty('session');
      });
    });

    describe('updateConfig', () => {
      it('should update configuration', () => {
        const newConfig = {
          csrf: { enabled: false },
          rateLimit: { enabled: false },
        };

        securityService.updateConfig(newConfig);

        const updatedConfig = securityService.getConfig();
        expect(updatedConfig.csrf.enabled).toBe(false);
        expect(updatedConfig.rateLimit.enabled).toBe(false);
      });
    });

    describe('environment configurations', () => {
      it('should create development configuration', () => {
        const devConfig = createDevelopmentSecurityConfig();

        expect(devConfig.csrf?.enabled).toBe(false);
        expect(devConfig.csrf?.secure).toBe(false);
        expect(devConfig.session?.secure).toBe(false);
      });

      it('should create production configuration', () => {
        const prodConfig = createProductionSecurityConfig();

        expect(prodConfig.csrf?.enabled).toBe(true);
        expect(prodConfig.csrf?.secure).toBe(true);
        expect(prodConfig.csrf?.sameSite).toBe('strict');
        expect(prodConfig.session?.secure).toBe(true);
        expect(prodConfig.session?.sameSite).toBe('strict');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle rate limit exceeded error correctly', () => {
      const identifier = '192.168.1.210';
      const config = securityService.getConfig();
      const maxRequests = config.rateLimit.login.maxRequests;

      // Exhaust the limit
      for (let i = 0; i < maxRequests; i++) {
        securityService.checkRateLimit('login', identifier);
      }

      // Next request should throw AuthError
      expect(() => securityService.checkRateLimit('login', identifier))
        .toThrow(AuthError);

      try {
        securityService.checkRateLimit('login', identifier);
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe('RATE_LIMIT_EXCEEDED');
        expect((error as AuthError).statusCode).toBe(429);
      }
    });

    it('should handle input validation errors correctly', () => {
      const maliciousInput = '<script>alert("xss")</script>';

      expect(() => securityService.validateInput(maliciousInput, 'name'))
        .toThrow(AuthError);

      try {
        securityService.validateInput(maliciousInput, 'name');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe('MALICIOUS_INPUT');
        expect((error as AuthError).statusCode).toBe(400);
      }
    });
  });
});