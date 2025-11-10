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
ACTIVEPIECES_URL=http://localhost:3000
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

#### Option A: Direct Token Pass (Recommended for Seamless Login)
```javascript
// In your authentication handler after Supabase login
const ActivePiecesSSO = require('./services/activepieces-sso');

async function handlePostLogin(supabaseUser) {
  try {
    const apSSO = new ActivePiecesSSO();

    // Authenticate with ActivePieces
    const apAuth = await apSSO.authenticateUser(supabaseUser);

    // OPTION A: Direct redirect with token (recommended)
    // This will automatically log the user in and redirect to flows
    window.location.href = apSSO.getActivePiecesUrl(apAuth.token, apAuth.projectId);

    return apAuth;
  } catch (error) {
    console.error('ActivePieces SSO failed:', error);
    // Handle gracefully - Score should work even if AP is down
  }
}
```

#### Option B: Store Token for Later Use (for API calls)
```javascript
async function handlePostLogin(supabaseUser) {
  try {
    const apSSO = new ActivePiecesSSO();

    // Authenticate with ActivePieces
    const apAuth = await apSSO.authenticateUser(supabaseUser);

    // Store tokens for API usage
    sessionStorage.setItem('activepieces_token', apAuth.token);
    sessionStorage.setItem('activepieces_project_id', apAuth.projectId);

    // Use tokens for API calls without redirecting
    const apClient = new ActivePiecesClient(apAuth.token, apAuth.projectId);
    const flows = await apClient.getFlows();

    return apAuth;
  } catch (error) {
    console.error('ActivePieces SSO failed:', error);
  }
}
```

#### Option C: Manual Browser Console Login (for Testing)
```javascript
// After getting the token from SSO, provide this to the user:
console.log(`
To login to ActivePieces, open http://localhost:4200 and run this in the console:
localStorage.setItem('token', '${apAuth.token}');
window.location.href = '/flows';
`);
```

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

### 6. **Token Storage Strategy (Recommended)**

Store the ActivePieces token in Supabase for persistence and easy access:

#### Option 1: Store in User Metadata (Simple)
```javascript
// After successful SSO authentication
async function storeAPTokenInSupabase(apAuth) {
  const { data, error } = await supabase.auth.updateUser({
    data: {
      activepieces_token: apAuth.token,
      activepieces_project_id: apAuth.projectId,
      activepieces_token_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }
  });
  return { data, error };
}
```

#### Option 2: Store in Separate Table (Better for Security)
```sql
-- Create table in Supabase
CREATE TABLE user_activepieces_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ap_token TEXT NOT NULL,
  ap_project_id TEXT NOT NULL,
  ap_user_id TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_activepieces_tokens ENABLE ROW LEVEL SECURITY;

-- Create policy for users to access their own tokens
CREATE POLICY "Users can manage their own tokens" ON user_activepieces_tokens
  FOR ALL USING (auth.uid() = user_id);
```

```javascript
// Store token in database
async function storeAPToken(userId, apAuth) {
  const { data, error } = await supabase
    .from('user_activepieces_tokens')
    .upsert({
      user_id: userId,
      ap_token: apAuth.token,
      ap_project_id: apAuth.projectId,
      ap_user_id: apAuth.userId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      updated_at: new Date()
    }, {
      onConflict: 'user_id'
    });
  return { data, error };
}

// Retrieve token
async function getAPToken(userId) {
  const { data, error } = await supabase
    .from('user_activepieces_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (data && new Date(data.expires_at) > new Date()) {
    return data.ap_token;
  }

  // Token expired or not found, need to refresh
  return null;
}
```

### 7. **Complete Authentication Flow with Token Storage**

```javascript
// Complete implementation in Score
class ActivePiecesIntegration {
  constructor(supabase) {
    this.supabase = supabase;
    this.apSSO = new ActivePiecesSSO();
  }

  async authenticateUser(user) {
    try {
      // Check for existing valid token
      const existingToken = await this.getStoredToken(user.id);
      if (existingToken) {
        return {
          token: existingToken.ap_token,
          projectId: existingToken.ap_project_id,
          cached: true
        };
      }

      // No valid token, perform SSO
      const apAuth = await this.apSSO.authenticateUser(user);

      // Store the new token
      await this.storeToken(user.id, apAuth);

      return {
        ...apAuth,
        cached: false
      };
    } catch (error) {
      console.error('ActivePieces authentication failed:', error);
      throw error;
    }
  }

  async getStoredToken(userId) {
    const { data } = await this.supabase
      .from('user_activepieces_tokens')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (data && new Date(data.expires_at) > new Date()) {
      return data;
    }
    return null;
  }

  async storeToken(userId, apAuth) {
    return await this.supabase
      .from('user_activepieces_tokens')
      .upsert({
        user_id: userId,
        ap_token: apAuth.token,
        ap_project_id: apAuth.projectId,
        ap_user_id: apAuth.userId,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        updated_at: new Date()
      }, {
        onConflict: 'user_id'
      });
  }

  async refreshToken(user) {
    const apAuth = await this.apSSO.authenticateUser(user);
    await this.storeToken(user.id, apAuth);
    return apAuth;
  }
}

// Usage in your auth flow
async function handlePostLogin(supabaseUser) {
  const apIntegration = new ActivePiecesIntegration(supabase);

  try {
    const apAuth = await apIntegration.authenticateUser(supabaseUser);

    if (apAuth.cached) {
      console.log('Using cached ActivePieces token');
    } else {
      console.log('New ActivePieces token generated');
    }

    // Option 1: Redirect to ActivePieces
    window.location.href = `http://localhost:4200/sso-callback.html?token=${apAuth.token}&projectId=${apAuth.projectId}`;

    // Option 2: Store for API usage
    sessionStorage.setItem('ap_token', apAuth.token);

    return apAuth;
  } catch (error) {
    // Handle error - Score should continue working
    console.error('ActivePieces integration error:', error);
  }
}
```

### 8. **Handle Token Refresh**

Since tokens expire after 7 days, implement automatic refresh:

```javascript
async function ensureValidAPToken(user) {
  const apIntegration = new ActivePiecesIntegration(supabase);

  // This will return cached token if valid, or refresh if expired
  return await apIntegration.authenticateUser(user);
}

// Middleware to check token before AP API calls
async function makeAPRequest(endpoint, options = {}) {
  const user = await supabase.auth.getUser();
  const apAuth = await ensureValidAPToken(user.data.user);

  return fetch(`http://localhost:3000/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apAuth.token}`,
      ...options.headers
    }
  });
}
```

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

## Next Steps

### Score Side
1. [ ] Implement SSO service
2. [ ] Add to authentication flow
3. [ ] Test with real Supabase users
4. [ ] Add error handling and retry logic
5. [ ] Implement token refresh mechanism
6. [ ] Add monitoring/logging

### ActivePieces Side (Complete)
1. [x] Add SCORE provider
2. [x] Create JWT validation service
3. [x] Implement SSO endpoint
4. [x] Test compilation
5. [x] Document implementation

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