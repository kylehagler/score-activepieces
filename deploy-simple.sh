#!/bin/bash

# Simplified ActivePieces Custom Build Deployment Script
# This script assumes the GitHub repository is PUBLIC
# Usage: ./deploy-simple.sh <droplet-ip> <domain>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: $0 <droplet-ip> [domain]${NC}"
    echo "Example: $0 165.227.213.9 flows.score.insure"
    exit 1
fi

DROPLET_IP=$1
DOMAIN=${2:-$DROPLET_IP}
SSH_USER="root"
GIT_REPO="https://github.com/kylehagler/score-activepieces.git"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}ActivePieces Custom Build Deployment${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "Droplet IP: ${YELLOW}$DROPLET_IP${NC}"
echo -e "Domain: ${YELLOW}$DOMAIN${NC}"
echo -e "Repository: ${YELLOW}$GIT_REPO${NC}"
echo ""

# Function to execute commands on remote server with retry
remote_exec() {
    local max_attempts=3
    local attempt=1
    local timeout=60

    while [ $attempt -le $max_attempts ]; do
        echo -e "${NC}[Attempt $attempt/$max_attempts]${NC}"
        if ssh -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=no $SSH_USER@$DROPLET_IP "$1"; then
            return 0
        else
            local exit_code=$?
            if [ $attempt -lt $max_attempts ]; then
                echo -e "${YELLOW}Connection failed, retrying in 5 seconds...${NC}"
                sleep 5
                attempt=$((attempt + 1))
            else
                echo -e "${RED}Failed after $max_attempts attempts${NC}"
                return $exit_code
            fi
        fi
    done
}

# Function to copy files to remote server with retry
remote_copy() {
    local max_attempts=3
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        echo -e "${NC}[Copy attempt $attempt/$max_attempts]${NC}"
        if scp -o ConnectTimeout=10 -o ServerAliveInterval=5 -o StrictHostKeyChecking=no $1 $SSH_USER@$DROPLET_IP:$2; then
            return 0
        else
            local exit_code=$?
            if [ $attempt -lt $max_attempts ]; then
                echo -e "${YELLOW}Copy failed, retrying in 5 seconds...${NC}"
                sleep 5
                attempt=$((attempt + 1))
            else
                echo -e "${RED}Failed after $max_attempts attempts${NC}"
                return $exit_code
            fi
        fi
    done
}

echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
remote_exec "apt update && apt upgrade -y"

echo -e "${YELLOW}Step 2: Installing Node.js 20.x (LTS)...${NC}"
remote_exec "curl -fsSL https://deb.nodesource.com/setup_20.x | bash -"
remote_exec "apt install -y nodejs"
remote_exec "node --version"

echo -e "${YELLOW}Step 3: Installing Docker and dependencies...${NC}"
remote_exec "apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx ufw"
remote_exec "systemctl start docker && systemctl enable docker"

echo -e "${YELLOW}Step 4: Installing pnpm (required for ActivePieces build)...${NC}"
remote_exec "npm install -g pnpm"

echo -e "${YELLOW}Step 5: Setting up swap space (4GB)...${NC}"
remote_exec "if [ ! -f /swapfile ]; then fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi"

echo -e "${YELLOW}Step 6: Configuring firewall...${NC}"
remote_exec "ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable"

echo -e "${YELLOW}Step 7: Cloning your custom repository...${NC}"
echo -e "${RED}NOTE: Repository must be PUBLIC for this to work!${NC}"
echo -e "${RED}If private, make it public temporarily at: https://github.com/kylehagler/score-activepieces/settings${NC}"
read -p "Press enter when repository is public, or Ctrl+C to abort..."
remote_exec "rm -rf /opt/activepieces && git clone $GIT_REPO /opt/activepieces"

echo -e "${YELLOW}Step 8: Generating secure secrets...${NC}"
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
API_KEY=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 32)

# Keep the Score JWT secret from development
SCORE_JWT_SECRET="bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55"

echo -e "${YELLOW}Step 9: Creating production environment file...${NC}"
cat > /tmp/.env.production << EOF
# Production Environment Variables
AP_ENGINE_EXECUTABLE_PATH=dist/packages/engine/main.js
AP_ENVIRONMENT=production
AP_FRONTEND_URL=https://${DOMAIN}
AP_WEBHOOK_TIMEOUT_SECONDS=30
AP_TRIGGER_DEFAULT_POLL_INTERVAL=5
AP_EXECUTION_MODE=UNSANDBOXED
AP_FLOW_TIMEOUT_SECONDS=600

# Database Configuration
AP_DB_TYPE=postgres
AP_POSTGRES_HOST=postgres
AP_POSTGRES_PORT=5432
AP_POSTGRES_DATABASE=activepieces
AP_POSTGRES_USERNAME=activepieces
AP_POSTGRES_PASSWORD=${DB_PASSWORD}

# Redis Configuration
AP_REDIS_HOST=redis
AP_REDIS_PORT=6379

# Security Keys
AP_JWT_SECRET=${JWT_SECRET}
AP_ENCRYPTION_KEY=${ENCRYPTION_KEY}
AP_API_KEY=${API_KEY}

# SSO Configuration
AP_SCORE_JWT_SECRET=${SCORE_JWT_SECRET}

# Other Settings
AP_TELEMETRY_ENABLED=false
AP_TEMPLATES_SOURCE_URL=https://cloud.activepieces.com/api/v1/flow-templates
EOF

remote_copy /tmp/.env.production /opt/activepieces/.env.production
remote_exec "chmod 600 /opt/activepieces/.env.production"

echo -e "${YELLOW}Step 10: Creating production docker-compose.yml...${NC}"
cat > /tmp/docker-compose.prod.yml << EOF
version: '3.8'

services:
  postgres:
    image: postgres:14.4
    restart: unless-stopped
    environment:
      POSTGRES_DB: activepieces
      POSTGRES_USER: activepieces
      POSTGRES_PASSWORD: ${DB_PASSWORD}
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
      - "3000:3000"
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

remote_copy /tmp/docker-compose.prod.yml /opt/activepieces/docker-compose.prod.yml

echo -e "${YELLOW}Step 11: Building the application (this will take 10-15 minutes)...${NC}"
remote_exec "cd /opt/activepieces && docker compose -f docker-compose.prod.yml build --no-cache"

echo -e "${YELLOW}Step 12: Configuring Nginx...${NC}"
cat > /tmp/nginx-activepieces << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 50M;
    }

    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

remote_copy /tmp/nginx-activepieces /tmp/nginx-activepieces-temp
remote_exec "mv /tmp/nginx-activepieces-temp /etc/nginx/sites-available/activepieces"
remote_exec "ln -sf /etc/nginx/sites-available/activepieces /etc/nginx/sites-enabled/"
remote_exec "rm -f /etc/nginx/sites-enabled/default"
remote_exec "nginx -t && systemctl reload nginx"

echo -e "${YELLOW}Step 13: Starting ActivePieces...${NC}"
remote_exec "cd /opt/activepieces && docker compose -f docker-compose.prod.yml up -d"

echo -e "${YELLOW}Step 14: Waiting for services to start...${NC}"
sleep 15
remote_exec "cd /opt/activepieces && docker compose -f docker-compose.prod.yml ps"

echo -e "${YELLOW}Step 15: Setting up SSL (if domain provided)...${NC}"
if [ "$DOMAIN" != "$DROPLET_IP" ]; then
    echo -e "${GREEN}Setting up Let's Encrypt SSL for ${DOMAIN}...${NC}"
    echo -e "${RED}Note: Make sure your domain DNS is pointing to ${DROPLET_IP}${NC}"
    echo -e "${YELLOW}Checking DNS resolution...${NC}"
    nslookup $DOMAIN || echo "DNS not resolved yet"
    read -p "Press enter to continue with SSL setup, or Ctrl+C to skip..."
    remote_exec "certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} --redirect"
fi

echo -e "${YELLOW}Step 16: Creating update script...${NC}"
cat > /tmp/update-activepieces.sh << 'EOF'
#!/bin/bash
set -e
cd /opt/activepieces
echo "Pulling latest changes..."
git pull
echo "Rebuilding containers..."
docker compose -f docker-compose.prod.yml build --no-cache
echo "Restarting services..."
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
echo "Update completed at $(date)"
echo "Checking status..."
sleep 10
docker compose -f docker-compose.prod.yml ps
EOF

remote_copy /tmp/update-activepieces.sh /opt/activepieces/update-activepieces.sh
remote_exec "chmod +x /opt/activepieces/update-activepieces.sh"

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Custom Build Deployment Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "${GREEN}Your custom ActivePieces with SSO is running at:${NC}"
if [ "$DOMAIN" != "$DROPLET_IP" ]; then
    echo -e "${YELLOW}https://${DOMAIN}${NC} (if SSL was configured)"
    echo -e "${YELLOW}http://${DOMAIN}${NC} (if SSL was skipped)"
else
    echo -e "${YELLOW}http://${DROPLET_IP}${NC}"
fi
echo ""
echo -e "${RED}IMPORTANT: Save these credentials:${NC}"
echo -e "JWT Secret: ${JWT_SECRET}"
echo -e "Encryption Key: ${ENCRYPTION_KEY}"
echo -e "API Key: ${API_KEY}"
echo -e "Database Password: ${DB_PASSWORD}"
echo -e "Score JWT Secret: ${SCORE_JWT_SECRET}"
echo ""
echo -e "${GREEN}These have been saved to: /opt/activepieces/.env.production${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "View logs: ssh $SSH_USER@$DROPLET_IP 'cd /opt/activepieces && docker compose -f docker-compose.prod.yml logs -f activepieces'"
echo "View all logs: ssh $SSH_USER@$DROPLET_IP 'cd /opt/activepieces && docker compose -f docker-compose.prod.yml logs -f'"
echo "Update code: ssh $SSH_USER@$DROPLET_IP '/opt/activepieces/update-activepieces.sh'"
echo "Restart: ssh $SSH_USER@$DROPLET_IP 'cd /opt/activepieces && docker compose -f docker-compose.prod.yml restart'"
echo "Check status: ssh $SSH_USER@$DROPLET_IP 'cd /opt/activepieces && docker compose -f docker-compose.prod.yml ps'"
echo ""
echo -e "${GREEN}SSO Endpoint:${NC}"
if [ "$DOMAIN" != "$DROPLET_IP" ]; then
    echo -e "POST https://${DOMAIN}/api/v1/authentication/sso"
else
    echo -e "POST http://${DROPLET_IP}/api/v1/authentication/sso"
fi
echo ""
echo -e "${GREEN}To update in the future:${NC}"
echo "1. Push changes to GitHub"
echo "2. Run: ssh $SSH_USER@$DROPLET_IP '/opt/activepieces/update-activepieces.sh'"
echo ""
echo -e "${RED}You can now make the GitHub repository private again if desired.${NC}"

# Clean up temp files
rm -f /tmp/.env.production /tmp/docker-compose.prod.yml /tmp/nginx-activepieces /tmp/update-activepieces.sh
