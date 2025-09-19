# Flexible User Schema Configuration System

## Overview

This document outlines the design for a flexible user schema configuration system that allows dynamic customization of user fields based on project requirements. The system supports various field types, validation rules, and database schema management while maintaining type safety and performance.

## Core Principles

### 1. Configuration-Driven Schema
- **Dynamic Fields**: Add/remove user fields without code changes
- **Type Safety**: Strong TypeScript typing for all configurations
- **Validation**: Comprehensive field validation rules
- **Migration Support**: Automatic database schema updates

### 2. Flexibility
- **Multiple Field Types**: Support for various data types
- **Custom Validation**: Extensible validation system
- **Conditional Fields**: Fields that depend on other field values
- **Localization**: Multi-language field labels and validation messages

### 3. Performance
- **Schema Caching**: Efficient schema loading and caching
- **Lazy Loading**: Load field configurations on demand
- **Optimized Queries**: Database-optimized field access patterns
- **Index Management**: Automatic index creation for searchable fields

## Schema Configuration Structure

### 1. Field Type Definitions

```typescript
// src/lib/auth/schema/types/field-types.ts
export enum FieldType {
  STRING = 'string',
  EMAIL = 'email',
  PASSWORD = 'password',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  ENUM = 'enum',
  ARRAY = 'array',
  OBJECT = 'object',
  FILE = 'file',
  IMAGE = 'image',
  URL = 'url',
  PHONE = 'phone',
  JSON = 'json'
}

export enum ValidationRule {
  REQUIRED = 'required',
  MIN_LENGTH = 'minLength',
  MAX_LENGTH = 'maxLength',
  MIN_VALUE = 'minValue',
  MAX_VALUE = 'maxValue',
  PATTERN = 'pattern',
  CUSTOM = 'custom',
  UNIQUE = 'unique',
  EMAIL_FORMAT = 'emailFormat',
  PHONE_FORMAT = 'phoneFormat',
  URL_FORMAT = 'urlFormat',
  DATE_RANGE = 'dateRange',
  FILE_SIZE = 'fileSize',
  FILE_TYPE = 'fileType'
}

export interface FieldValidation {
  rule: ValidationRule;
  value?: any;
  message?: string;
  customValidator?: string; // Reference to custom validation function
  conditional?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
    value: any;
  };
}

export interface FieldOption {
  value: string | number;
  label: string;
  description?: string;
  disabled?: boolean;
  group?: string;
}

export interface FieldConfiguration {
  name: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  defaultValue?: any;
  required?: boolean;
  searchable?: boolean;
  sortable?: boolean;
  filterable?: boolean;
  unique?: boolean;
  indexed?: boolean;
  encrypted?: boolean;
  
  // Display properties
  hidden?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  order?: number;
  group?: string;
  
  // Type-specific properties
  options?: FieldOption[]; // For enum fields
  multiple?: boolean; // For array fields
  minItems?: number; // For array fields
  maxItems?: number; // For array fields
  allowedFileTypes?: string[]; // For file/image fields
  maxFileSize?: number; // For file/image fields
  
  // Validation
  validations?: FieldValidation[];
  
  // Conditional logic
  showWhen?: {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'exists' | 'not_exists';
    value?: any;
  }[];
  
  // Database properties
  dbColumn?: string;
  dbType?: string;
  dbConstraints?: string[];
  
  // Localization
  i18n?: {
    [locale: string]: {
      label?: string;
      description?: string;
      placeholder?: string;
      validationMessages?: { [rule: string]: string };
    };
  };
}
```

### 2. Schema Definition

```typescript
// src/lib/auth/schema/types/schema-types.ts
export interface UserSchemaConfiguration {
  version: string;
  name: string;
  description?: string;
  
  // Core fields (always present)
  coreFields: {
    id: FieldConfiguration;
    email: FieldConfiguration;
    password?: FieldConfiguration; // Optional for OAuth-only users
    createdAt: FieldConfiguration;
    updatedAt: FieldConfiguration;
  };
  
  // Configurable fields
  customFields: FieldConfiguration[];
  
  // Field groups for organization
  fieldGroups?: {
    name: string;
    label: string;
    description?: string;
    order?: number;
    collapsible?: boolean;
    fields: string[]; // Field names
  }[];
  
  // Schema-level settings
  settings: {
    allowRegistration: boolean;
    requireEmailVerification: boolean;
    passwordPolicy?: PasswordPolicy;
    profileCompletionRequired?: boolean;
    auditTrail?: boolean;
    softDelete?: boolean;
  };
  
  // Database settings
  database: {
    tableName?: string;
    indexes?: DatabaseIndex[];
    constraints?: DatabaseConstraint[];
  };
  
  // Hooks and events
  hooks?: {
    beforeCreate?: string[];
    afterCreate?: string[];
    beforeUpdate?: string[];
    afterUpdate?: string[];
    beforeDelete?: string[];
    afterDelete?: string[];
  };
}

export interface PasswordPolicy {
  minLength: number;
  maxLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  forbidCommonPasswords?: boolean;
  forbidPersonalInfo?: boolean;
  expirationDays?: number;
  historyCount?: number;
}

export interface DatabaseIndex {
  name: string;
  fields: string[];
  unique?: boolean;
  partial?: string; // Partial index condition
  type?: 'btree' | 'hash' | 'gin' | 'gist';
}

export interface DatabaseConstraint {
  name: string;
  type: 'check' | 'foreign_key' | 'unique' | 'not_null';
  definition: string;
}
```

### 3. Predefined Schema Templates

```typescript
// src/lib/auth/schema/templates/schema-templates.ts
import { UserSchemaConfiguration, FieldType, ValidationRule } from '../types/schema-types';

export const BASIC_SCHEMA: UserSchemaConfiguration = {
  version: '1.0.0',
  name: 'basic',
  description: 'Basic user schema with essential fields',
  
  coreFields: {
    id: {
      name: 'id',
      type: FieldType.STRING,
      label: 'User ID',
      required: true,
      unique: true,
      readonly: true,
      indexed: true
    },
    email: {
      name: 'email',
      type: FieldType.EMAIL,
      label: 'Email Address',
      required: true,
      unique: true,
      indexed: true,
      validations: [
        { rule: ValidationRule.REQUIRED, message: 'Email is required' },
        { rule: ValidationRule.EMAIL_FORMAT, message: 'Invalid email format' },
        { rule: ValidationRule.UNIQUE, message: 'Email already exists' }
      ]
    },
    password: {
      name: 'password',
      type: FieldType.PASSWORD,
      label: 'Password',
      required: true,
      encrypted: true,
      validations: [
        { rule: ValidationRule.REQUIRED, message: 'Password is required' },
        { rule: ValidationRule.MIN_LENGTH, value: 8, message: 'Password must be at least 8 characters' }
      ]
    },
    createdAt: {
      name: 'createdAt',
      type: FieldType.DATETIME,
      label: 'Created At',
      readonly: true,
      indexed: true
    },
    updatedAt: {
      name: 'updatedAt',
      type: FieldType.DATETIME,
      label: 'Updated At',
      readonly: true
    }
  },
  
  customFields: [
    {
      name: 'firstName',
      type: FieldType.STRING,
      label: 'First Name',
      required: true,
      searchable: true,
      validations: [
        { rule: ValidationRule.REQUIRED, message: 'First name is required' },
        { rule: ValidationRule.MIN_LENGTH, value: 2, message: 'First name must be at least 2 characters' },
        { rule: ValidationRule.MAX_LENGTH, value: 50, message: 'First name cannot exceed 50 characters' }
      ]
    },
    {
      name: 'lastName',
      type: FieldType.STRING,
      label: 'Last Name',
      required: true,
      searchable: true,
      validations: [
        { rule: ValidationRule.REQUIRED, message: 'Last name is required' },
        { rule: ValidationRule.MIN_LENGTH, value: 2, message: 'Last name must be at least 2 characters' },
        { rule: ValidationRule.MAX_LENGTH, value: 50, message: 'Last name cannot exceed 50 characters' }
      ]
    }
  ],
  
  settings: {
    allowRegistration: true,
    requireEmailVerification: true,
    passwordPolicy: {
      minLength: 8,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true
    }
  },
  
  database: {
    tableName: 'users',
    indexes: [
      { name: 'idx_users_email', fields: ['email'], unique: true },
      { name: 'idx_users_name', fields: ['firstName', 'lastName'] },
      { name: 'idx_users_created', fields: ['createdAt'] }
    ]
  }
};

export const FULL_NAME_SCHEMA: UserSchemaConfiguration = {
  ...BASIC_SCHEMA,
  name: 'fullName',
  description: 'User schema with full name instead of separate first/last names',
  
  customFields: [
    {
      name: 'fullName',
      type: FieldType.STRING,
      label: 'Full Name',
      required: true,
      searchable: true,
      validations: [
        { rule: ValidationRule.REQUIRED, message: 'Full name is required' },
        { rule: ValidationRule.MIN_LENGTH, value: 2, message: 'Full name must be at least 2 characters' },
        { rule: ValidationRule.MAX_LENGTH, value: 100, message: 'Full name cannot exceed 100 characters' }
      ]
    }
  ]
};

export const EXTENDED_SCHEMA: UserSchemaConfiguration = {
  ...BASIC_SCHEMA,
  name: 'extended',
  description: 'Extended user schema with additional profile fields',
  
  customFields: [
    ...BASIC_SCHEMA.customFields,
    {
      name: 'avatar',
      type: FieldType.IMAGE,
      label: 'Profile Picture',
      allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxFileSize: 5 * 1024 * 1024, // 5MB
      validations: [
        { rule: ValidationRule.FILE_SIZE, value: 5 * 1024 * 1024, message: 'Image must be less than 5MB' },
        { rule: ValidationRule.FILE_TYPE, value: ['image/jpeg', 'image/png', 'image/webp'], message: 'Only JPEG, PNG, and WebP images are allowed' }
      ]
    },
    {
      name: 'dateOfBirth',
      type: FieldType.DATE,
      label: 'Date of Birth',
      validations: [
        { rule: ValidationRule.DATE_RANGE, value: { min: '1900-01-01', max: new Date().toISOString().split('T')[0] }, message: 'Invalid date of birth' }
      ]
    },
    {
      name: 'phoneNumber',
      type: FieldType.PHONE,
      label: 'Phone Number',
      validations: [
        { rule: ValidationRule.PHONE_FORMAT, message: 'Invalid phone number format' }
      ]
    },
    {
      name: 'gender',
      type: FieldType.ENUM,
      label: 'Gender',
      options: [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
        { value: 'other', label: 'Other' },
        { value: 'prefer_not_to_say', label: 'Prefer not to say' }
      ]
    },
    {
      name: 'bio',
      type: FieldType.STRING,
      label: 'Biography',
      description: 'Tell us about yourself',
      validations: [
        { rule: ValidationRule.MAX_LENGTH, value: 500, message: 'Biography cannot exceed 500 characters' }
      ]
    },
    {
      name: 'website',
      type: FieldType.URL,
      label: 'Website',
      validations: [
        { rule: ValidationRule.URL_FORMAT, message: 'Invalid URL format' }
      ]
    },
    {
      name: 'preferences',
      type: FieldType.JSON,
      label: 'User Preferences',
      hidden: true, // Not shown in forms
      defaultValue: {}
    },
    {
      name: 'isEmailVerified',
      type: FieldType.BOOLEAN,
      label: 'Email Verified',
      readonly: true,
      defaultValue: false
    },
    {
      name: 'lastLoginAt',
      type: FieldType.DATETIME,
      label: 'Last Login',
      readonly: true,
      indexed: true
    }
  ],
  
  fieldGroups: [
    {
      name: 'basic',
      label: 'Basic Information',
      order: 1,
      fields: ['firstName', 'lastName', 'email']
    },
    {
      name: 'profile',
      label: 'Profile Details',
      order: 2,
      fields: ['avatar', 'dateOfBirth', 'phoneNumber', 'gender', 'bio', 'website']
    },
    {
      name: 'system',
      label: 'System Information',
      order: 3,
      collapsible: true,
      fields: ['isEmailVerified', 'lastLoginAt', 'createdAt', 'updatedAt']
    }
  ]
};

export const SCHEMA_TEMPLATES = {
  basic: BASIC_SCHEMA,
  fullName: FULL_NAME_SCHEMA,
  extended: EXTENDED_SCHEMA
};
```

### 4. Schema Manager

```typescript
// src/lib/auth/schema/manager/schema-manager.ts
import { UserSchemaConfiguration, FieldConfiguration } from '../types/schema-types';
import { SCHEMA_TEMPLATES } from '../templates/schema-templates';
import { SchemaValidator } from '../validation/schema-validator';
import { SchemaMigrator } from '../migration/schema-migrator';
import { SchemaCache } from '../cache/schema-cache';

export class SchemaManager {
  private currentSchema: UserSchemaConfiguration | null = null;
  private validator: SchemaValidator;
  private migrator: SchemaMigrator;
  private cache: SchemaCache;

  constructor() {
    this.validator = new SchemaValidator();
    this.migrator = new SchemaMigrator();
    this.cache = new SchemaCache();
  }

  /**
   * Load schema configuration
   */
  async loadSchema(source?: string | UserSchemaConfiguration): Promise<UserSchemaConfiguration> {
    let schema: UserSchemaConfiguration;

    if (!source) {
      // Load from environment or default
      const schemaName = process.env.USER_SCHEMA_TEMPLATE || 'basic';
      schema = await this.loadSchemaTemplate(schemaName);
    } else if (typeof source === 'string') {
      // Load from template name or file path
      if (source.endsWith('.json') || source.endsWith('.js') || source.endsWith('.ts')) {
        schema = await this.loadSchemaFromFile(source);
      } else {
        schema = await this.loadSchemaTemplate(source);
      }
    } else {
      // Use provided schema object
      schema = source;
    }

    // Validate schema
    await this.validator.validateSchema(schema);

    // Cache schema
    await this.cache.setSchema(schema);

    this.currentSchema = schema;
    return schema;
  }

  /**
   * Get current schema
   */
  getCurrentSchema(): UserSchemaConfiguration | null {
    return this.currentSchema;
  }

  /**
   * Get all fields (core + custom)
   */
  getAllFields(): FieldConfiguration[] {
    if (!this.currentSchema) {
      throw new Error('Schema not loaded');
    }

    const coreFields = Object.values(this.currentSchema.coreFields);
    const customFields = this.currentSchema.customFields || [];
    
    return [...coreFields, ...customFields].sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  /**
   * Get field by name
   */
  getField(name: string): FieldConfiguration | null {
    if (!this.currentSchema) {
      return null;
    }

    // Check core fields
    const coreField = this.currentSchema.coreFields[name as keyof typeof this.currentSchema.coreFields];
    if (coreField) {
      return coreField;
    }

    // Check custom fields
    return this.currentSchema.customFields.find(field => field.name === name) || null;
  }

  /**
   * Get fields by group
   */
  getFieldsByGroup(groupName: string): FieldConfiguration[] {
    if (!this.currentSchema) {
      return [];
    }

    const group = this.currentSchema.fieldGroups?.find(g => g.name === groupName);
    if (!group) {
      return [];
    }

    return group.fields
      .map(fieldName => this.getField(fieldName))
      .filter(field => field !== null) as FieldConfiguration[];
  }

  /**
   * Get searchable fields
   */
  getSearchableFields(): FieldConfiguration[] {
    return this.getAllFields().filter(field => field.searchable);
  }

  /**
   * Get filterable fields
   */
  getFilterableFields(): FieldConfiguration[] {
    return this.getAllFields().filter(field => field.filterable);
  }

  /**
   * Get sortable fields
   */
  getSortableFields(): FieldConfiguration[] {
    return this.getAllFields().filter(field => field.sortable);
  }

  /**
   * Add custom field
   */
  async addField(field: FieldConfiguration): Promise<void> {
    if (!this.currentSchema) {
      throw new Error('Schema not loaded');
    }

    // Validate field
    await this.validator.validateField(field);

    // Check for name conflicts
    if (this.getField(field.name)) {
      throw new Error(`Field '${field.name}' already exists`);
    }

    // Add field
    this.currentSchema.customFields.push(field);

    // Update cache
    await this.cache.setSchema(this.currentSchema);

    // Create database migration
    await this.migrator.addField(field);
  }

  /**
   * Update field
   */
  async updateField(name: string, updates: Partial<FieldConfiguration>): Promise<void> {
    if (!this.currentSchema) {
      throw new Error('Schema not loaded');
    }

    const fieldIndex = this.currentSchema.customFields.findIndex(f => f.name === name);
    if (fieldIndex === -1) {
      throw new Error(`Field '${name}' not found`);
    }

    const updatedField = { ...this.currentSchema.customFields[fieldIndex], ...updates };
    
    // Validate updated field
    await this.validator.validateField(updatedField);

    // Update field
    this.currentSchema.customFields[fieldIndex] = updatedField;

    // Update cache
    await this.cache.setSchema(this.currentSchema);

    // Create database migration
    await this.migrator.updateField(name, updates);
  }

  /**
   * Remove field
   */
  async removeField(name: string): Promise<void> {
    if (!this.currentSchema) {
      throw new Error('Schema not loaded');
    }

    // Check if it's a core field
    if (this.currentSchema.coreFields[name as keyof typeof this.currentSchema.coreFields]) {
      throw new Error(`Cannot remove core field '${name}'`);
    }

    const fieldIndex = this.currentSchema.customFields.findIndex(f => f.name === name);
    if (fieldIndex === -1) {
      throw new Error(`Field '${name}' not found`);
    }

    // Remove field
    this.currentSchema.customFields.splice(fieldIndex, 1);

    // Update cache
    await this.cache.setSchema(this.currentSchema);

    // Create database migration
    await this.migrator.removeField(name);
  }

  /**
   * Generate TypeScript types
   */
  generateTypes(): string {
    if (!this.currentSchema) {
      throw new Error('Schema not loaded');
    }

    const fields = this.getAllFields();
    const typeDefinitions: string[] = [];

    // Generate main user interface
    const userInterface = this.generateUserInterface(fields);
    typeDefinitions.push(userInterface);

    // Generate field-specific types
    const fieldTypes = this.generateFieldTypes(fields);
    typeDefinitions.push(...fieldTypes);

    return typeDefinitions.join('\n\n');
  }

  private async loadSchemaTemplate(templateName: string): Promise<UserSchemaConfiguration> {
    const template = SCHEMA_TEMPLATES[templateName as keyof typeof SCHEMA_TEMPLATES];
    if (!template) {
      throw new Error(`Schema template '${templateName}' not found`);
    }
    return JSON.parse(JSON.stringify(template)); // Deep clone
  }

  private async loadSchemaFromFile(filePath: string): Promise<UserSchemaConfiguration> {
    // Implementation depends on runtime environment
    // For Node.js:
    if (typeof require !== 'undefined') {
      const fs = require('fs');
      const path = require('path');
      
      const fullPath = path.resolve(filePath);
      const content = fs.readFileSync(fullPath, 'utf8');
      
      if (filePath.endsWith('.json')) {
        return JSON.parse(content);
      } else {
        // For .js/.ts files, use dynamic import
        const module = await import(fullPath);
        return module.default || module;
      }
    }
    
    throw new Error('File loading not supported in this environment');
  }

  private generateUserInterface(fields: FieldConfiguration[]): string {
    const properties = fields.map(field => {
      const optional = !field.required ? '?' : '';
      const type = this.getTypeScriptType(field);
      return `  ${field.name}${optional}: ${type};`;
    }).join('\n');

    return `export interface User {\n${properties}\n}`;
  }

  private generateFieldTypes(fields: FieldConfiguration[]): string[] {
    const types: string[] = [];
    
    // Generate enum types
    fields.filter(field => field.type === 'enum' && field.options).forEach(field => {
      const enumName = this.toPascalCase(field.name) + 'Enum';
      const values = field.options!.map(option => 
        `  ${option.value.toString().toUpperCase()} = '${option.value}'`
      ).join(',\n');
      
      types.push(`export enum ${enumName} {\n${values}\n}`);
    });

    return types;
  }

  private getTypeScriptType(field: FieldConfiguration): string {
    switch (field.type) {
      case 'string':
      case 'email':
      case 'password':
      case 'url':
      case 'phone':
        return 'string';
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
      case 'datetime':
        return 'Date';
      case 'enum':
        return this.toPascalCase(field.name) + 'Enum';
      case 'array':
        return 'any[]';
      case 'object':
      case 'json':
        return 'Record<string, any>';
      case 'file':
      case 'image':
        return 'File | string';
      default:
        return 'any';
    }
  }

  private toPascalCase(str: string): string {
    return str.replace(/(^|_)([a-z])/g, (_, __, char) => char.toUpperCase());
  }
}
```

### 5. Schema Validation

```typescript
// src/lib/auth/schema/validation/schema-validator.ts
import { UserSchemaConfiguration, FieldConfiguration, ValidationRule } from '../types/schema-types';
import { z } from 'zod';

export class SchemaValidator {
  /**
   * Validate complete schema configuration
   */
  async validateSchema(schema: UserSchemaConfiguration): Promise<void> {
    // Basic structure validation
    this.validateSchemaStructure(schema);
    
    // Validate core fields
    this.validateCoreFields(schema.coreFields);
    
    // Validate custom fields
    for (const field of schema.customFields) {
      await this.validateField(field);
    }
    
    // Validate field groups
    this.validateFieldGroups(schema);
    
    // Validate database configuration
    this.validateDatabaseConfig(schema.database);
  }

  /**
   * Validate individual field configuration
   */
  async validateField(field: FieldConfiguration): Promise<void> {
    // Basic field validation
    this.validateFieldStructure(field);
    
    // Type-specific validation
    this.validateFieldType(field);
    
    // Validation rules validation
    this.validateFieldValidations(field);
    
    // Conditional logic validation
    this.validateConditionalLogic(field);
  }

  /**
   * Validate user data against schema
   */
  async validateUserData(data: Record<string, any>, schema: UserSchemaConfiguration): Promise<{
    isValid: boolean;
    errors: Array<{ field: string; message: string; rule?: string }>;
    sanitizedData: Record<string, any>;
  }> {
    const errors: Array<{ field: string; message: string; rule?: string }> = [];
    const sanitizedData: Record<string, any> = {};
    
    const allFields = [
      ...Object.values(schema.coreFields),
      ...schema.customFields
    ];

    for (const field of allFields) {
      const value = data[field.name];
      
      // Check if field should be shown based on conditional logic
      if (!this.shouldShowField(field, data)) {
        continue;
      }
      
      // Validate field value
      const fieldValidation = await this.validateFieldValue(field, value, data);
      
      if (fieldValidation.errors.length > 0) {
        errors.push(...fieldValidation.errors);
      } else {
        sanitizedData[field.name] = fieldValidation.sanitizedValue;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData
    };
  }

  private validateSchemaStructure(schema: UserSchemaConfiguration): void {
    if (!schema.version) {
      throw new Error('Schema version is required');
    }
    
    if (!schema.name) {
      throw new Error('Schema name is required');
    }
    
    if (!schema.coreFields) {
      throw new Error('Core fields are required');
    }
    
    if (!schema.settings) {
      throw new Error('Schema settings are required');
    }
  }

  private validateCoreFields(coreFields: UserSchemaConfiguration['coreFields']): void {
    const requiredCoreFields = ['id', 'email', 'createdAt', 'updatedAt'];
    
    for (const fieldName of requiredCoreFields) {
      if (!coreFields[fieldName as keyof typeof coreFields]) {
        throw new Error(`Core field '${fieldName}' is required`);
      }
    }
  }

  private validateFieldStructure(field: FieldConfiguration): void {
    if (!field.name) {
      throw new Error('Field name is required');
    }
    
    if (!field.type) {
      throw new Error(`Field type is required for field '${field.name}'`);
    }
    
    if (!field.label) {
      throw new Error(`Field label is required for field '${field.name}'`);
    }
    
    // Validate field name format
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
      throw new Error(`Invalid field name '${field.name}'. Must start with letter and contain only letters, numbers, and underscores.`);
    }
  }

  private validateFieldType(field: FieldConfiguration): void {
    switch (field.type) {
      case 'enum':
        if (!field.options || field.options.length === 0) {
          throw new Error(`Enum field '${field.name}' must have options`);
        }
        break;
        
      case 'array':
        if (field.minItems !== undefined && field.maxItems !== undefined) {
          if (field.minItems > field.maxItems) {
            throw new Error(`Array field '${field.name}' minItems cannot be greater than maxItems`);
          }
        }
        break;
        
      case 'file':
      case 'image':
        if (field.maxFileSize && field.maxFileSize <= 0) {
          throw new Error(`File field '${field.name}' maxFileSize must be positive`);
        }
        break;
    }
  }

  private validateFieldValidations(field: FieldConfiguration): void {
    if (!field.validations) {
      return;
    }
    
    for (const validation of field.validations) {
      this.validateValidationRule(field, validation);
    }
  }

  private validateValidationRule(field: FieldConfiguration, validation: any): void {
    switch (validation.rule) {
      case ValidationRule.MIN_LENGTH:
      case ValidationRule.MAX_LENGTH:
        if (typeof validation.value !== 'number' || validation.value < 0) {
          throw new Error(`${validation.rule} validation for field '${field.name}' must have a positive number value`);
        }
        break;
        
      case ValidationRule.MIN_VALUE:
      case ValidationRule.MAX_VALUE:
        if (typeof validation.value !== 'number') {
          throw new Error(`${validation.rule} validation for field '${field.name}' must have a number value`);
        }
        break;
        
      case ValidationRule.PATTERN:
        if (typeof validation.value !== 'string') {
          throw new Error(`Pattern validation for field '${field.name}' must have a string value`);
        }
        try {
          new RegExp(validation.value);
        } catch (error) {
          throw new Error(`Invalid regex pattern for field '${field.name}': ${validation.value}`);
        }
        break;
    }
  }

  private validateConditionalLogic(field: FieldConfiguration): void {
    if (!field.showWhen) {
      return;
    }
    
    for (const condition of field.showWhen) {
      if (!condition.field) {
        throw new Error(`Conditional logic for field '${field.name}' must specify a field`);
      }
      
      if (!condition.operator) {
        throw new Error(`Conditional logic for field '${field.name}' must specify an operator`);
      }
    }
  }

  private validateFieldGroups(schema: UserSchemaConfiguration): void {
    if (!schema.fieldGroups) {
      return;
    }
    
    const allFieldNames = [
      ...Object.keys(schema.coreFields),
      ...schema.customFields.map(f => f.name)
    ];
    
    for (const group of schema.fieldGroups) {
      if (!group.name) {
        throw new Error('Field group name is required');
      }
      
      if (!group.label) {
        throw new Error(`Field group label is required for group '${group.name}'`);
      }
      
      for (const fieldName of group.fields) {
        if (!allFieldNames.includes(fieldName)) {
          throw new Error(`Field '${fieldName}' in group '${group.name}' does not exist`);
        }
      }
    }
  }

  private validateDatabaseConfig(dbConfig: UserSchemaConfiguration['database']): void {
    if (!dbConfig) {
      return;
    }
    
    // Validate indexes
    if (dbConfig.indexes) {
      for (const index of dbConfig.indexes) {
        if (!index.name) {
          throw new Error('Database index name is required');
        }
        
        if (!index.fields || index.fields.length === 0) {
          throw new Error(`Database index '${index.name}' must have fields`);
        }
      }
    }
  }

  private async validateFieldValue(
    field: FieldConfiguration,
    value: any,
    allData: Record<string, any>
  ): Promise<{
    errors: Array<{ field: string; message: string; rule?: string }>;
    sanitizedValue: any;
  }> {
    const errors: Array<{ field: string; message: string; rule?: string }> = [];
    let sanitizedValue = value;

    // Check required validation
    if (field.required && (value === undefined || value === null || value === '')) {
      errors.push({
        field: field.name,
        message: `${field.label} is required`,
        rule: 'required'
      });
      return { errors, sanitizedValue };
    }

    // Skip other validations if value is empty and field is not required
    if (!field.required && (value === undefined || value === null || value === '')) {
      return { errors, sanitizedValue };
    }

    // Type-specific validation and sanitization
    const typeValidation = this.validateAndSanitizeByType(field, value);
    if (typeValidation.error) {
      errors.push({
        field: field.name,
        message: typeValidation.error,
        rule: 'type'
      });
      return { errors, sanitizedValue };
    }
    sanitizedValue = typeValidation.sanitizedValue;

    // Custom validation rules
    if (field.validations) {
      for (const validation of field.validations) {
        const ruleValidation = await this.validateRule(field, sanitizedValue, validation, allData);
        if (ruleValidation.error) {
          errors.push({
            field: field.name,
            message: ruleValidation.error,
            rule: validation.rule
          });
        }
      }
    }

    return { errors, sanitizedValue };
  }

  private validateAndSanitizeByType(field: FieldConfiguration, value: any): {
    error?: string;
    sanitizedValue: any;
  } {
    switch (field.type) {
      case 'string':
      case 'email':
      case 'password':
      case 'url':
      case 'phone':
        if (typeof value !== 'string') {
          return { error: `${field.label} must be a string` };
        }
        return { sanitizedValue: value.trim() };
        
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          return { error: `${field.label} must be a number` };
        }
        return { sanitizedValue: num };
        
      case 'boolean':
        if (typeof value === 'boolean') {
          return { sanitizedValue: value };
        }
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1') {
            return { sanitizedValue: true };
          }
          if (lower === 'false' || lower === '0') {
            return { sanitizedValue: false };
          }
        }
        return { error: `${field.label} must be a boolean` };
        
      case 'date':
      case 'datetime':
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return { error: `${field.label} must be a valid date` };
        }
        return { sanitizedValue: date };
        
      case 'enum':
        const validValues = field.options?.map(opt => opt.value) || [];
        if (!validValues.includes(value)) {
          return { error: `${field.label} must be one of: ${validValues.join(', ')}` };
        }
        return { sanitizedValue: value };
        
      case 'array':
        if (!Array.isArray(value)) {
          return { error: `${field.label} must be an array` };
        }
        return { sanitizedValue: value };
        
      default:
        return { sanitizedValue: value };
    }
  }

  private async validateRule(
    field: FieldConfiguration,
    value: any,
    validation: any,
    allData: Record<string, any>
  ): Promise<{ error?: string }> {
    // Check conditional validation
    if (validation.conditional) {
      const conditionMet = this.evaluateCondition(
        validation.conditional,
        allData
      );
      if (!conditionMet) {
        return {}; // Skip validation if condition not met
      }
    }

    switch (validation.rule) {
      case ValidationRule.MIN_LENGTH:
        if (typeof value === 'string' && value.length < validation.value) {
          return { error: validation.message || `${field.label} must be at least ${validation.value} characters` };
        }
        break;
        
      case ValidationRule.MAX_LENGTH:
        if (typeof value === 'string' && value.length > validation.value) {
          return { error: validation.message || `${field.label} cannot exceed ${validation.value} characters` };
        }
        break;
        
      case ValidationRule.MIN_VALUE:
        if (typeof value === 'number' && value < validation.value) {
          return { error: validation.message || `${field.label} must be at least ${validation.value}` };
        }
        break;
        
      case ValidationRule.MAX_VALUE:
        if (typeof value === 'number' && value > validation.value) {
          return { error: validation.message || `${field.label} cannot exceed ${validation.value}` };
        }
        break;
        
      case ValidationRule.PATTERN:
        if (typeof value === 'string') {
          const regex = new RegExp(validation.value);
          if (!regex.test(value)) {
            return { error: validation.message || `${field.label} format is invalid` };
          }
        }
        break;
        
      case ValidationRule.EMAIL_FORMAT:
        if (typeof value === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            return { error: validation.message || 'Invalid email format' };
          }
        }
        break;
        
      case ValidationRule.URL_FORMAT:
        if (typeof value === 'string') {
          try {
            new URL(value);
          } catch {
            return { error: validation.message || 'Invalid URL format' };
          }
        }
        break;
        
      case ValidationRule.PHONE_FORMAT:
        if (typeof value === 'string') {
          const phoneRegex = /^[+]?[1-9]?[0-9]{7,15}$/;
          if (!phoneRegex.test(value.replace(/[\s()-]/g, ''))) {
            return { error: validation.message || 'Invalid phone number format' };
          }
        }
        break;
    }

    return {};
  }

  private shouldShowField(field: FieldConfiguration, data: Record<string, any>): boolean {
    if (!field.showWhen) {
      return true;
    }
    
    return field.showWhen.every(condition => 
      this.evaluateCondition(condition, data)
    );
  }

  private evaluateCondition(condition: any, data: Record<string, any>): boolean {
    const fieldValue = data[condition.field];
    
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'not_equals':
        return fieldValue !== condition.value;
      case 'contains':
        return Array.isArray(fieldValue) ? 
          fieldValue.includes(condition.value) :
          String(fieldValue).includes(String(condition.value));
      case 'not_contains':
        return Array.isArray(fieldValue) ? 
          !fieldValue.includes(condition.value) :
          !String(fieldValue).includes(String(condition.value));
      case 'exists':
        return fieldValue !== undefined && fieldValue !== null && fieldValue !== '';
      case 'not_exists':
        return fieldValue === undefined || fieldValue === null || fieldValue === '';
      default:
        return true;
    }
  }
}
```

### 6. Configuration API

```typescript
// src/app/api/auth/schema/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { SchemaManager } from '../../../../lib/auth/schema/manager/schema-manager';
import { getAuthenticatedUser } from '../../../../lib/auth/utils/auth-helpers';

const schemaManager = new SchemaManager();

export async function GET(request: NextRequest) {
  try {
    // Load current schema
    const schema = await schemaManager.loadSchema();
    
    return NextResponse.json({
      schema: {
        name: schema.name,
        version: schema.version,
        description: schema.description,
        fields: schemaManager.getAllFields(),
        fieldGroups: schema.fieldGroups,
        settings: schema.settings
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check admin permissions
    const user = await getAuthenticatedUser(request);
    if (!user || !user.isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { action, ...data } = await request.json();

    switch (action) {
      case 'addField':
        await schemaManager.addField(data.field);
        break;
        
      case 'updateField':
        await schemaManager.updateField(data.name, data.updates);
        break;
        
      case 'removeField':
        await schemaManager.removeField(data.name);
        break;
        
      case 'loadTemplate':
        await schemaManager.loadSchema(data.template);
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### 7. Frontend Schema Configuration

```typescript
// src/components/admin/SchemaConfiguration.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { FieldConfiguration, UserSchemaConfiguration } from '../../lib/auth/schema/types/schema-types';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FieldEditor } from './FieldEditor';
import { SchemaTemplateSelector } from './SchemaTemplateSelector';

export function SchemaConfiguration() {
  const [schema, setSchema] = useState<UserSchemaConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<FieldConfiguration | null>(null);
  const [showAddField, setShowAddField] = useState(false);

  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    try {
      const response = await fetch('/api/auth/schema');
      const data = await response.json();
      setSchema(data.schema);
    } catch (error) {
      console.error('Failed to load schema:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddField = async (field: FieldConfiguration) => {
    try {
      await fetch('/api/auth/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'addField', field })
      });
      
      await loadSchema();
      setShowAddField(false);
    } catch (error) {
      console.error('Failed to add field:', error);
    }
  };

  const handleUpdateField = async (name: string, updates: Partial<FieldConfiguration>) => {
    try {
      await fetch('/api/auth/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateField', name, updates })
      });
      
      await loadSchema();
      setEditingField(null);
    } catch (error) {
      console.error('Failed to update field:', error);
    }
  };

  const handleRemoveField = async (name: string) => {
    if (!confirm(`Are you sure you want to remove the field '${name}'?`)) {
      return;
    }
    
    try {
      await fetch('/api/auth/schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'removeField', name })
      });
      
      await loadSchema();
    } catch (error) {
      console.error('Failed to remove field:', error);
    }
  };

  if (loading) {
    return <div className="p-6">Loading schema configuration...</div>;
  }

  if (!schema) {
    return <div className="p-6">Failed to load schema configuration.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">User Schema Configuration</h1>
        <div className="space-x-2">
          <SchemaTemplateSelector onTemplateSelect={loadSchema} />
          <Button onClick={() => setShowAddField(true)}>Add Field</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Schema Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Name:</label>
              <p className="text-sm text-gray-600">{schema.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Version:</label>
              <p className="text-sm text-gray-600">{schema.version}</p>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium">Description:</label>
              <p className="text-sm text-gray-600">{schema.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {schema.fields?.map((field) => (
              <div key={field.name} className="flex items-center justify-between p-4 border rounded">
                <div>
                  <h3 className="font-medium">{field.label}</h3>
                  <p className="text-sm text-gray-600">
                    {field.name} ({field.type})
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                </div>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingField(field)}
                  >
                    Edit
                  </Button>
                  {!field.name.startsWith('core_') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveField(field.name)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {(showAddField || editingField) && (
        <FieldEditor
          field={editingField}
          onSave={editingField ? 
            (updates) => handleUpdateField(editingField.name, updates) :
            handleAddField
          }
          onCancel={() => {
            setShowAddField(false);
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
}
```

This flexible user schema configuration system provides a comprehensive solution for dynamically managing user fields in the Next.js authentication template. It supports various field types, validation rules, conditional logic, and database schema management while maintaining type safety and performance optimization.