# Postman SSO Testing Guide for ActivePieces

## Endpoint Details

### SSO Login Endpoint
- **URL**: `http://localhost:3000/v1/authentication/sso`
- **Method**: `POST`
- **Content-Type**: `application/json`

## Step 1: Generate a Test JWT Token

Run the provided script to generate a valid JWT token:

```bash
cd /Users/kylehagler/Sites/activepieces
node generate-test-jwt.js
```

This will output:
1. A JWT token (valid for 5 minutes)
2. The decoded payload
3. A complete JSON request body

## Step 2: Configure Postman

### Request Configuration

1. **Create New Request**
   - Method: `POST`
   - URL: `http://localhost:3000/v1/authentication/sso`

2. **Headers**
   ```
   Content-Type: application/json
   ```

3. **Body**
   - Select: `raw`
   - Format: `JSON`
   - Paste the token from the script output:
   ```json
   {
     "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   }
   ```

## Step 3: Test Scenarios

### Test 1: Successful First-Time Login (New User)

**Request Body**:
```json
{
  "token": "YOUR_GENERATED_TOKEN_HERE"
}
```

**Expected Response** (201 or 200):
```json
{
  "id": "user-uuid",
  "email": "testuser@example.com",
  "firstName": "Test",
  "lastName": "User",
  "verified": true,
  "platformId": "platform-uuid",
  "platformRole": "ADMIN",
  "status": "ACTIVE",
  "externalId": null,
  "trackEvents": true,
  "newsLetter": false,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "projectId": "project-uuid",
  "created": "2024-11-04T...",
  "updated": "2024-11-04T..."
}
```

**What Happens**:
- Creates new UserIdentity with provider='SCORE'
- Creates new User record
- Creates personal Platform (user as ADMIN)
- Creates default Project
- Returns authentication token valid for 7 days

### Test 2: Subsequent Login (Existing User)

Run the same request again with a fresh token for the same email.

**Expected Response** (200):
- Same structure as above
- Same user ID, platform ID, and project ID
- New authentication token

### Test 3: Invalid Token

**Request Body**:
```json
{
  "token": "invalid.jwt.token"
}
```

**Expected Response** (401):
```json
{
  "code": "INVALID_CREDENTIALS",
  "params": null,
  "message": "Invalid or expired SSO token"
}
```

### Test 4: Expired Token

Wait 5+ minutes after generating token, then send request.

**Expected Response** (401):
```json
{
  "code": "INVALID_CREDENTIALS",
  "params": null,
  "message": "Invalid or expired SSO token"
}
```

### Test 5: Missing Required Fields

Generate a token without required fields:

```javascript
// Modified generate script
const incompleteToken = jwt.sign({
  email: 'test@example.com'
  // Missing firstName, lastName, externalId
}, JWT_SECRET, { expiresIn: '5m' });
```

**Expected Response** (401):
```json
{
  "code": "INVALID_CREDENTIALS",
  "params": null,
  "message": "Invalid SSO token: missing required user information"
}
```

### Test 6: Invalid Email Format

```javascript
const badEmailToken = jwt.sign({
  email: 'not-an-email',
  firstName: 'Test',
  lastName: 'User',
  externalId: 'test-123'
}, JWT_SECRET, { expiresIn: '5m' });
```

**Expected Response** (401):
```json
{
  "code": "INVALID_CREDENTIALS",
  "params": null,
  "message": "Invalid SSO token: invalid email format"
}
```

## Step 4: Verify in Database

After successful login, verify the user was created:

```bash
# Connect to PostgreSQL
PGPASSWORD='A79Vm5D4p2VQHOp2gd5' psql -h localhost -p 5433 -U postgres -d activepieces

# Check user identity
SELECT * FROM user_identity WHERE email = 'testuser@example.com';
# Should show provider = 'SCORE'

# Check user record
SELECT * FROM "user" u
JOIN user_identity ui ON u."identityId" = ui.id
WHERE ui.email = 'testuser@example.com';

# Check project
SELECT * FROM project p
JOIN "user" u ON p."ownerId" = u.id
JOIN user_identity ui ON u."identityId" = ui.id
WHERE ui.email = 'testuser@example.com';
```

## Step 5: Use the Returned Token

After successful SSO login, use the returned token for API calls:

### Example: Get User's Flows

**Request**:
- Method: `GET`
- URL: `http://localhost:3000/v1/flows?projectId={projectId}`
- Headers:
  ```
  Authorization: Bearer {token_from_sso_response}
  ```

**Expected**: List of flows for the user's project

## Postman Collection

Save this as a Postman collection for easy testing:

```json
{
  "info": {
    "name": "ActivePieces SSO Testing",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "SSO Login",
      "request": {
        "method": "POST",
        "header": [
          {
            "key": "Content-Type",
            "value": "application/json"
          }
        ],
        "body": {
          "mode": "raw",
          "raw": "{\n  \"token\": \"PASTE_TOKEN_HERE\"\n}"
        },
        "url": {
          "raw": "http://localhost:3000/v1/authentication/sso",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["v1", "authentication", "sso"]
        }
      }
    },
    {
      "name": "Get Flows (After SSO)",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{activepieces_token}}"
          }
        ],
        "url": {
          "raw": "http://localhost:3000/v1/flows?projectId={{project_id}}",
          "protocol": "http",
          "host": ["localhost"],
          "port": "3000",
          "path": ["v1", "flows"],
          "query": [
            {
              "key": "projectId",
              "value": "{{project_id}}"
            }
          ]
        }
      }
    }
  ],
  "variable": [
    {
      "key": "activepieces_token",
      "value": ""
    },
    {
      "key": "project_id",
      "value": ""
    }
  ]
}
```

## Quick Test Commands

### Generate Token and Test with cURL

```bash
# Generate token
node generate-test-jwt.js

# Copy the token and use in curl (replace TOKEN_HERE)
curl -X POST http://localhost:3000/v1/authentication/sso \
  -H "Content-Type: application/json" \
  -d '{"token": "TOKEN_HERE"}' \
  | python -m json.tool
```

## Monitoring Logs

Watch the ActivePieces logs for debugging:

```bash
# In the terminal running npm run dev, you should see:
# [API] Successfully validated Score JWT token
# [API] Score SSO login successful
```

## Troubleshooting

1. **Port 3000 not responding**: Ensure ActivePieces is running (`npm run dev`)
2. **Token expired**: Generate a fresh token (they expire in 5 minutes)
3. **Invalid credentials**: Check that JWT_SECRET in generate script matches .env
4. **User already exists**: That's fine - it will just log them in

## Notes

- First login creates user as ADMIN of their personal platform
- Each user gets their own isolated project
- Tokens from SSO endpoint are valid for 7 days
- Email must be unique across the system