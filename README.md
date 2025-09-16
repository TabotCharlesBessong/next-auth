# Next.js Authentication Template

A comprehensive, flexible authentication system template for Next.js applications that supports multiple databases, social authentication providers, and configurable user schemas.

## 🚀 Features

### Core Authentication
- **Email/Password Authentication** - Secure user registration and login
- **Social Authentication** - Google, Facebook, GitHub, Twitter, LinkedIn, Discord
- **JWT Token Management** - Secure token generation and validation
- **Password Reset** - Email-based password recovery
- **Email Verification** - Account verification workflow
- **Session Management** - Secure session handling

### Database Support
- **PostgreSQL** - Full support with Prisma ORM
- **MySQL** - Complete MySQL integration
- **MongoDB** - NoSQL database support
- **Database Abstraction** - Switch between databases without code changes

### Flexible User Schema
- **Configurable Fields** - Add/remove user fields dynamically
- **Field Types** - String, Email, Number, Boolean, Date, Enum, Array, File, etc.
- **Validation Rules** - Comprehensive field validation system
- **Conditional Fields** - Fields that show/hide based on other field values
- **Schema Templates** - Pre-built schema configurations

### Security Features
- **Password Policies** - Configurable password requirements
- **Rate Limiting** - Protection against brute force attacks
- **CSRF Protection** - Cross-site request forgery prevention
- **Input Sanitization** - XSS protection
- **Secure Headers** - Security-focused HTTP headers
- **Audit Trail** - User activity logging

### Developer Experience
- **TypeScript Support** - Full type safety
- **API Documentation** - Comprehensive API docs
- **Testing Suite** - Unit and integration tests
- **Development Tools** - Hot reload, debugging support
- **Migration System** - Database schema migrations

## 📋 Prerequisites

- Node.js 18.0 or higher
- npm, yarn, or pnpm
- Database (PostgreSQL, MySQL, or MongoDB)
- Email service (for verification and password reset)

## 🛠️ Quick Start

### 1. Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-username/nextjs-auth-template.git
cd nextjs-auth-template

# Install dependencies
npm install
# or
yarn install
# or
pnpm install
```

### 2. Environment Configuration

Copy the environment template and configure your settings:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Database Configuration
DATABASE_TYPE=postgresql # postgresql | mysql | mongodb
DATABASE_URL="postgresql://username:password@localhost:5432/mydb"

# JWT Configuration
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
REFRESH_TOKEN_EXPIRES_IN="30d"

# Email Configuration
EMAIL_PROVIDER=smtp # smtp | sendgrid | mailgun | ses
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
FROM_EMAIL="noreply@yourapp.com"
FROM_NAME="Your App Name"

# Social Authentication
GOOGLE_CLIENT_ID="your-google-client-id"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

FACEBOOK_APP_ID="your-facebook-app-id"
FACEBOOK_APP_SECRET="your-facebook-app-secret"

GITHUB_CLIENT_ID="your-github-client-id"
GITHUB_CLIENT_SECRET="your-github-client-secret"

# Application Configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Your App Name"

# User Schema Configuration
USER_SCHEMA_TEMPLATE=basic # basic | fullName | extended | custom

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000

# File Upload Configuration
UPLOAD_MAX_SIZE=5242880 # 5MB
UPLOAD_ALLOWED_TYPES="image/jpeg,image/png,image/webp"
UPLOAD_STORAGE=local # local | s3 | cloudinary
```

### 3. Database Setup

#### PostgreSQL
```bash
# Install PostgreSQL client
npm install pg @types/pg

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

#### MySQL
```bash
# Install MySQL client
npm install mysql2

# Run database migrations
npm run db:migrate

# Seed initial data (optional)
npm run db:seed
```

#### MongoDB
```bash
# Install MongoDB client
npm install mongodb mongoose

# Run database setup
npm run db:setup

# Seed initial data (optional)
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📚 Documentation

### Core Documents
- [System Design](./SYSTEM_DESIGN.md) - Complete system architecture
- [UML Diagrams](./UML_DIAGRAMS.md) - Visual system representations
- [Project Roadmap](./PROJECT_ROADMAP.md) - Development phases and milestones
- [Implementation Timeline](./IMPLEMENTATION_TIMELINE.md) - Detailed timeline
- [Database Abstraction](./DATABASE_ABSTRACTION.md) - Database layer design
- [Social Authentication](./SOCIAL_AUTH_ARCHITECTURE.md) - Social login integration
- [User Schema Configuration](./USER_SCHEMA_CONFIGURATION.md) - Flexible schema system

### Quick Links
- 🔧 [Configuration Guide](#-configuration)
- 🧪 [Testing Guide](#-testing)
- 🚀 [Deployment Guide](#-deployment)
- 🔒 [Security Best Practices](#-security-best-practices)
- 🐛 [Troubleshooting](#-troubleshooting)

## 🔧 Configuration

### User Schema Templates

```env
# Basic schema (firstName, lastName, email, password)
USER_SCHEMA_TEMPLATE=basic

# Full name schema (fullName, email, password)
USER_SCHEMA_TEMPLATE=fullName

# Extended schema (includes avatar, bio, phone, etc.)
USER_SCHEMA_TEMPLATE=extended
```

### Social Authentication Setup

#### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create OAuth 2.0 credentials
3. Add redirect URI: `http://localhost:3000/api/auth/social/google/callback`

#### GitHub OAuth
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Create new OAuth App
3. Set callback URL: `http://localhost:3000/api/auth/social/github/callback`

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run e2e tests
npm run test:e2e
```

## 🚀 Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

### Docker

```bash
# Build image
docker build -t nextjs-auth .

# Run container
docker run -p 3000:3000 nextjs-auth
```

## 🔒 Security Features

- **Password Hashing** - bcrypt with configurable salt rounds
- **JWT Security** - Short-lived access tokens with refresh tokens
- **Rate Limiting** - Protection against brute force attacks
- **Input Validation** - Comprehensive data validation
- **CSRF Protection** - Cross-site request forgery prevention
- **Security Headers** - HSTS, CSP, and other security headers

## 📖 API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset
- `GET /api/auth/verify-email` - Email verification

### Social Authentication

- `GET /api/auth/social/[provider]` - Initiate social login
- `GET /api/auth/social/[provider]/callback` - Handle callback

Supported providers: `google`, `facebook`, `github`, `twitter`, `linkedin`, `discord`

### User Management

- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `POST /api/user/change-password` - Change password
- `DELETE /api/user/account` - Delete account

## 🎨 Frontend Components

```typescript
import { LoginForm, RegisterForm, SocialLoginGroup } from '@/components/auth';
import { ProtectedRoute, useAuth } from '@/lib/auth';

// Authentication forms
<LoginForm onSuccess={(user) => console.log('Logged in:', user)} />
<RegisterForm onSuccess={(user) => console.log('Registered:', user)} />

// Social login
<SocialLoginGroup providers={['google', 'github']} />

// Protected routes
<ProtectedRoute>
  <DashboardContent />
</ProtectedRoute>

// Auth hook
const { user, isAuthenticated, logout } = useAuth();
```

## 🐛 Troubleshooting

### Common Issues

**Database Connection**
```bash
npm run db:check
```

**Email Delivery**
```bash
npm run test:email
```

**Authentication Issues**
```bash
npm run test:jwt
```

### Debug Mode

```env
DEBUG=true
LOG_LEVEL=debug
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - React framework
- [Prisma](https://prisma.io/) - Database toolkit
- [Tailwind CSS](https://tailwindcss.com/) - CSS framework
- [TypeScript](https://typescriptlang.org/) - Type safety

## 📞 Support

- 📧 Email: support@yourapp.com
- 💬 Discord: [Join our community](https://discord.gg/yourserver)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/nextjs-auth-template/issues)

---

**Happy coding! 🚀**
