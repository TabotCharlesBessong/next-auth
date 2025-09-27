import { EmailService, createEmailService } from '../EmailService';
import { EmailError, IUserRepository } from '../types';

// Mock nodemailer
const mockTransporter = {
  sendMail: jest.fn(),
  verify: jest.fn(),
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

// Mock external email services
jest.mock('axios', () => ({
  post: jest.fn(),
  create: jest.fn(() => ({
    post: jest.fn(),
  })),
}));

const mockDatabase = {
  emailVerificationTokens: new Map(),
  passwordResetTokens: new Map(),
  
  async storeEmailVerificationToken(userId: string, token: string, expiresAt: Date) {
    this.emailVerificationTokens.set(token, { userId, token, expiresAt });
  },
  
  async getEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.get(token);
  },
  
  async deleteEmailVerificationToken(token: string) {
    return this.emailVerificationTokens.delete(token);
  },
  
  async storePasswordResetToken(userId: string, token: string, expiresAt: Date) {
    this.passwordResetTokens.set(token, { userId, token, expiresAt });
  },
  
  async getPasswordResetToken(token: string) {
    return this.passwordResetTokens.get(token);
  },
  
  async deletePasswordResetToken(token: string) {
    return this.passwordResetTokens.delete(token);
  },
  
  clear() {
    this.emailVerificationTokens.clear();
    this.passwordResetTokens.clear();
  }
};

const createMockUserRepository = (): IUserRepository => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByEmail: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByProvider: jest.fn(),
  findByOAuthId: jest.fn()
});

const mockEnv = {
  EMAIL_FROM: 'test@example.com',
  EMAIL_PROVIDER: 'smtp',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '587',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
  SENDGRID_API_KEY: 'test-sendgrid-key',
  MAILGUN_API_KEY: 'test-mailgun-key',
  MAILGUN_DOMAIN: 'test.mailgun.org',
};

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    // Set up environment variables
    Object.assign(process.env, mockEnv);
    
    // Clear mock database
    mockDatabase.clear();
    
    // Reset mocks
    jest.clearAllMocks();
    mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    mockTransporter.verify.mockResolvedValue(true);
    
    // Create email service
    emailService = createEmailService({
      userRepository: createMockUserRepository(),
    });
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('sendVerificationEmail', () => {
    it('should send verification email successfully', async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should store verification token in database', async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const storedToken = mockDatabase.emailVerificationTokens.get(result.token!);
      expect(storedToken).toBeDefined();
      expect(storedToken.userId).toBe('user123');
      expect(storedToken.token).toBe(result.token);
    });

    it('should generate secure verification token', async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      expect(result.token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex string
    });

    it('should set correct expiration time', async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      const timeDiff = Math.abs(result.expiresAt!.getTime() - expectedExpiry.getTime());
      
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should include verification link in email', async () => {
      await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        // 'John Doe'
      );

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('verify-email');
      expect(emailCall.html).toContain('token=');
    });

    it('should handle email sending failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      await expect(emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        // 'John Doe'
      )).rejects.toThrow(EmailError);
    });

    it('should use custom template when provided', async () => {
      const customTemplate = 'Custom verification email for {{name}}';
      
      const customEmailService = createEmailService({
        userRepository: createMockUserRepository(),
        templates: {
          verification: customTemplate,
        },
      });

      await customEmailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        // 'John Doe'
      );

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('Custom verification email for John Doe');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should send password reset email successfully', async () => {
      const result = await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        // 'John Doe'
      );

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    });

    it('should store password reset token in database', async () => {
      const result = await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const storedToken = mockDatabase.passwordResetTokens.get(result.token!);
      expect(storedToken).toBeDefined();
      expect(storedToken.userId).toBe('user123');
      expect(storedToken.token).toBe(result.token);
    });

    it('should generate secure reset token', async () => {
      const result = await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      expect(result.token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes hex string
    });

    it('should set shorter expiration for password reset', async () => {
      const result = await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
      const timeDiff = Math.abs(result.expiresAt!.getTime() - expectedExpiry.getTime());
      
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
    });

    it('should include reset link in email', async () => {
      await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('reset-password');
      expect(emailCall.html).toContain('token=');
    });

    it('should handle email sending failure', async () => {
      mockTransporter.sendMail.mockRejectedValue(new Error('SMTP Error'));

      await expect(emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      )).rejects.toThrow(EmailError);
    });
  });

  describe('verifyEmailToken', () => {
    let verificationToken: string;

    beforeEach(async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );
      verificationToken = result.token!;
    });

    it('should verify valid token successfully', async () => {
      const result = await emailService.verifyEmailToken(verificationToken);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user123');
    });

    it('should remove token after successful verification', async () => {
      await emailService.verifyEmailToken(verificationToken);

      const tokenData = mockDatabase.emailVerificationTokens.get(verificationToken);
      expect(tokenData).toBeUndefined();
    });

    it('should reject invalid token', async () => {
      const invalidToken = 'invalid-token';

      await expect(emailService.verifyEmailToken(invalidToken))
        .rejects.toThrow(EmailError);
    });

    it('should reject expired token', async () => {
      // Manually set token as expired
      const tokenData = mockDatabase.emailVerificationTokens.get(verificationToken);
      tokenData.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      mockDatabase.emailVerificationTokens.set(verificationToken, tokenData);

      await expect(emailService.verifyEmailToken(verificationToken))
        .rejects.toThrow(EmailError);
    });

    it('should clean up expired token', async () => {
      // Manually set token as expired
      const tokenData = mockDatabase.emailVerificationTokens.get(verificationToken);
      tokenData.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      mockDatabase.emailVerificationTokens.set(verificationToken, tokenData);

      try {
        await emailService.verifyEmailToken(verificationToken);
      } catch {
        // Expected to throw
      }

      const cleanedTokenData = mockDatabase.emailVerificationTokens.get(verificationToken);
      expect(cleanedTokenData).toBeUndefined();
    });
  });

  describe('verifyPasswordResetToken', () => {
    let resetToken: string;

    beforeEach(async () => {
      const result = await emailService.sendPasswordResetEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );
      resetToken = result.token!;
    });

    it('should verify valid reset token successfully', async () => {
      const result = await emailService.verifyPasswordResetToken(resetToken);

      expect(result.success).toBe(true);
      expect(result.userId).toBe('user123');
    });

    it('should remove token after successful verification', async () => {
      await emailService.verifyPasswordResetToken(resetToken);

      const tokenData = mockDatabase.passwordResetTokens.get(resetToken);
      expect(tokenData).toBeUndefined();
    });

    it('should reject invalid reset token', async () => {
      const invalidToken = 'invalid-reset-token';

      await expect(emailService.verifyPasswordResetToken(invalidToken))
        .rejects.toThrow(EmailError);
    });

    it('should reject expired reset token', async () => {
      // Manually set token as expired
      const tokenData = mockDatabase.passwordResetTokens.get(resetToken);
      tokenData.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      mockDatabase.passwordResetTokens.set(resetToken, tokenData);

      await expect(emailService.verifyPasswordResetToken(resetToken))
        .rejects.toThrow(EmailError);
    });
  });

  describe('cleanupExpiredTokens', () => {
    beforeEach(async () => {
      // Create some tokens
      await emailService.sendVerificationEmail('user1', 'user1@example.com', 'User 1');
      await emailService.sendVerificationEmail('user2', 'user2@example.com', 'User 2');
      await emailService.sendPasswordResetEmail('user3', 'user3@example.com', 'User 3');
    });

    it('should clean up expired tokens', async () => {
      // Manually expire some tokens
      const verificationTokens = Array.from(mockDatabase.emailVerificationTokens.entries());
      const resetTokens = Array.from(mockDatabase.passwordResetTokens.entries());

      // Expire first verification token
      verificationTokens[0][1].expiresAt = new Date(Date.now() - 1000);
      mockDatabase.emailVerificationTokens.set(verificationTokens[0][0], verificationTokens[0][1]);

      // Expire reset token
      resetTokens[0][1].expiresAt = new Date(Date.now() - 1000);
      mockDatabase.passwordResetTokens.set(resetTokens[0][0], resetTokens[0][1]);

      const result = await emailService.cleanupExpiredTokens();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(2);
      expect(mockDatabase.emailVerificationTokens.size).toBe(1);
      expect(mockDatabase.passwordResetTokens.size).toBe(0);
    });

    it('should not clean up valid tokens', async () => {
      const result = await emailService.cleanupExpiredTokens();

      expect(result.success).toBe(true);
      expect(result.cleanedCount).toBe(0);
      expect(mockDatabase.emailVerificationTokens.size).toBe(2);
      expect(mockDatabase.passwordResetTokens.size).toBe(1);
    });
  });

  describe('Email Provider Configuration', () => {
    it('should work with SMTP provider', () => {
      process.env.EMAIL_PROVIDER = 'smtp';
      
      const smtpEmailService = createEmailService({
        userRepository: createMockUserRepository(),
      });

      expect(smtpEmailService).toBeDefined();
    });

    it('should work with SendGrid provider', () => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      
      const sendgridEmailService = createEmailService({
        userRepository: createMockUserRepository(),
      });

      expect(sendgridEmailService).toBeDefined();
    });

    it('should work with Mailgun provider', () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      
      const mailgunEmailService = createEmailService({
        userRepository: createMockUserRepository(),
      });

      expect(mailgunEmailService).toBeDefined();
    });

    it('should throw error for invalid provider', () => {
      process.env.EMAIL_PROVIDER = 'invalid-provider';
      
      expect(() => createEmailService({
        userRepository: createMockUserRepository(),
      })).toThrow(EmailError);
    });

    it('should throw error for missing configuration', () => {
      delete process.env.EMAIL_FROM;
      
      expect(() => createEmailService({
        userRepository: createMockUserRepository(),
      })).toThrow(EmailError);
    });
  });

  describe('Template Rendering', () => {
    it('should render template with variables', async () => {
      const customTemplate = 'Hello {{name}}, your token is {{token}}';
      
      const customEmailService = createEmailService({
        userRepository: createMockUserRepository(),
        templates: {
          verification: customTemplate,
        },
      });

      await customEmailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('Hello John Doe');
      expect(emailCall.html).toContain('your token is');
    });

    it('should handle missing template variables gracefully', async () => {
      const templateWithMissingVar = 'Hello {{name}}, missing: {{missingVar}}';
      
      const customEmailService = createEmailService({
        userRepository: createMockUserRepository(),
        templates: {
          verification: templateWithMissingVar,
        },
      });

      await customEmailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      );

      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toContain('Hello John Doe');
      expect(emailCall.html).toContain('missing: {{missingVar}}'); // Should remain as placeholder
    });
  });

  describe('Rate Limiting', () => {
    it('should track email sending rate', async () => {
      // Send multiple emails quickly
      await emailService.sendVerificationEmail('user1', 'user1@example.com', 'User 1');
      await emailService.sendVerificationEmail('user2', 'user2@example.com', 'User 2');
      await emailService.sendVerificationEmail('user3', 'user3@example.com', 'User 3');

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limiting configuration', () => {
      const rateLimitedEmailService = createEmailService({
        userRepository: createMockUserRepository(),
        rateLimit: {
          maxEmails: 5,
          windowMs: 60000, // 1 minute
        },
      });

      expect(rateLimitedEmailService).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database to throw error
      const originalStoreToken = mockDatabase.storeEmailVerificationToken;
      mockDatabase.storeEmailVerificationToken = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        'John Doe'
      )).rejects.toThrow(EmailError);

      // Restore original method
      mockDatabase.storeEmailVerificationToken = originalStoreToken;
    });

    it('should handle transporter verification failure', async () => {
      mockTransporter.verify.mockRejectedValue(new Error('SMTP connection failed'));

      // Should still create service but log warning
      const emailServiceWithFailedVerify = createEmailService({
        userRepository: createMockUserRepository(),
      });

      expect(emailServiceWithFailedVerify).toBeDefined();
    });

    it('should handle malformed email addresses', async () => {
      await expect(emailService.sendVerificationEmail(
        'user123',
        'invalid-email',
        'John Doe'
      )).rejects.toThrow(EmailError);
    });

    it('should handle empty user name gracefully', async () => {
      const result = await emailService.sendVerificationEmail(
        'user123',
        'test@example.com',
        ''
      );

      expect(result.success).toBe(true);
      
      const emailCall = mockTransporter.sendMail.mock.calls[0][0];
      expect(emailCall.html).toBeDefined();
    });
  });

  describe('Configuration Validation', () => {
    it('should validate SMTP configuration', () => {
      delete process.env.SMTP_HOST;
      
      expect(() => createEmailService({
        userRepository: createMockUserRepository(),
      })).toThrow(EmailError);
    });

    it('should validate SendGrid configuration', () => {
      process.env.EMAIL_PROVIDER = 'sendgrid';
      delete process.env.SENDGRID_API_KEY;
      
      expect(() => createEmailService({
        userRepository: createMockUserRepository(),
      })).toThrow(EmailError);
    });

    it('should validate Mailgun configuration', () => {
      process.env.EMAIL_PROVIDER = 'mailgun';
      delete process.env.MAILGUN_API_KEY;
      
      expect(() => createEmailService({
        userRepository: createMockUserRepository(),
      })).toThrow(EmailError);
    });

    it('should use default configuration values', () => {
      const defaultEmailService = createEmailService({
        userRepository: createMockUserRepository(),
      });

      expect(defaultEmailService).toBeDefined();
    });
  });
});