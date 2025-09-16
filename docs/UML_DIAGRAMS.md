# UML Diagrams - Next.js Authentication Template

## 1. Class Diagram

### Core Authentication Classes

```mermaid
classDiagram
    class User {
        +string id
        +string email
        +string password
        +string firstName?
        +string lastName?
        +string fullName?
        +string role
        +boolean emailVerified
        +Date createdAt
        +Date updatedAt
        +UserProfile profile
        +SocialAccount[] socialAccounts
        +validatePassword(password: string) boolean
        +hashPassword(password: string) string
        +generateTokens() TokenPair
    }

    class UserProfile {
        +string userId
        +string avatar?
        +string bio?
        +string phone?
        +Date dateOfBirth?
        +string timezone?
        +string language
        +boolean twoFactorEnabled
    }

    class SocialAccount {
        +string id
        +string userId
        +string provider
        +string providerId
        +string accessToken?
        +string refreshToken?
        +Date expiresAt?
        +Object providerData
    }

    class AuthToken {
        +string id
        +string userId
        +string token
        +string type
        +Date expiresAt
        +boolean revoked
        +string deviceInfo?
    }

    class AuthSession {
        +string id
        +string userId
        +string deviceId
        +string ipAddress
        +string userAgent
        +Date lastActivity
        +boolean active
    }

    class Role {
        +string id
        +string name
        +string description
        +Permission[] permissions
    }

    class Permission {
        +string id
        +string name
        +string resource
        +string action
        +string description
    }

    User ||--|| UserProfile : has
    User ||--o{ SocialAccount : has
    User ||--o{ AuthToken : has
    User ||--o{ AuthSession : has
    User }o--|| Role : belongs to
    Role ||--o{ Permission : has
```

### Service Layer Classes

```mermaid
classDiagram
    class IAuthService {
        <<interface>>
        +register(userData: RegisterData) Promise~User~
        +login(credentials: LoginData) Promise~AuthResult~
        +logout(token: string) Promise~void~
        +refreshToken(refreshToken: string) Promise~TokenPair~
        +verifyEmail(token: string) Promise~boolean~
        +resetPassword(email: string) Promise~void~
        +changePassword(userId: string, oldPassword: string, newPassword: string) Promise~void~
    }

    class AuthService {
        -userRepository: IUserRepository
        -tokenService: ITokenService
        -emailService: IEmailService
        -hashService: IHashService
        +register(userData: RegisterData) Promise~User~
        +login(credentials: LoginData) Promise~AuthResult~
        +logout(token: string) Promise~void~
        +refreshToken(refreshToken: string) Promise~TokenPair~
        +verifyEmail(token: string) Promise~boolean~
        +resetPassword(email: string) Promise~void~
        +changePassword(userId: string, oldPassword: string, newPassword: string) Promise~void~
    }

    class IOAuthService {
        <<interface>>
        +getAuthUrl(provider: string, state: string) string
        +handleCallback(provider: string, code: string, state: string) Promise~AuthResult~
        +linkAccount(userId: string, provider: string, code: string) Promise~SocialAccount~
        +unlinkAccount(userId: string, provider: string) Promise~void~
    }

    class OAuthService {
        -providers: Map~string, IOAuthProvider~
        -userRepository: IUserRepository
        -tokenService: ITokenService
        +getAuthUrl(provider: string, state: string) string
        +handleCallback(provider: string, code: string, state: string) Promise~AuthResult~
        +linkAccount(userId: string, provider: string, code: string) Promise~SocialAccount~
        +unlinkAccount(userId: string, provider: string) Promise~void~
    }

    class ITokenService {
        <<interface>>
        +generateAccessToken(user: User) string
        +generateRefreshToken(user: User) string
        +verifyToken(token: string) TokenPayload
        +revokeToken(token: string) Promise~void~
        +cleanupExpiredTokens() Promise~void~
    }

    class TokenService {
        -jwtSecret: string
        -accessTokenExpiry: string
        -refreshTokenExpiry: string
        +generateAccessToken(user: User) string
        +generateRefreshToken(user: User) string
        +verifyToken(token: string) TokenPayload
        +revokeToken(token: string) Promise~void~
        +cleanupExpiredTokens() Promise~void~
    }

    IAuthService <|.. AuthService
    IOAuthService <|.. OAuthService
    ITokenService <|.. TokenService
```

### Repository Layer Classes

```mermaid
classDiagram
    class IUserRepository {
        <<interface>>
        +create(userData: CreateUserData) Promise~User~
        +findById(id: string) Promise~User~
        +findByEmail(email: string) Promise~User~
        +update(id: string, data: UpdateUserData) Promise~User~
        +delete(id: string) Promise~void~
        +findByProvider(provider: string, providerId: string) Promise~User~
    }

    class PostgreSQLUserRepository {
        -prisma: PrismaClient
        +create(userData: CreateUserData) Promise~User~
        +findById(id: string) Promise~User~
        +findByEmail(email: string) Promise~User~
        +update(id: string, data: UpdateUserData) Promise~User~
        +delete(id: string) Promise~void~
        +findByProvider(provider: string, providerId: string) Promise~User~
    }

    class MySQLUserRepository {
        -prisma: PrismaClient
        +create(userData: CreateUserData) Promise~User~
        +findById(id: string) Promise~User~
        +findByEmail(email: string) Promise~User~
        +update(id: string, data: UpdateUserData) Promise~User~
        +delete(id: string) Promise~void~
        +findByProvider(provider: string, providerId: string) Promise~User~
    }

    class MongoDBUserRepository {
        -mongoose: Mongoose
        +create(userData: CreateUserData) Promise~User~
        +findById(id: string) Promise~User~
        +findByEmail(email: string) Promise~User~
        +update(id: string, data: UpdateUserData) Promise~User~
        +delete(id: string) Promise~void~
        +findByProvider(provider: string, providerId: string) Promise~User~
    }

    class RepositoryFactory {
        +createUserRepository(dbType: DatabaseType) IUserRepository
        +createTokenRepository(dbType: DatabaseType) ITokenRepository
        +createSessionRepository(dbType: DatabaseType) ISessionRepository
    }

    IUserRepository <|.. PostgreSQLUserRepository
    IUserRepository <|.. MySQLUserRepository
    IUserRepository <|.. MongoDBUserRepository
    RepositoryFactory --> IUserRepository
```

## 2. Sequence Diagrams

### User Registration Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as API Route
    participant AuthService
    participant UserRepo as User Repository
    participant EmailService
    participant Database

    Client->>API: POST /api/auth/register
    API->>API: Validate input data
    API->>AuthService: register(userData)
    AuthService->>AuthService: Hash password
    AuthService->>UserRepo: create(userData)
    UserRepo->>Database: INSERT user
    Database-->>UserRepo: User created
    UserRepo-->>AuthService: User object
    AuthService->>EmailService: sendVerificationEmail(user)
    EmailService-->>AuthService: Email sent
    AuthService->>AuthService: Generate tokens
    AuthService-->>API: AuthResult
    API-->>Client: 201 Created + tokens
```

### User Login Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as API Route
    participant AuthService
    participant UserRepo as User Repository
    participant TokenService
    participant Database

    Client->>API: POST /api/auth/login
    API->>API: Validate credentials
    API->>AuthService: login(credentials)
    AuthService->>UserRepo: findByEmail(email)
    UserRepo->>Database: SELECT user
    Database-->>UserRepo: User data
    UserRepo-->>AuthService: User object
    AuthService->>AuthService: Verify password
    AuthService->>TokenService: generateTokens(user)
    TokenService-->>AuthService: Token pair
    AuthService->>UserRepo: updateLastLogin(userId)
    UserRepo->>Database: UPDATE user
    AuthService-->>API: AuthResult
    API-->>Client: 200 OK + tokens
```

### OAuth Authentication Flow

```mermaid
sequenceDiagram
    participant Client
    participant API as API Route
    participant OAuthService
    participant Provider as OAuth Provider
    participant UserRepo as User Repository
    participant Database

    Client->>API: GET /api/auth/oauth/google
    API->>OAuthService: getAuthUrl('google', state)
    OAuthService-->>API: Authorization URL
    API-->>Client: Redirect to OAuth provider
    Client->>Provider: Authorization request
    Provider-->>Client: Redirect with code
    Client->>API: GET /api/auth/oauth/callback?code=xxx
    API->>OAuthService: handleCallback('google', code, state)
    OAuthService->>Provider: Exchange code for tokens
    Provider-->>OAuthService: Access token + user info
    OAuthService->>UserRepo: findByProvider('google', providerId)
    UserRepo->>Database: SELECT user
    alt User exists
        Database-->>UserRepo: Existing user
        UserRepo-->>OAuthService: User object
    else User doesn't exist
        Database-->>UserRepo: null
        OAuthService->>UserRepo: create(userData)
        UserRepo->>Database: INSERT user
        Database-->>UserRepo: New user
        UserRepo-->>OAuthService: User object
    end
    OAuthService->>OAuthService: Generate tokens
    OAuthService-->>API: AuthResult
    API-->>Client: Redirect to app + tokens
```

## 3. Component Diagram

```mermaid
graph TB
    subgraph "Frontend Layer"
        A[Authentication Pages]
        B[Protected Routes]
        C[Auth Components]
        D[Auth Context]
    end

    subgraph "API Layer"
        E[Auth Controllers]
        F[Middleware Stack]
        G[Input Validation]
    end

    subgraph "Service Layer"
        H[Auth Service]
        I[OAuth Service]
        J[Token Service]
        K[Email Service]
        L[User Service]
    end

    subgraph "Data Access Layer"
        M[Repository Factory]
        N[User Repository]
        O[Token Repository]
        P[Session Repository]
    end

    subgraph "Database Layer"
        Q[(PostgreSQL)]
        R[(MySQL)]
        S[(MongoDB)]
    end

    subgraph "External Services"
        T[OAuth Providers]
        U[Email Providers]
        V[Redis Cache]
    end

    A --> E
    B --> F
    C --> D
    D --> E
    
    E --> H
    E --> I
    F --> G
    
    H --> J
    H --> K
    H --> L
    I --> T
    K --> U
    
    H --> M
    I --> M
    L --> M
    
    M --> N
    M --> O
    M --> P
    
    N --> Q
    N --> R
    N --> S
    
    F --> V
    J --> V
```

## 4. Deployment Diagram

```mermaid
graph TB
    subgraph "Client Tier"
        A[Web Browser]
        B[Mobile App]
    end

    subgraph "CDN"
        C[Static Assets]
    end

    subgraph "Load Balancer"
        D[Nginx/ALB]
    end

    subgraph "Application Tier"
        E[Next.js App 1]
        F[Next.js App 2]
        G[Next.js App N]
    end

    subgraph "Cache Layer"
        H[(Redis Cluster)]
    end

    subgraph "Database Tier"
        I[(Primary DB)]
        J[(Read Replica)]
    end

    subgraph "External Services"
        K[OAuth Providers]
        L[Email Service]
        M[Monitoring]
    end

    subgraph "Security"
        N[WAF]
        O[SSL/TLS]
    end

    A --> C
    A --> N
    B --> N
    N --> O
    O --> D
    
    D --> E
    D --> F
    D --> G
    
    E --> H
    F --> H
    G --> H
    
    E --> I
    F --> I
    G --> I
    
    E --> J
    F --> J
    G --> J
    
    E --> K
    F --> K
    G --> K
    
    E --> L
    F --> L
    G --> L
    
    E --> M
    F --> M
    G --> M
```

## 5. State Diagram - Authentication States

```mermaid
stateDiagram-v2
    [*] --> Unauthenticated
    
    Unauthenticated --> Registering : Register
    Unauthenticated --> LoggingIn : Login
    Unauthenticated --> OAuthFlow : Social Login
    
    Registering --> EmailVerification : Registration Success
    Registering --> Unauthenticated : Registration Failed
    
    LoggingIn --> Authenticated : Login Success
    LoggingIn --> Unauthenticated : Login Failed
    
    OAuthFlow --> Authenticated : OAuth Success
    OAuthFlow --> Unauthenticated : OAuth Failed
    
    EmailVerification --> Authenticated : Email Verified
    EmailVerification --> Unauthenticated : Verification Failed
    
    Authenticated --> TokenRefreshing : Token Expired
    Authenticated --> Unauthenticated : Logout
    Authenticated --> Unauthenticated : Token Invalid
    
    TokenRefreshing --> Authenticated : Refresh Success
    TokenRefreshing --> Unauthenticated : Refresh Failed
    
    Authenticated --> PasswordReset : Forgot Password
    PasswordReset --> Authenticated : Password Reset Success
    PasswordReset --> Unauthenticated : Reset Failed
```

## 6. Activity Diagram - Complete Authentication Flow

```mermaid
flowchart TD
    A[Start] --> B{User Action}
    
    B -->|Register| C[Validate Registration Data]
    B -->|Login| D[Validate Login Data]
    B -->|Social Login| E[Redirect to OAuth Provider]
    
    C --> F{Validation Success?}
    F -->|No| G[Return Validation Errors]
    F -->|Yes| H[Hash Password]
    H --> I[Create User Account]
    I --> J[Send Verification Email]
    J --> K[Generate Tokens]
    
    D --> L{Credentials Valid?}
    L -->|No| M[Return Authentication Error]
    L -->|Yes| N[Generate Tokens]
    
    E --> O[User Authorizes]
    O --> P[Receive Authorization Code]
    P --> Q[Exchange Code for User Info]
    Q --> R{User Exists?}
    R -->|No| S[Create New User]
    R -->|Yes| T[Update User Info]
    S --> U[Generate Tokens]
    T --> U
    
    K --> V[Return Success Response]
    N --> V
    U --> V
    
    G --> W[End]
    M --> W
    V --> W
```

These UML diagrams provide a comprehensive visual representation of the authentication system architecture, showing the relationships between components, the flow of operations, and the deployment structure.