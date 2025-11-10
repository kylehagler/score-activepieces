# Quick Deployment Guide for ActivePieces with SSO

## Prerequisites

1. **Make GitHub Repository Public** (temporarily)
   - Go to: https://github.com/kylehagler/score-activepieces/settings
   - Scroll to "Danger Zone" at bottom
   - Click "Change visibility" → "Make public"
   - You can make it private again after deployment

2. **Configure DNS** (if using custom domain)
   - Go to your DNS provider (Vercel for score.insure)
   - Add an A record:
     - Type: `A`
     - Name: `flows` (for flows.score.insure)
     - Value: `165.227.213.9`
     - TTL: `300` (or Auto)
   - Wait 5-10 minutes for DNS propagation

## Deployment Steps

### Step 1: Run Deployment Script

```bash
cd /Users/kylehagler/Sites/activepieces
./deploy-simple.sh 165.227.213.9 flows.score.insure
```

The script will:
- ✅ Update system packages
- ✅ Install Node.js 20.x (LTS) - fixes deprecation warning
- ✅ Install Docker, Nginx, and dependencies
- ✅ Install pnpm (required for ActivePieces)
- ✅ Set up 4GB swap space
- ✅ Configure firewall
- ✅ Clone your repository
- ✅ Generate secure secrets
- ✅ Build the application (takes 10-15 minutes)
- ✅ Configure Nginx reverse proxy
- ✅ Set up SSL with Let's Encrypt
- ✅ Start all services

### Step 2: Wait for Build

The build process takes **10-15 minutes**. The script will show progress.

### Step 3: Verify Deployment

After completion, test:

```bash
# Check if services are running
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml ps'

# View logs
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml logs -f activepieces'
```

### Step 4: Test in Browser

Open: https://flows.score.insure

You should see the ActivePieces login page.

### Step 5: Test SSO Endpoint

```javascript
// In browser console on Score app:
const response = await fetch('https://flows.score.insure/api/v1/authentication/sso', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'YOUR_5_MINUTE_JWT_FROM_SCORE'
  })
});

const data = await response.json();
console.log('SSO Response:', data);

// If successful, you'll get: { token, projectId, userId }
// Store the returned token:
localStorage.setItem('token', data.token);
window.location.href = '/flows';
```

### Step 6: Make Repository Private Again

Once deployment is complete:
- Go to: https://github.com/kylehagler/score-activepieces/settings
- Scroll to "Danger Zone"
- Click "Change visibility" → "Make private"

## Important Credentials

The script will output these at the end. **SAVE THEM SECURELY:**

- JWT Secret: (auto-generated)
- Encryption Key: (auto-generated)
- API Key: (auto-generated)
- Database Password: (auto-generated)
- Score JWT Secret: `bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55`

These are also saved in `/opt/activepieces/.env.production` on the server.

## Useful Commands

```bash
# View application logs
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml logs -f activepieces'

# View all service logs (postgres, redis, activepieces)
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml logs -f'

# Check service status
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml ps'

# Restart services
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml restart'

# Update to latest code (after pushing to GitHub)
ssh root@165.227.213.9 '/opt/activepieces/update-activepieces.sh'

# Access database
ssh root@165.227.213.9 'docker exec -it activepieces_postgres_1 psql -U activepieces -d activepieces'
```

## Troubleshooting

### DNS Not Resolving

Check DNS propagation:
```bash
nslookup flows.score.insure
# Should return: 165.227.213.9
```

If not working, wait 5-10 minutes and try again.

### SSL Certificate Failed

If SSL setup fails:
```bash
# Try again manually
ssh root@165.227.213.9
certbot --nginx -d flows.score.insure --non-interactive --agree-tos --email your@email.com --redirect
```

### Services Not Starting

Check logs:
```bash
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml logs'
```

Common issues:
- Build failed: Check Node.js version (`node --version` should be 20.x)
- Port conflict: Make sure port 3000 is available
- Database issues: Check PostgreSQL logs

### Build Takes Too Long

The build process is CPU-intensive. If it's taking more than 20 minutes:
```bash
# Check build progress
ssh root@165.227.213.9 'cd /opt/activepieces && docker-compose -f docker-compose.prod.yml logs -f'
```

## Next Steps for Score Integration

Once deployment is complete, update your Score application:

1. **Update ActivePieces URLs** in Score config:
   ```typescript
   const ACTIVEPIECES_BASE_URL = 'https://flows.score.insure'
   const SSO_ENDPOINT = 'https://flows.score.insure/api/v1/authentication/sso'
   ```

2. **Implement ActivePiecesIntegration class** (see jwt-plan.md)

3. **Test the full flow**:
   - User logs into Score with Google
   - Score generates 5-minute JWT
   - Score calls SSO endpoint
   - User gets redirected to ActivePieces (already logged in)

## Architecture

```
User Browser
    ↓
flows.score.insure (DNS → 165.227.213.9)
    ↓
Nginx (Port 80/443) + Let's Encrypt SSL
    ↓
ActivePieces Container (Port 3000)
    ↓
PostgreSQL + Redis Containers
```

## SSO Flow

```
1. User logs into Score (Supabase + Google OAuth)
2. Score generates short-lived JWT (5 min)
   - Payload: { email, firstName, lastName, externalId }
   - Signed with: SCORE_JWT_SECRET
3. Score calls: POST /api/v1/authentication/sso
4. ActivePieces validates JWT and returns 7-day token
5. Score redirects to: /sso-callback.html?token=XXX
6. Browser stores token in localStorage
7. User is logged into ActivePieces
```

## Environment Variables on Server

Located at: `/opt/activepieces/.env.production`

Key variables for SSO:
- `AP_FRONTEND_URL=https://flows.score.insure`
- `AP_SCORE_JWT_SECRET=bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55`

## Updating Code

After making changes to your codebase:

```bash
# 1. Commit and push to GitHub
git add .
git commit -m "feat: update SSO integration"
git push

# 2. Update server
ssh root@165.227.213.9 '/opt/activepieces/update-activepieces.sh'
```

The update script will:
1. Pull latest changes from GitHub
2. Rebuild Docker containers
3. Restart services
4. Show status

---

**Ready to deploy?** Run:

```bash
./deploy-simple.sh 165.227.213.9 flows.score.insure
```
