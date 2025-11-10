# JWT SSO Integration Plan: Score → ActivePieces

## Overview
This document outlines the JWT-based Single Sign-On (SSO) integration between the Score application (using Supabase/Google OAuth) and ActivePieces, enabling users logged into Score to automatically authenticate with ActivePieces.

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌──────────────┐
│    User     │────────▶│    Score    │────────▶│ ActivePieces │
└─────────────┘         └─────────────┘         └──────────────┘
                             │                          │
                             ▼                          ▼
                        ┌──────────┐            ┌──────────────┐
                        │ Supabase │            │  PostgreSQL  │
                        │  Google  │            │   Database   │
                        └──────────┘            └──────────────┘
```

## Authentication Flow

1. **User logs into Score** via Google OAuth through Supabase
2. **Score generates JWT** with user information (5-minute expiry)
3. **Score sends JWT** to ActivePieces SSO endpoint
4. **ActivePieces validates JWT** using shared secret
5. **ActivePieces creates/retrieves user** and generates NEW ActivePieces token (7-day expiry)
6. **User is logged into ActivePieces** with their own isolated project using the AP token

**Important**: There are TWO different tokens:
- **SSO JWT Token**: Short-lived (5 min), sent TO ActivePieces for authentication
- **ActivePieces Token**: Long-lived (7 days), returned FROM ActivePieces for session management

## What Has Been Implemented (ActivePieces Side) ✅

### 1. **Provider Configuration**
- Added `SCORE = 'SCORE'` to `UserIdentityProvider` enum
- Location: `packages/shared/src/lib/authentication/user-identity.ts`

### 2. **Environment Variables**
- Added `SCORE_JWT_SECRET` system property
- Configured in:
  - `packages/server/shared/src/lib/system-props.ts`
  - `.env` (with secure value: `bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55`)
  - `.env.example` (for documentation)
  - System validator in `packages/server/api/src/app/helper/system-validator.ts`

### 3. **JWT SSO Service**
- Created `packages/server/api/src/app/authentication/jwt-sso/jwt-sso.service.ts`
- Features:
  - JWT validation with shared secret
  - Required field validation (email, firstName, lastName, externalId)
  - Email format validation
  - Comprehensive error handling

### 4. **SSO Endpoint**
- Added `POST /v1/authentication/sso` endpoint
- Location: `packages/server/api/src/app/authentication/authentication.controller.ts`
- Accepts: `{ token: string }`
- Returns: `AuthenticationResponse` with JWT token and projectId

### 5. **Authentication Flow Integration**
- Leverages existing `federatedAuthn` method
- Automatically:
  - Creates UserIdentity if not exists
  - Creates User record for platform
  - Creates isolated project for new users
  - Generates JWT session token

### 6. **Security Features**
- Rate limiting on SSO endpoint
- JWT signature verification
- Auto-verification for SCORE provider users
- User isolation through project ownership

## What Needs to Be Done (Score Side) 📝

### 1. **Install Dependencies**
```bash
npm install jsonwebtoken
```

### 2. **Configure Environment**
Add to Score's environment configuration:
```env
# Production
ACTIVEPIECES_URL=https://flows.score.insure

# Development (if needed)
# ACTIVEPIECES_URL=http://localhost:3000

ACTIVEPIECES_JWT_SECRET=bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55
```

### 3. **Create SSO Service**
```javascript
// services/activepieces-sso.js
const jwt = require('jsonwebtoken');

class ActivePiecesSSO {
  constructor() {
    this.apiUrl = process.env.ACTIVEPIECES_URL;
    this.jwtSecret = process.env.ACTIVEPIECES_JWT_SECRET;
  }

  /**
   * Generate JWT token for ActivePieces SSO
   */
  generateSSOToken(user) {
    const payload = {
      email: user.email,
      firstName: user.user_metadata?.full_name?.split(' ')[0] || 'User',
      lastName: user.user_metadata?.full_name?.split(' ')[1] || '',
      externalId: user.id
    };

    return jwt.sign(payload, this.jwtSecret, {
      expiresIn: '5m', // Short expiration for security
      issuer: 'activepieces' // IMPORTANT: Must be 'activepieces', not 'score'
    });
  }

  /**
   * Authenticate user with ActivePieces
   */
  async authenticateUser(user) {
    const ssoToken = this.generateSSOToken(user);

    const response = await fetch(`${this.apiUrl}/v1/authentication/sso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: ssoToken })
    });

    if (!response.ok) {
      throw new Error(`ActivePieces SSO failed: ${response.statusText}`);
    }

    const authResponse = await response.json();
    return {
      token: authResponse.token,
      projectId: authResponse.projectId,
      userId: authResponse.id
    };
  }

  /**
   * Generate ActivePieces redirect URL with auth token
   */
  getActivePiecesUrl(token, projectId) {
    // Direct the user to a callback page that will handle the login
    const uiUrl = this.apiUrl.replace(':3000', ':4200'); // Convert API URL to UI URL
    return `${uiUrl}/sso-callback.html?token=${encodeURIComponent(token)}&projectId=${projectId}`;
  }
}

module.exports = ActivePiecesSSO;
```

### 4. **Integrate with Score Authentication Flow**

#### **Recommended Approach: "Flows" Button with Token Caching**

This is the optimal approach for users who stay logged into Score for extended periods. The ActivePieces token is cached in the database to avoid repeated SSO calls.

```javascript
// When user clicks "Flows" button in Score
async function openActivepieces() {
  const { data: { user } } = await supabase.auth.getUser();

  // Check for cached token first
  const { data: cachedToken } = await supabase
    .from('activepieces_tokens')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Use cached token if it exists and hasn't expired
  if (cachedToken && new Date(cachedToken.expires_at) > new Date()) {
    // Open ActivePieces with cached token (instant!)
    window.open(
      `https://flows.score.insure/sso-callback.html?token=${cachedToken.token}&projectId=${cachedToken.project_id}`,
      '_blank'
    );
    return;
  }

  // No valid token - perform SSO
  const apSSO = new ActivePiecesSSO();

  // Generate 5-minute Score JWT
  const scoreJWT = apSSO.generateSSOToken(user);

  // Exchange for 7-day ActivePieces token
  const response = await fetch('https://flows.score.insure/api/v1/authentication/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: scoreJWT })
  });

  const { token, projectId } = await response.json();

  // Cache the token
  await supabase
    .from('activepieces_tokens')
    .upsert({
      user_id: user.id,
      token: token,
      project_id: projectId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

  // Open ActivePieces with fresh token
  window.open(
    `https://flows.score.insure/sso-callback.html?token=${token}&projectId=${projectId}`,
    '_blank'
  );
}
```

**User Experience:**
- **First click**: ~200ms delay (SSO call) → opens ActivePieces
- **Subsequent clicks**: Instant (uses cached token)
- **After 7 days**: Automatically refreshes token on next click

#### Alternative: Simple Approach (No Caching)

If you don't want to manage token storage, you can generate a fresh token every time:

```javascript
// Simpler version - always perform SSO
async function openActivepieces() {
  const { data: { user } } = await supabase.auth.getUser();
  const apSSO = new ActivePiecesSSO();

  // Generate Score JWT
  const scoreJWT = apSSO.generateSSOToken(user);

  // Call SSO endpoint
  const response = await fetch('https://flows.score.insure/api/v1/authentication/sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: scoreJWT })
  });

  const { token, projectId } = await response.json();

  // Open ActivePieces
  window.open(
    `https://flows.score.insure/sso-callback.html?token=${token}&projectId=${projectId}`,
    '_blank'
  );
}
```

**Trade-offs:**
- ✅ Simpler implementation
- ✅ No database storage needed
- ❌ Slightly slower (~200ms per click)
- ❌ Generates more tokens

### 5. **Create SSO Callback Handler (Required for Direct Token Pass)**

Create a file at `packages/react-ui/public/sso-callback.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Logging in...</title>
    <style>
        body {
            font-family: sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #6366f1;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div>
        <div class="spinner"></div>
        <h2>Logging you in...</h2>
    </div>
    <script>
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const projectId = urlParams.get('projectId');

        if (token) {
            // Store token in localStorage (same key ActivePieces uses)
            localStorage.setItem('token', token);

            // Redirect to flows page
            setTimeout(() => {
                window.location.href = projectId ? `/projects/${projectId}/flows` : '/flows';
            }, 500);
        } else {
            document.body.innerHTML = '<h2>Error: No authentication token found</h2>';
        }
    </script>
</body>
</html>
```

### 6. **Create ActivePieces API Client**
```javascript
// services/activepieces-client.js
class ActivePiecesClient {
  constructor(token, projectId) {
    this.token = token;
    this.projectId = projectId;
    this.apiUrl = process.env.ACTIVEPIECES_URL;
  }

  async makeRequest(endpoint, options = {}) {
    const response = await fetch(`${this.apiUrl}/v1${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`ActivePieces API error: ${response.statusText}`);
    }

    return response.json();
  }

  // Example: Get flows
  async getFlows() {
    return this.makeRequest(`/flows?projectId=${this.projectId}`);
  }

  // Example: Create flow
  async createFlow(flowData) {
    return this.makeRequest('/flows', {
      method: 'POST',
      body: JSON.stringify({
        ...flowData,
        projectId: this.projectId
      })
    });
  }
}
```

### 6. **Database Setup for Token Caching (Recommended)**

Create a table in Supabase to cache ActivePieces tokens:

```sql
-- Create table in Supabase SQL editor
CREATE TABLE activepieces_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  project_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable Row Level Security
ALTER TABLE activepieces_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only view/manage their own tokens
CREATE POLICY "Users can view their own tokens"
  ON activepieces_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own tokens"
  ON activepieces_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own tokens"
  ON activepieces_tokens FOR UPDATE
  USING (auth.uid() = user_id);
```

**Why This Approach?**
- ✅ **Fast**: Instant login after first SSO (no repeated API calls)
- ✅ **Secure**: RLS ensures users can only access their own tokens
- ✅ **Automatic Refresh**: Tokens are refreshed automatically when expired
- ✅ **Simple**: No complex session management needed

### 7. **Understanding the Token Flow**

**Important: Two Different Tokens**

```
┌─────────────────────────────────────────────────────────────┐
│                      Token Lifecycle                         │
└─────────────────────────────────────────────────────────────┘

1. User clicks "Flows" in Score
   ↓
2. Score generates 5-minute JWT (Score Token)
   {
     email: "user@example.com",
     firstName: "John",
     lastName: "Doe",
     externalId: "score-user-123"
   }
   ↓
3. Score sends to: POST /api/v1/authentication/sso
   Body: { token: "5-minute-score-jwt" }
   ↓
4. ActivePieces validates and returns 7-day token:
   {
     token: "7-day-activepieces-jwt",  ← USE THIS!
     projectId: "abc123",
     userId: "xyz789"
   }
   ↓
5. Score caches the 7-day token in database
   ↓
6. User opens ActivePieces with 7-day token
   ↓
7. For next 7 days: Use cached token (instant login!)
```

**Key Points:**
- **Score JWT (5 min)**: Only used ONCE to call SSO endpoint
- **ActivePieces Token (7 days)**: Used for logging in and API calls
- **Never** send the ActivePieces token back to the SSO endpoint
- Cache the ActivePieces token to avoid repeated SSO calls

## Testing the Integration

### 1. **Test SSO Endpoint Directly**
```bash
# Generate test JWT (use Node.js REPL or script)
const jwt = require('jsonwebtoken');
const token = jwt.sign({
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  externalId: 'test-user-123'
}, 'bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55', {
  expiresIn: '5m',
  issuer: 'activepieces' // REQUIRED - must be 'activepieces'
});

# Test with curl
curl -X POST http://localhost:3000/v1/authentication/sso \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"$TOKEN\"}"
```

**Quick Test Script**: Run `node generate-test-jwt.js` to generate a valid token with all correct settings.

### 2. **Expected Response**
```json
{
  "id": "user-id",
  "email": "test@example.com",
  "firstName": "Test",
  "lastName": "User",
  "verified": true,
  "platformId": "platform-id",
  "platformRole": "MEMBER",
  "status": "ACTIVE",
  "token": "eyJhbGc...",
  "projectId": "project-id"
}
```

## Security Considerations

### ✅ Implemented
- JWT signature verification with shared secret
- Short token expiration (5 minutes recommended for SSO tokens)
- User email uniqueness validation
- Automatic user verification for SCORE provider
- Rate limiting on SSO endpoint
- User isolation through project ownership

### ⚠️ Important Notes
1. **Shared Secret**: Keep the JWT secret secure and rotate periodically
2. **HTTPS**: Always use HTTPS in production
3. **Token Storage**: Store ActivePieces tokens securely (httpOnly cookies preferred)
4. **Error Handling**: Handle SSO failures gracefully
5. **User Mapping**: Ensure consistent user IDs between systems

## Database Impact

### Automatic Creation
When a Score user authenticates for the first time:
1. **UserIdentity** record created (global)
2. **User** record created (platform-specific)
3. **Platform** created (if personal platform)
4. **Project** created (user's default project)

### User Identification
- Users are uniquely identified by email
- External ID from Score stored for reference
- Multiple platforms supported per user identity

## Monitoring & Debugging

### ActivePieces Logs
- Successful SSO: "Score SSO login successful"
- JWT validation errors logged with details
- User creation/retrieval logged

### Useful Queries
```sql
-- Find users created via Score SSO
SELECT * FROM user_identity WHERE provider = 'SCORE';

-- Check user's projects
SELECT p.* FROM project p
JOIN "user" u ON p."ownerId" = u.id
JOIN user_identity ui ON u."identityId" = ui.id
WHERE ui.email = 'user@example.com';
```

## Deployment Information

### Production URLs
- **ActivePieces**: https://flows.score.insure
- **SSO Endpoint**: `POST https://flows.score.insure/api/v1/authentication/sso`
- **SSO Callback**: https://flows.score.insure/sso-callback.html

### Server Details
- **Droplet IP**: 165.227.213.9
- **Domain**: flows.score.insure
- **SSL**: Let's Encrypt (auto-configured)
- **Environment Variables**: `/opt/activepieces/.env.production`

### Deployment Status
✅ ActivePieces deployed and running
✅ Custom SSO code integrated
✅ SSL certificate configured
✅ PostgreSQL database initialized
✅ SSO endpoint tested and working

## Next Steps

### Score Side Implementation
1. [ ] Create `activepieces_tokens` table in Supabase
2. [ ] Install `jsonwebtoken` dependency
3. [ ] Implement ActivePiecesSSO service
4. [ ] Add "Flows" button to Score UI
5. [ ] Implement `openActivepieces()` function with token caching
6. [ ] Test with real Score users
7. [ ] Add error handling for SSO failures
8. [ ] Monitor token expiration and refresh

### ActivePieces Side (Complete ✅)
1. [x] Add SCORE provider to authentication system
2. [x] Create JWT validation service
3. [x] Implement SSO endpoint at `/api/v1/authentication/sso`
4. [x] Deploy to production (flows.score.insure)
5. [x] Configure SSL with Let's Encrypt
6. [x] Test SSO endpoint with Postman
7. [x] Verify user creation and token generation
8. [x] Document implementation

## Support & Troubleshooting

### Common Issues

1. **"SSO is not configured properly"**
   - Ensure `AP_SCORE_JWT_SECRET` is set in `.env`
   - Restart ActivePieces after configuration

2. **"Invalid or expired SSO token"**
   - Check JWT expiration time
   - Verify shared secret matches
   - Ensure all required fields in JWT
   - Issuer MUST be `'activepieces'` not `'score'`

3. **User not created**
   - Check ActivePieces logs for errors
   - Verify email format is valid
   - Ensure database is accessible

4. **Redirected back to /sign-in after setting token**
   - Token may be expired (SSO tokens only last 5 minutes)
   - Use a fresh token from the SSO endpoint
   - The ActivePieces token (from SSO response) should be used, not the JWT you send to SSO
   - Make sure you're on the correct domain (localhost:4200)
   - Try refreshing the page after setting the token

### Contact
For issues with the ActivePieces SSO implementation, check:
- ActivePieces logs at startup
- PostgreSQL database for user records
- JWT token contents using jwt.io debugger