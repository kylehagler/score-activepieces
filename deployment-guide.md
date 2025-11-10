# ActivePieces Deployment Guide - Digital Ocean

## Prerequisites

### 1. Digital Ocean Droplet Requirements
- **Recommended Size**: At least 2GB RAM (4GB recommended for production)
- **OS**: Ubuntu 22.04 LTS
- **Storage**: 25GB minimum
- **Region**: Choose closest to your users

### 2. Domain Setup (Optional but Recommended)
- Point a domain/subdomain to your droplet IP (e.g., `activepieces.yourdomain.com`)
- Configure DNS A record pointing to droplet IP

## Step 1: Create Digital Ocean Droplet

1. Log into Digital Ocean
2. Create Droplet:
   - **Choose Image**: Ubuntu 22.04 LTS
   - **Choose Plan**: Basic
   - **CPU Options**: Regular (SSD)
   - **Size**: $12/month (2GB/1CPU) minimum, $24/month (4GB/2CPU) recommended
   - **Add SSH Key**: Add your public SSH key
   - **Finalize**: Give it a hostname like `activepieces-prod`

## Step 2: Initial Server Setup

```bash
# SSH into your droplet
ssh root@your_droplet_ip

# Update system
apt update && apt upgrade -y

# Install required packages
apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx ufw

# Enable Docker
systemctl start docker
systemctl enable docker

# Add swap space (recommended for 2GB droplets)
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab

# Configure firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

## Step 3: Deploy ActivePieces with Docker Compose

### Option A: Using Pre-built Images (Recommended for Production)

```bash
# Create directory for ActivePieces
mkdir -p /opt/activepieces
cd /opt/activepieces

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:14.4
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${AP_POSTGRES_DATABASE}
      POSTGRES_USER: ${AP_POSTGRES_USERNAME}
      POSTGRES_PASSWORD: ${AP_POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - activepieces

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - activepieces

  activepieces:
    image: activepieces/activepieces:latest
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    ports:
      - "8080:80"
    environment:
      # Core Configuration
      AP_ENGINE_EXECUTABLE_PATH: dist/packages/engine/main.js
      AP_ENVIRONMENT: production
      AP_FRONTEND_URL: ${AP_FRONTEND_URL}
      AP_WEBHOOK_TIMEOUT_SECONDS: 30
      AP_TRIGGER_DEFAULT_POLL_INTERVAL: 5
      AP_EXECUTION_MODE: UNSANDBOXED
      AP_FLOW_TIMEOUT_SECONDS: 600

      # Database
      AP_DB_TYPE: postgres
      AP_POSTGRES_HOST: postgres
      AP_POSTGRES_PORT: 5432
      AP_POSTGRES_DATABASE: ${AP_POSTGRES_DATABASE}
      AP_POSTGRES_USERNAME: ${AP_POSTGRES_USERNAME}
      AP_POSTGRES_PASSWORD: ${AP_POSTGRES_PASSWORD}

      # Redis
      AP_REDIS_HOST: redis
      AP_REDIS_PORT: 6379

      # Security Keys
      AP_JWT_SECRET: ${AP_JWT_SECRET}
      AP_ENCRYPTION_KEY: ${AP_ENCRYPTION_KEY}
      AP_API_KEY: ${AP_API_KEY}

      # SSO Configuration
      AP_SCORE_JWT_SECRET: ${AP_SCORE_JWT_SECRET}

      # Optional
      AP_TELEMETRY_ENABLED: false
      AP_TEMPLATES_SOURCE_URL: "https://cloud.activepieces.com/api/v1/flow-templates"
    volumes:
      - activepieces_data:/app/dist/packages/server/api/.activepieces
    networks:
      - activepieces

volumes:
  postgres_data:
  redis_data:
  activepieces_data:

networks:
  activepieces:
    driver: bridge
EOF
```

### Option B: Building from Your Custom Code

```bash
# Clone your repository with SSO changes
cd /opt
git clone https://github.com/yourusername/activepieces.git
cd activepieces

# Create production docker-compose
cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:14.4
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${AP_POSTGRES_DATABASE}
      POSTGRES_USER: ${AP_POSTGRES_USERNAME}
      POSTGRES_PASSWORD: ${AP_POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - activepieces

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks:
      - activepieces

  activepieces:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    ports:
      - "8080:80"
    env_file:
      - .env.production
    volumes:
      - activepieces_data:/app/dist/packages/server/api/.activepieces
    networks:
      - activepieces

volumes:
  postgres_data:
  redis_data:
  activepieces_data:

networks:
  activepieces:
    driver: bridge
EOF
```

## Step 4: Create Production Environment File

```bash
# Generate secure secrets
generate_secret() {
  openssl rand -hex 32
}

# Create .env file (for Option A) or .env.production (for Option B)
cat > .env << EOF
# Frontend URL (change to your domain)
AP_FRONTEND_URL=https://activepieces.yourdomain.com

# Database Configuration
AP_POSTGRES_DATABASE=activepieces
AP_POSTGRES_USERNAME=activepieces
AP_POSTGRES_PASSWORD=$(generate_secret)

# Security Keys (generate new ones for production!)
AP_JWT_SECRET=$(generate_secret)
AP_ENCRYPTION_KEY=$(openssl rand -hex 16)
AP_API_KEY=$(generate_secret)

# SSO Integration with Score
AP_SCORE_JWT_SECRET=bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55

# Optional Email Configuration
# AP_SMTP_HOST=smtp.gmail.com
# AP_SMTP_PORT=587
# AP_SMTP_USERNAME=your-email@gmail.com
# AP_SMTP_PASSWORD=your-app-password
# AP_SMTP_SENDER_EMAIL=your-email@gmail.com
# AP_SMTP_SENDER_NAME=ActivePieces
EOF

# Secure the file
chmod 600 .env
```

## Step 5: Configure Nginx Reverse Proxy

```bash
# Create Nginx configuration
cat > /etc/nginx/sites-available/activepieces << 'EOF'
server {
    listen 80;
    server_name activepieces.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name activepieces.yourdomain.com;

    # SSL certificates (will be added by certbot)
    # ssl_certificate /etc/letsencrypt/live/activepieces.yourdomain.com/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/activepieces.yourdomain.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy settings
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
    }

    # WebSocket support
    location /socket.io/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable the site
ln -s /etc/nginx/sites-available/activepieces /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

## Step 6: Setup SSL with Let's Encrypt

```bash
# Replace with your actual domain
certbot --nginx -d activepieces.yourdomain.com

# Auto-renewal is set up automatically
# Test renewal
certbot renew --dry-run
```

## Step 7: Start ActivePieces

### For Option A (Pre-built Images):
```bash
cd /opt/activepieces
docker-compose up -d

# Check logs
docker-compose logs -f
```

### For Option B (Building from Source):
```bash
cd /opt/activepieces

# Build the application
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f
```

## Step 8: Create Systemd Service (Optional but Recommended)

```bash
# Create systemd service for auto-start
cat > /etc/systemd/system/activepieces.service << 'EOF'
[Unit]
Description=ActivePieces
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/activepieces
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl daemon-reload
systemctl enable activepieces
systemctl start activepieces
```

## Step 9: Configure SSO Callback

Since we added SSO support, make sure the callback page is accessible:

1. The `sso-callback.html` is already included in the React build
2. Update your Score application to use the production URL:
   ```javascript
   // In Score
   const ACTIVEPIECES_URL = 'https://activepieces.yourdomain.com';
   const ACTIVEPIECES_API_URL = 'https://activepieces.yourdomain.com';
   ```

## Step 10: Health Checks and Monitoring

### Create health check script:
```bash
cat > /opt/activepieces/health_check.sh << 'EOF'
#!/bin/bash

# Check if ActivePieces is responding
if curl -f http://localhost:8080/api/v1/flags 2>/dev/null; then
    echo "ActivePieces is healthy"
else
    echo "ActivePieces is not responding"
    # Restart if needed
    cd /opt/activepieces && docker-compose restart
fi
EOF

chmod +x /opt/activepieces/health_check.sh

# Add to crontab for monitoring
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/activepieces/health_check.sh >> /var/log/activepieces-health.log 2>&1") | crontab -
```

## Step 11: Backup Strategy

```bash
# Create backup script
cat > /opt/activepieces/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/backups/activepieces"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
docker exec activepieces_postgres_1 pg_dump -U activepieces activepieces > $BACKUP_DIR/db_backup_$DATE.sql

# Backup volumes
docker run --rm -v activepieces_activepieces_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/data_backup_$DATE.tar.gz -C /data .

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/activepieces/backup.sh

# Add to crontab for daily backups
(crontab -l 2>/dev/null; echo "0 2 * * * /opt/activepieces/backup.sh >> /var/log/activepieces-backup.log 2>&1") | crontab -
```

## Step 12: Security Hardening

```bash
# 1. Disable root login
sed -i 's/PermitRootLogin yes/PermitRootLogin no/g' /etc/ssh/sshd_config
systemctl restart sshd

# 2. Create non-root user for management
adduser activepieces_admin
usermod -aG sudo activepieces_admin
usermod -aG docker activepieces_admin

# 3. Setup fail2ban
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# 4. Enable automatic security updates
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

## Verification Steps

1. **Check services are running:**
   ```bash
   docker-compose ps
   ```

2. **Test the application:**
   - Navigate to https://activepieces.yourdomain.com
   - Try logging in with SSO
   - Create a test flow

3. **Check logs for errors:**
   ```bash
   docker-compose logs activepieces
   docker-compose logs postgres
   docker-compose logs redis
   ```

4. **Monitor resource usage:**
   ```bash
   docker stats
   htop
   ```

## Troubleshooting

### Issue: Out of Memory
```bash
# Increase swap
fallocate -l 4G /swapfile
mkswap /swapfile
swapon /swapfile
```

### Issue: Database Connection Failed
```bash
# Check postgres logs
docker-compose logs postgres

# Restart services
docker-compose down
docker-compose up -d
```

### Issue: SSO Not Working
1. Verify `AP_SCORE_JWT_SECRET` matches in both Score and ActivePieces
2. Check CORS settings if Score is on different domain
3. Verify the callback URL is accessible

### Issue: Flows Not Executing
```bash
# Check worker logs
docker-compose logs activepieces | grep -i worker

# Restart ActivePieces
docker-compose restart activepieces
```

## Post-Deployment Tasks

1. **Update Score Application:**
   ```javascript
   // Update URLs to production
   const ACTIVEPIECES_URL = 'https://activepieces.yourdomain.com';
   const ACTIVEPIECES_JWT_SECRET = 'your-production-secret';
   ```

2. **Test SSO Flow:**
   - Login to Score
   - Verify automatic SSO to ActivePieces
   - Check user creation and project isolation

3. **Configure Email (if needed):**
   - Add SMTP settings to .env file
   - Restart ActivePieces

4. **Set up monitoring:**
   - Consider using tools like Datadog, New Relic, or Uptime Robot
   - Monitor disk space, memory, and CPU usage

## Maintenance Commands

```bash
# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Update ActivePieces (for Option A)
docker-compose pull
docker-compose up -d

# Database backup
docker exec activepieces_postgres_1 pg_dump -U activepieces activepieces > backup.sql

# Restore database
docker exec -i activepieces_postgres_1 psql -U activepieces activepieces < backup.sql

# Clean up Docker
docker system prune -a
```

## Cost Estimation

- **Digital Ocean Droplet**: $12-24/month
- **Domain (optional)**: $10-15/year
- **Backups**: $2.40/month (20% of droplet cost)
- **Total**: ~$15-30/month

## Next Steps

1. Set up monitoring and alerting
2. Configure automated backups
3. Set up a staging environment for testing updates
4. Document your specific configuration changes
5. Create runbooks for common operations

---

Remember to:
- Keep your secrets secure and never commit them to git
- Regularly update your system and Docker images
- Monitor logs for any suspicious activity
- Test your backup restoration process
- Document any customizations you make