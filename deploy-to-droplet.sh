#!/bin/bash

# ActivePieces Deployment Script for Digital Ocean
# Usage: ./deploy-to-droplet.sh <droplet-ip> <domain>

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check arguments
if [ $# -lt 1 ]; then
    echo -e "${RED}Usage: $0 <droplet-ip> [domain]${NC}"
    echo "Example: $0 159.65.123.45 activepieces.example.com"
    exit 1
fi

DROPLET_IP=$1
DOMAIN=${2:-$DROPLET_IP}
SSH_USER="root"

echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}ActivePieces Deployment Script${NC}"
echo -e "${GREEN}==================================${NC}"
echo -e "Droplet IP: ${YELLOW}$DROPLET_IP${NC}"
echo -e "Domain: ${YELLOW}$DOMAIN${NC}"
echo ""

# Function to execute commands on remote server
remote_exec() {
    ssh -o StrictHostKeyChecking=no $SSH_USER@$DROPLET_IP "$1"
}

# Function to copy files to remote server
remote_copy() {
    scp -o StrictHostKeyChecking=no $1 $SSH_USER@$DROPLET_IP:$2
}

echo -e "${YELLOW}Step 1: Updating system packages...${NC}"
remote_exec "apt update && apt upgrade -y"

echo -e "${YELLOW}Step 2: Installing Docker and dependencies...${NC}"
remote_exec "apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx ufw"
remote_exec "systemctl start docker && systemctl enable docker"

echo -e "${YELLOW}Step 3: Setting up swap space...${NC}"
remote_exec "if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi"

echo -e "${YELLOW}Step 4: Configuring firewall...${NC}"
remote_exec "ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable"

echo -e "${YELLOW}Step 5: Creating ActivePieces directory...${NC}"
remote_exec "mkdir -p /opt/activepieces"

echo -e "${YELLOW}Step 6: Generating secure secrets...${NC}"
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 16)
API_KEY=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 32)

# Keep the Score JWT secret from development
SCORE_JWT_SECRET="bc6826cbca2987e810984a196480f150a68c319e8e78121cbc0409e7cdc4be55"

echo -e "${YELLOW}Step 7: Creating docker-compose.yml...${NC}"
cat > /tmp/docker-compose.yml << EOF
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
    image: activepieces/activepieces:latest
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    ports:
      - "8080:80"
    environment:
      AP_ENGINE_EXECUTABLE_PATH: dist/packages/engine/main.js
      AP_ENVIRONMENT: production
      AP_FRONTEND_URL: https://${DOMAIN}
      AP_WEBHOOK_TIMEOUT_SECONDS: 30
      AP_TRIGGER_DEFAULT_POLL_INTERVAL: 5
      AP_EXECUTION_MODE: UNSANDBOXED
      AP_FLOW_TIMEOUT_SECONDS: 600
      AP_DB_TYPE: postgres
      AP_POSTGRES_HOST: postgres
      AP_POSTGRES_PORT: 5432
      AP_POSTGRES_DATABASE: activepieces
      AP_POSTGRES_USERNAME: activepieces
      AP_POSTGRES_PASSWORD: ${DB_PASSWORD}
      AP_REDIS_HOST: redis
      AP_REDIS_PORT: 6379
      AP_JWT_SECRET: ${JWT_SECRET}
      AP_ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      AP_API_KEY: ${API_KEY}
      AP_SCORE_JWT_SECRET: ${SCORE_JWT_SECRET}
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

remote_copy /tmp/docker-compose.yml /opt/activepieces/docker-compose.yml

echo -e "${YELLOW}Step 8: Creating .env file with secrets...${NC}"
cat > /tmp/.env << EOF
# Generated Secrets - SAVE THESE!
AP_JWT_SECRET=${JWT_SECRET}
AP_ENCRYPTION_KEY=${ENCRYPTION_KEY}
AP_API_KEY=${API_KEY}
AP_POSTGRES_PASSWORD=${DB_PASSWORD}
AP_SCORE_JWT_SECRET=${SCORE_JWT_SECRET}
AP_FRONTEND_URL=https://${DOMAIN}
EOF

remote_copy /tmp/.env /opt/activepieces/.env
remote_exec "chmod 600 /opt/activepieces/.env"

echo -e "${YELLOW}Step 9: Configuring Nginx...${NC}"
cat > /tmp/nginx-activepieces << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:8080;
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
        proxy_pass http://localhost:8080;
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

remote_copy /tmp/nginx-activepieces /etc/nginx/sites-available/activepieces
remote_exec "ln -sf /etc/nginx/sites-available/activepieces /etc/nginx/sites-enabled/"
remote_exec "nginx -t && systemctl reload nginx"

echo -e "${YELLOW}Step 10: Starting ActivePieces...${NC}"
remote_exec "cd /opt/activepieces && docker-compose pull && docker-compose up -d"

echo -e "${YELLOW}Step 11: Setting up SSL (if domain provided)...${NC}"
if [ "$DOMAIN" != "$DROPLET_IP" ]; then
    echo -e "${GREEN}Setting up Let's Encrypt SSL for ${DOMAIN}...${NC}"
    echo -e "${RED}Note: Make sure your domain DNS is pointing to ${DROPLET_IP}${NC}"
    read -p "Press enter to continue with SSL setup, or Ctrl+C to skip..."
    remote_exec "certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --email admin@${DOMAIN} --redirect"
fi

echo -e "${YELLOW}Step 12: Creating systemd service...${NC}"
cat > /tmp/activepieces.service << 'EOF'
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

remote_copy /tmp/activepieces.service /etc/systemd/system/activepieces.service
remote_exec "systemctl daemon-reload && systemctl enable activepieces"

echo -e "${YELLOW}Step 13: Creating backup script...${NC}"
cat > /tmp/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/activepieces"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

docker exec $(docker ps -q -f name=postgres) pg_dump -U activepieces activepieces > $BACKUP_DIR/db_backup_$DATE.sql
docker run --rm -v activepieces_activepieces_data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/data_backup_$DATE.tar.gz -C /data .

find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
echo "Backup completed: $DATE"
EOF

remote_copy /tmp/backup.sh /opt/activepieces/backup.sh
remote_exec "chmod +x /opt/activepieces/backup.sh"
remote_exec "(crontab -l 2>/dev/null; echo '0 2 * * * /opt/activepieces/backup.sh >> /var/log/activepieces-backup.log 2>&1') | crontab -"

echo -e "${YELLOW}Step 14: Checking deployment status...${NC}"
sleep 10
remote_exec "cd /opt/activepieces && docker-compose ps"

echo ""
echo -e "${GREEN}==================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}==================================${NC}"
echo ""
echo -e "${GREEN}ActivePieces is now running at:${NC}"
if [ "$DOMAIN" != "$DROPLET_IP" ]; then
    echo -e "${YELLOW}https://${DOMAIN}${NC}"
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
echo -e "${GREEN}These have been saved to: /opt/activepieces/.env on the server${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Test the application by visiting the URL above"
echo "2. Update your Score application with the production URL"
echo "3. Test the SSO integration"
echo "4. Set up monitoring and alerts"
echo ""
echo -e "${GREEN}To view logs:${NC}"
echo "ssh $SSH_USER@$DROPLET_IP 'cd /opt/activepieces && docker-compose logs -f'"

# Clean up temp files
rm -f /tmp/docker-compose.yml /tmp/.env /tmp/nginx-activepieces /tmp/activepieces.service /tmp/backup.sh