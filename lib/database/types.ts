// Database abstraction layer types and interfaces

export enum DatabaseProvider {
  POSTGRESQL = 'postgresql',
  MYSQL = 'mysql',
  MONGODB = 'mongodb'
}

export interface DatabaseConfig {
  provider: DatabaseProvider;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  url?: string; // For connection string
  schema?: string;
  authSource?: string;
  ssl?: boolean;
  sslCert?: string;
  sslKey?: string;
  sslCA?: string;
  logging?: boolean;
  pool?: {
    min?: number;
    max?: number;
    idle?: number;
    acquire?: number;
    evict?: number;
  };
  options?: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  dateOfBirth?: Date;
  isEmailVerified: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  // Dynamic fields for flexible schema
  [key: string]: unknown;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionType?: 'web' | 'mobile' | 'api';
  lastAccessedAt?: Date;
  metadata?: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshToken {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SocialAccount {
  id: string;
  userId: string;
  provider: string;
  providerId: string;
  email?: string;
  name?: string;
  avatar?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  tokenExpiresAt?: Date;
  scope?: string[];
  isActive: boolean;
  lastSyncAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasswordReset {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  usedAt?: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface EmailVerification {
  id: string;
  userId: string;
  email: string;
  token: string;
  expiresAt: Date;
  isUsed: boolean;
  isVerified: boolean;
  type: 'verification' | 'password-reset';
  verifiedAt?: Date;
  usedAt?: Date; // Added missing property
  attempts: number;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  details?: Record<string, unknown>;
  timestamp?: Date;
  createdAt: Date;
}

// Query interfaces
export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
  include?: string[];
  select?: string[];
}

// User-specific types
export interface CreateUserData {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  dateOfBirth?: Date;
  isEmailVerified?: boolean;
  isActive?: boolean;
  username?: string;
  passwordHash?: string;
  [key: string]: unknown;
}

export interface UpdateUserData {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  dateOfBirth?: Date;
  isEmailVerified?: boolean;
  isActive?: boolean;
  lastLoginAt?: Date;
  [key: string]: unknown;
}

export interface FindUserOptions extends QueryOptions {
  includePassword?: boolean;
  includeInactive?: boolean;
}

export interface WhereClause {
  [key: string]: unknown;
}

export interface CreateOptions {
  returning?: boolean;
}

export interface UpdateOptions {
  where: WhereClause;
  returning?: boolean;
}

export interface DeleteOptions {
  where: WhereClause;
  soft?: boolean;
}

// Repository interfaces
export interface BaseRepository<T> {
  create(data: Partial<T>, options?: any): Promise<T>;
  findById(id: string, options?: any): Promise<T | null>;
  findOne(where: WhereClause, options?: any): Promise<T | null>;
  findMany(where?: WhereClause, options?: any): Promise<T[]>;
  update(id: string, data: Partial<T>, options?: any): Promise<T | null>;
  updateMany(data: Partial<T>, options: any): Promise<number>;
  delete(id: string, options?: any): Promise<boolean>;
  deleteMany(options: any): Promise<number>;
  count(where?: WhereClause): Promise<number>;
  exists(where: WhereClause): Promise<boolean>;
}

export interface UserRepository extends BaseRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByEmailWithPassword(email: string): Promise<User | null>;
  updateLastLogin(id: string): Promise<void>;
  findActiveUsers(options?: QueryOptions): Promise<User[]>;
  searchUsers(query: string, options?: QueryOptions): Promise<User[]>;
}

export interface SessionRepository extends BaseRepository<Session> {
  findByToken(token: string): Promise<Session | null>;
  findByUserId(userId: string, options?: QueryOptions): Promise<Session[]>;
  findActiveByUserId(userId: string): Promise<Session[]>;
  invalidateUserSessions(userId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<number>;
}

export interface RefreshTokenRepository extends BaseRepository<RefreshToken> {
  findByTokenId(tokenId: string): Promise<RefreshToken | null>;
  findByUserId(userId: string, options?: QueryOptions): Promise<RefreshToken[]>;
  revokeToken(tokenId: string): Promise<boolean>;
  revokeAllUserTokens(userId: string): Promise<number>;
  cleanupExpiredTokens(): Promise<number>;
}

export interface SocialAccountRepository extends BaseRepository<SocialAccount> {
  findByProvider(provider: string, providerId: string): Promise<SocialAccount | null>;
  findByUserId(userId: string): Promise<SocialAccount[]>;
  findByUserIdAndProvider(userId: string, provider: string): Promise<SocialAccount | null>;
}

export interface PasswordResetRepository extends BaseRepository<PasswordReset> {
  findByToken(token: string): Promise<PasswordReset | null>;
  findActiveByUserId(userId: string): Promise<PasswordReset | null>;
  markAsUsed(id: string): Promise<void>;
  cleanupExpiredTokens(): Promise<number>;
}

export interface EmailVerificationRepository extends BaseRepository<EmailVerification> {
  findByToken(token: string, type: 'verification' | 'password-reset'): Promise<EmailVerification | null>;
  markAsUsed(id: string): Promise<void>;
  cleanupExpiredTokens(): Promise<number>;
}

export interface AuditLogRepository extends BaseRepository<AuditLog> {
  findByUserId(userId: string, options?: QueryOptions): Promise<AuditLog[]>;
  findByAction(action: string, options?: QueryOptions): Promise<AuditLog[]>;
  findByResource(resource: string, resourceId?: string, options?: QueryOptions): Promise<AuditLog[]>;
  cleanupOldLogs(daysToKeep: number): Promise<number>;
}

export interface EmailTokenRepository extends BaseRepository<EmailVerification> {
  findByToken(token: string, type: 'verification' | 'password-reset'): Promise<EmailVerification | null>;
  markAsUsed(id: string): Promise<void>;
  cleanupExpiredTokens(): Promise<number>;
}

// Database connection interface
export interface DatabaseConnection {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getConnection(): unknown;
  transaction<T>(callback: (trx: import('sequelize').Transaction | import('mongoose').ClientSession) => Promise<T>): Promise<T>;
  migrate(): Promise<void>;
  seed(): Promise<void>;
  drop(): Promise<void>;
  healthCheck(): Promise<boolean>;
  getStats(): Promise<Record<string, unknown>>;
}

// Database service interface
export interface DatabaseService {
  connection: DatabaseConnection;
  users: UserRepository;
  sessions: SessionRepository;
  socialAccounts: SocialAccountRepository;
  passwordResets: PasswordResetRepository;
  emailVerifications: EmailVerificationRepository;
  auditLogs: AuditLogRepository;
  refreshTokens: RefreshTokenRepository; // Added RefreshTokenRepository
  emailTokens: EmailTokenRepository;
}

// Migration interface
export interface Migration {
  version: string;
  name: string;
  up(): Promise<void>;
  down(): Promise<void>;
}

// Schema field types for flexible user schema
export type FieldType = 
  | 'string'
  | 'email'
  | 'password'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'text'
  | 'url'
  | 'phone'
  | 'enum'
  | 'array'
  | 'object'
  | 'file';

export interface SchemaField {
  name: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
  description?: string;
  validation?: (value: unknown) => boolean | string;
  conditional?: {
    field: string;
    value: unknown;
    operator?: 'equals' | 'not_equals' | 'in' | 'not_in';
  };
}

export interface UserSchema {
  name: string;
  description?: string;
  fields: SchemaField[];
  version: string;
}

export interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  schema: UserSchema;
  isDefault?: boolean;
}

// Error types
export class DatabaseError extends Error {
  constructor(message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string, public value?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, id?: string) {
    super(`${resource}${id ? ` with id ${id}` : ''} not found`);
    this.name = 'NotFoundError';
  }
}

export class DuplicateError extends Error {
  constructor(resource: string, field: string, value: unknown) {
    super(`${resource} with ${field} '${value}' already exists`);
    this.name = 'DuplicateError';
  }
}