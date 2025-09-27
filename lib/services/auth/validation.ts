import { z } from 'zod';

// Password validation schema
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/\d/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character');

// Email validation schema
const emailSchema = z
  .string()
  .email('Invalid email format')
  .min(1, 'Email is required');

// Registration validation schemas
export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  fullName: z.string().min(1, 'Full name is required').optional(),
}).refine(
  (data) => data.firstName && data.lastName || data.fullName,
  {
    message: 'Either firstName and lastName, or fullName is required',
    path: ['name'],
  }
);

export const registerWithFullNameSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().min(1, 'Full name is required'),
});

export const registerWithSeparateNamesSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

// Login validation schema
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// Password reset validation schemas
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: passwordSchema,
});

// Alias for consistency
export const passwordResetSchema = passwordResetConfirmSchema;

// Change password validation schema
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
}).refine(
  (data) => data.newPassword === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  }
);

// Email verification validation schema
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// OAuth validation schemas
export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
});

export const oauthLinkAccountSchema = z.object({
  provider: z.enum(['google', 'facebook', 'github'] as const, {
    message: 'Invalid OAuth provider',
  }),
  code: z.string().min(1, 'Authorization code is required'),
});

export const oauthUnlinkAccountSchema = z.object({
  provider: z.enum(['google', 'facebook', 'github'] as const, {
    message: 'Invalid OAuth provider',
  }),
});

// Token validation schemas
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const accessTokenSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
});

// User profile update validation schema
export const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  fullName: z.string().min(1, 'Full name is required').optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  bio: z.string().max(500, 'Bio must be less than 500 characters').optional(),
  phone: z.string().regex(/^\+?[\d\s\-\(\)]+$/, 'Invalid phone number format').optional(),
}).refine(
  (data) => {
    // If any name field is provided, ensure we have either fullName or both firstName/lastName
    const hasNameFields = data.firstName || data.lastName || data.fullName;
    if (hasNameFields) {
      return (data.firstName && data.lastName) || data.fullName;
    }
    return true;
  },
  {
    message: 'Either firstName and lastName, or fullName is required',
    path: ['name'],
  }
);

// Alias for consistency
export const profileUpdateSchema = updateProfileSchema;

// Rate limiting validation schema
export const rateLimitSchema = z.object({
  identifier: z.string().min(1, 'Identifier is required'),
  action: z.enum(['login', 'register', 'password-reset', 'email-verification'] as const, {
    message: 'Invalid action type',
  }),
});

// Validation helper functions
// Validation function aliases for consistency with index.ts exports
export const validateRegistration = (data: unknown) => {
  return registerSchema.parse(data);
};

export const validateLogin = (data: unknown) => {
  return loginSchema.parse(data);
};

export const validatePasswordReset = (data: unknown) => {
  return passwordResetRequestSchema.parse(data);
};

// Legacy function names for backward compatibility
export const validateRegisterData = (data: unknown) => {
  return registerSchema.parse(data);
};

export const validateLoginData = (data: unknown) => {
  return loginSchema.parse(data);
};

export const validatePasswordResetRequest = (data: unknown) => {
  return passwordResetRequestSchema.parse(data);
};

export const validatePasswordResetConfirm = (data: unknown) => {
  return passwordResetConfirmSchema.parse(data);
};

export const validateChangePassword = (data: unknown) => {
  return changePasswordSchema.parse(data);
};

export const validateEmailVerification = (data: unknown) => {
  return emailVerificationSchema.parse(data);
};

export const validateOAuthCallback = (data: unknown) => {
  return oauthCallbackSchema.parse(data);
};

export const validateOAuthLinkAccount = (data: unknown) => {
  return oauthLinkAccountSchema.parse(data);
};

export const validateOAuthUnlinkAccount = (data: unknown) => {
  return oauthUnlinkAccountSchema.parse(data);
};

export const validateRefreshToken = (data: unknown) => {
  return refreshTokenSchema.parse(data);
};

export const validateAccessToken = (data: unknown) => {
  return accessTokenSchema.parse(data);
};

export const validateUpdateProfile = (data: unknown) => {
  return updateProfileSchema.parse(data);
};

export const validateProfileUpdate = (data: unknown) => {
  return updateProfileSchema.parse(data);
};

export const validateTokenRefresh = (data: unknown) => {
  return refreshTokenSchema.parse(data);
};

// Error handling helper
export const handleValidationError = (error: z.ZodError) => {
  const errors = error.issues.map((err: z.ZodIssue) => ({
    field: err.path.join('.'),
    message: err.message,
  }));

  return {
    message: 'Validation failed',
    errors,
  };
};

// Schema type exports for TypeScript inference
export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
export type PasswordResetRequestData = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmData = z.infer<typeof passwordResetConfirmSchema>;
export type ChangePasswordData = z.infer<typeof changePasswordSchema>;
export type EmailVerificationData = z.infer<typeof emailVerificationSchema>;
export type OAuthCallbackData = z.infer<typeof oauthCallbackSchema>;
export type OAuthLinkAccountData = z.infer<typeof oauthLinkAccountSchema>;
export type OAuthUnlinkAccountData = z.infer<typeof oauthUnlinkAccountSchema>;
export type RefreshTokenData = z.infer<typeof refreshTokenSchema>;
export type AccessTokenData = z.infer<typeof accessTokenSchema>;
export type UpdateProfileData = z.infer<typeof updateProfileSchema>;