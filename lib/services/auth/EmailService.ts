import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { IEmailService, AuthError } from './types';

interface EmailConfig {
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
  templates: {
    verification: {
      subject: string;
      html: string;
      text: string;
    };
    passwordReset: {
      subject: string;
      html: string;
      text: string;
    };
    welcome: {
      subject: string;
      html: string;
      text: string;
    };
  };
}

interface EmailToken {
  token: string;
  email: string;
  type: 'verification' | 'password-reset';
  expiresAt: Date;
  used: boolean;
}

export class EmailService implements IEmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig;
  private tokenStore: Map<string, EmailToken> = new Map();

  constructor(config: EmailConfig) {
    this.config = config;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter based on provider
   */
  private async initializeTransporter(): Promise<void> {
    try {
      switch (this.config.provider) {
        case 'smtp':
          if (!this.config.smtp) {
            throw new Error('SMTP configuration is required');
          }
          this.transporter = nodemailer.createTransporter({
            host: this.config.smtp.host,
            port: this.config.smtp.port,
            secure: this.config.smtp.secure,
            auth: this.config.smtp.auth,
          });
          break;

        case 'sendgrid':
          if (!this.config.sendgrid) {
            throw new Error('SendGrid configuration is required');
          }
          this.transporter = nodemailer.createTransporter({
            service: 'SendGrid',
            auth: {
              user: 'apikey',
              pass: this.config.sendgrid.apiKey,
            },
          });
          break;

        case 'mailgun':
          if (!this.config.mailgun) {
            throw new Error('Mailgun configuration is required');
          }
          // Note: For Mailgun, you might want to use the official Mailgun SDK
          // This is a basic implementation using nodemailer
          this.transporter = nodemailer.createTransporter({
            host: 'smtp.mailgun.org',
            port: 587,
            secure: false,
            auth: {
              user: `postmaster@${this.config.mailgun.domain}`,
              pass: this.config.mailgun.apiKey,
            },
          });
          break;

        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`);
      }

      // Verify transporter configuration
      if (this.transporter) {
        await this.transporter.verify();
        console.log('Email service initialized successfully');
      }
    } catch (error) {
      console.error('Failed to initialize email service:', error);
      throw new AuthError(
        `Email service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_SERVICE_ERROR',
        500
      );
    }
  }

  /**
   * Generate a secure email verification token
   * @param email - User email
   * @param type - Token type
   * @returns string - Generated token
   */
  private generateEmailToken(email: string, type: 'verification' | 'password-reset'): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    
    // Set expiry based on token type
    if (type === 'verification') {
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours
    } else {
      expiresAt.setHours(expiresAt.getHours() + 1); // 1 hour for password reset
    }

    this.tokenStore.set(token, {
      token,
      email,
      type,
      expiresAt,
      used: false,
    });

    return token;
  }

  /**
   * Verify an email token
   * @param token - Token to verify
   * @param type - Expected token type
   * @returns EmailToken data if valid
   */
  verifyEmailToken(token: string, type: 'verification' | 'password-reset'): EmailToken {
    const tokenData = this.tokenStore.get(token);
    
    if (!tokenData) {
      throw new AuthError('Invalid or expired token', 'INVALID_TOKEN', 400);
    }

    if (tokenData.type !== type) {
      throw new AuthError('Invalid token type', 'INVALID_TOKEN_TYPE', 400);
    }

    if (tokenData.used) {
      throw new AuthError('Token has already been used', 'TOKEN_ALREADY_USED', 400);
    }

    if (tokenData.expiresAt < new Date()) {
      this.tokenStore.delete(token);
      throw new AuthError('Token has expired', 'TOKEN_EXPIRED', 400);
    }

    return tokenData;
  }

  /**
   * Mark a token as used
   * @param token - Token to mark as used
   */
  markTokenAsUsed(token: string): void {
    const tokenData = this.tokenStore.get(token);
    if (tokenData) {
      tokenData.used = true;
      this.tokenStore.set(token, tokenData);
    }
  }

  /**
   * Send email verification email
   * @param email - User email
   * @param token - Verification token (optional, will generate if not provided)
   */
  async sendVerificationEmail(email: string, token?: string): Promise<void> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const verificationToken = token || this.generateEmailToken(email, 'verification');
      const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/verify-email?token=${verificationToken}`;

      const template = this.config.templates.verification;
      const html = template.html
        .replace(/{{verificationUrl}}/g, verificationUrl)
        .replace(/{{email}}/g, email);
      
      const text = template.text
        .replace(/{{verificationUrl}}/g, verificationUrl)
        .replace(/{{email}}/g, email);

      await this.transporter.sendMail({
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to: email,
        subject: template.subject,
        html,
        text,
      });

      console.log(`Verification email sent to ${email}`);
    } catch (error) {
      throw new AuthError(
        `Failed to send verification email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_SEND_ERROR',
        500
      );
    }
  }

  /**
   * Send password reset email
   * @param email - User email
   * @param token - Reset token (optional, will generate if not provided)
   */
  async sendPasswordResetEmail(email: string, token?: string): Promise<void> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const resetToken = token || this.generateEmailToken(email, 'password-reset');
      const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`;

      const template = this.config.templates.passwordReset;
      const html = template.html
        .replace(/{{resetUrl}}/g, resetUrl)
        .replace(/{{email}}/g, email);
      
      const text = template.text
        .replace(/{{resetUrl}}/g, resetUrl)
        .replace(/{{email}}/g, email);

      await this.transporter.sendMail({
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to: email,
        subject: template.subject,
        html,
        text,
      });

      console.log(`Password reset email sent to ${email}`);
    } catch (error) {
      throw new AuthError(
        `Failed to send password reset email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_SEND_ERROR',
        500
      );
    }
  }

  /**
   * Send welcome email
   * @param email - User email
   * @param name - User name
   */
  async sendWelcomeEmail(email: string, name: string): Promise<void> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const template = this.config.templates.welcome;
      const html = template.html
        .replace(/{{name}}/g, name)
        .replace(/{{email}}/g, email);
      
      const text = template.text
        .replace(/{{name}}/g, name)
        .replace(/{{email}}/g, email);

      await this.transporter.sendMail({
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to: email,
        subject: template.subject,
        html,
        text,
      });

      console.log(`Welcome email sent to ${email}`);
    } catch (error) {
      throw new AuthError(
        `Failed to send welcome email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_SEND_ERROR',
        500
      );
    }
  }

  /**
   * Send custom email
   * @param to - Recipient email
   * @param subject - Email subject
   * @param html - HTML content
   * @param text - Text content
   */
  async sendCustomEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      await this.transporter.sendMail({
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML tags for text version
      });

      console.log(`Custom email sent to ${to}`);
    } catch (error) {
      throw new AuthError(
        `Failed to send custom email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMAIL_SEND_ERROR',
        500
      );
    }
  }

  /**
   * Clean up expired tokens
   */
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      const expiredTokens: string[] = [];

      for (const [token, tokenData] of this.tokenStore.entries()) {
        if (tokenData.expiresAt < now) {
          expiredTokens.push(token);
        }
      }

      for (const token of expiredTokens) {
        this.tokenStore.delete(token);
      }

      console.log(`Cleaned up ${expiredTokens.length} expired email tokens`);
    } catch (error) {
      console.error('Failed to cleanup expired email tokens:', error);
    }
  }

  /**
   * Get email service statistics
   */
  getEmailStats(): {
    totalTokens: number;
    verificationTokens: number;
    passwordResetTokens: number;
    expiredTokens: number;
    usedTokens: number;
  } {
    const now = new Date();
    let verificationTokens = 0;
    let passwordResetTokens = 0;
    let expiredTokens = 0;
    let usedTokens = 0;

    for (const tokenData of this.tokenStore.values()) {
      if (tokenData.type === 'verification') {
        verificationTokens++;
      } else if (tokenData.type === 'password-reset') {
        passwordResetTokens++;
      }

      if (tokenData.expiresAt < now) {
        expiredTokens++;
      }

      if (tokenData.used) {
        usedTokens++;
      }
    }

    return {
      totalTokens: this.tokenStore.size,
      verificationTokens,
      passwordResetTokens,
      expiredTokens,
      usedTokens,
    };
  }

  /**
   * Test email configuration
   */
  async testEmailConfiguration(): Promise<boolean> {
    try {
      if (!this.transporter) {
        return false;
      }

      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('Email configuration test failed:', error);
      return false;
    }
  }
}

// Default email templates
export const defaultEmailTemplates = {
  verification: {
    subject: 'Verify Your Email Address',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Verify Your Email Address</h2>
        <p>Thank you for registering! Please click the button below to verify your email address:</p>
        <a href="{{verificationUrl}}" style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">
          Verify Email
        </a>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="{{verificationUrl}}">{{verificationUrl}}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account, you can safely ignore this email.</p>
      </div>
    `,
    text: `
      Verify Your Email Address
      
      Thank you for registering! Please visit the following link to verify your email address:
      {{verificationUrl}}
      
      This link will expire in 24 hours.
      
      If you didn't create an account, you can safely ignore this email.
    `,
  },
  passwordReset: {
    subject: 'Reset Your Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Reset Your Password</h2>
        <p>You requested a password reset. Click the button below to reset your password:</p>
        <a href="{{resetUrl}}" style="display: inline-block; background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin: 16px 0;">
          Reset Password
        </a>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `,
    text: `
      Reset Your Password
      
      You requested a password reset. Please visit the following link to reset your password:
      {{resetUrl}}
      
      This link will expire in 1 hour.
      
      If you didn't request a password reset, you can safely ignore this email.
    `,
  },
  welcome: {
    subject: 'Welcome to Our Platform!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome, {{name}}!</h2>
        <p>Thank you for joining our platform. We're excited to have you on board!</p>
        <p>Your account has been successfully created with the email address: {{email}}</p>
        <p>You can now start exploring all the features we have to offer.</p>
        <p>If you have any questions, feel free to contact our support team.</p>
        <p>Best regards,<br>The Team</p>
      </div>
    `,
    text: `
      Welcome, {{name}}!
      
      Thank you for joining our platform. We're excited to have you on board!
      
      Your account has been successfully created with the email address: {{email}}
      
      You can now start exploring all the features we have to offer.
      
      If you have any questions, feel free to contact our support team.
      
      Best regards,
      The Team
    `,
  },
};

// Export factory function for creating email service instances
export const createEmailService = (config: EmailConfig): EmailService => {
  return new EmailService(config);
};

// Export default configuration helper
export const createDefaultEmailConfig = (): EmailConfig => ({
  provider: 'smtp',
  smtp: {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  },
  from: {
    name: process.env.EMAIL_FROM_NAME || 'Next Auth Template',
    email: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
  },
  templates: defaultEmailTemplates,
});