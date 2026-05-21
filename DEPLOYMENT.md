# PRISM Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Environment Configuration](#environment-configuration)
7. [Database Management](#database-management)
8. [Monitoring & Logging](#monitoring--logging)
9. [Security Hardening](#security-hardening)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 2 GB
- Storage: 5 GB
- OS: Linux, macOS, or Windows

**Recommended:**
- CPU: 4+ cores
- RAM: 4+ GB
- Storage: 10+ GB
- OS: Linux (Ubuntu 20.04+ or CentOS 8+)

### Software Dependencies

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Git**: For version control
- **Nvidia NIM API Key**: Optional (system works offline without it)

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd simplifyx
```

### 2. Install Dependencies

```bash
npm install
```

This installs:
- express (^4.21.1)
- sqlite3 (^5.1.7)
- pdf-parse (^1.1.1)
- pdfkit (^0.18.0)
- axios (^1.16.1)
- cors (^2.8.5)
- dotenv (^16.4.5)
- express-rate-limit (^8.5.2)

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
# Optional - for LLM features
NVIDIA_API_KEY=nvapi-your_key_here

# Server configuration
PORT=5000
NODE_ENV=development

# Optional - force offline mode
OFFLINE_MODE=false
```

### 4. Initialize Database

```bash
npm run seed
```

This command:
- Creates `prism.db` SQLite database
- Seeds 6 tables with sample data
- Generates 7 synthetic PDF documents
- Creates JSON log files
- Sets up RBAC user mappings

### 5. Start Development Server

```bash
npm start
```

Server starts at: `http://localhost:5000`

### 6. Run Tests

```bash
npm test
```

Expected output: 18 tests passing

### 7. Access Dashboard

Open browser: `http://localhost:5000`

Default test users:
- `sarah.executive` (Executive, Level 3)
- `john.hr` (HR, Level 2)
- `mark.finance` (Finance, Level 2)
- `alex.it_ops` (IT Ops, Level 1)
- `ana.analyst` (Analyst, Level 1)
- `guest.intern` (Intern, Level 0)

---

## Production Deployment

### 1. Prepare Production Environment

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should be v18.x or higher
npm --version   # Should be v9.x or higher
```

### 2. Clone and Setup

```bash
# Create application directory
sudo mkdir -p /opt/prism
sudo chown $USER:$USER /opt/prism
cd /opt/prism

# Clone repository
git clone <repository-url> .

# Install production dependencies
npm ci --production

# Set up environment
cp .env.example .env
nano .env  # Edit with production values
```

### 3. Production Environment Variables

```bash
# .env for production
NVIDIA_API_KEY=nvapi-your_production_key
PORT=5000
NODE_ENV=production
OFFLINE_MODE=false
```

### 4. Initialize Production Database

```bash
npm run seed
```

### 5. Install Process Manager (PM2)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start application
pm2 start server.js --name prism

# Configure PM2 to start on boot
pm2 startup
pm2 save

# Monitor application
pm2 status
pm2 logs prism
pm2 monit
```

### 6. Configure Reverse Proxy (Nginx)

```bash
# Install Nginx
sudo apt install -y nginx

# Create Nginx configuration
sudo nano /etc/nginx/sites-available/prism
```

Add configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/m;
    limit_req zone=api burst=10 nodelay;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/prism /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 7. Enable HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain SSL certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

### 8. Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

---

## Docker Deployment

### 1. Create Dockerfile

```dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy application files
COPY . .

# Create necessary directories
RUN mkdir -p logs documents

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/users', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "server.js"]
```

### 2. Create .dockerignore

```
node_modules
npm-debug.log
.env
.git
.gitignore
*.md
prism.db
logs/*.json
```

### 3. Create docker-compose.yml

```yaml
version: '3.8'

services:
  prism:
    build: .
    container_name: prism-rag
    restart: unless-stopped
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - NVIDIA_API_KEY=${NVIDIA_API_KEY}
    volumes:
      - ./prism.db:/app/prism.db
      - ./logs:/app/logs
      - ./documents:/app/documents
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/api/users', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - prism-network

networks:
  prism-network:
    driver: bridge
```

### 4. Build and Run

```bash
# Build image
docker build -t prism:latest .

# Run with docker-compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### 5. Docker Commands

```bash
# Check status
docker ps

# View logs
docker logs prism-rag

# Execute commands in container
docker exec -it prism-rag sh

# Restart container
docker restart prism-rag

# Update and restart
docker-compose pull
docker-compose up -d
```

---

## Cloud Deployment

### AWS EC2 Deployment

#### 1. Launch EC2 Instance

```bash
# Instance specifications
- AMI: Ubuntu Server 22.04 LTS
- Instance Type: t3.medium (2 vCPU, 4 GB RAM)
- Storage: 20 GB gp3
- Security Group: Allow ports 22, 80, 443
```

#### 2. Connect and Setup

```bash
# Connect via SSH
ssh -i your-key.pem ubuntu@your-ec2-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Follow "Production Deployment" steps above
```

#### 3. Configure Elastic IP

```bash
# Allocate and associate Elastic IP in AWS Console
# Update DNS records to point to Elastic IP
```

### Google Cloud Platform (GCP)

#### 1. Create Compute Engine Instance

```bash
gcloud compute instances create prism-instance \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

#### 2. Configure Firewall

```bash
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 \
  --target-tags http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 \
  --target-tags https-server
```

#### 3. SSH and Setup

```bash
gcloud compute ssh prism-instance
# Follow "Production Deployment" steps
```

### Azure VM Deployment

#### 1. Create Virtual Machine

```bash
az vm create \
  --resource-group prism-rg \
  --name prism-vm \
  --image UbuntuLTS \
  --size Standard_B2s \
  --admin-username azureuser \
  --generate-ssh-keys
```

#### 2. Open Ports

```bash
az vm open-port --port 80 --resource-group prism-rg --name prism-vm
az vm open-port --port 443 --resource-group prism-rg --name prism-vm
```

#### 3. SSH and Setup

```bash
ssh azureuser@your-vm-ip
# Follow "Production Deployment" steps
```

---

## Environment Configuration

### Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NVIDIA_API_KEY` | No | - | Nvidia NIM API key for LLM features |
| `PORT` | No | 5000 | Server port |
| `NODE_ENV` | No | development | Environment mode |
| `OFFLINE_MODE` | No | false | Force offline fallback mode |

### Configuration Files

**`.env`** - Environment variables
```bash
NVIDIA_API_KEY=nvapi-xxx
PORT=5000
NODE_ENV=production
```

**`package.json`** - Dependencies and scripts
```json
{
  "scripts": {
    "start": "node server.js",
    "seed": "node database.js && node pdf_generator.js",
    "test": "node test_rag.js"
  }
}
```

---

## Database Management

### Backup Database

```bash
# Create backup
cp prism.db prism.db.backup.$(date +%Y%m%d_%H%M%S)

# Automated daily backup
echo "0 2 * * * cp /opt/prism/prism.db /opt/prism/backups/prism.db.backup.\$(date +\%Y\%m\%d)" | crontab -
```

### Restore Database

```bash
# Stop application
pm2 stop prism

# Restore from backup
cp prism.db.backup.20260521_020000 prism.db

# Restart application
pm2 start prism
```

### Re-seed Database

```bash
# Warning: This will delete all existing data
npm run seed

# Or via API
curl -X POST http://localhost:5000/api/settings/reseed
```

### Database Migrations

For production, consider migrating to PostgreSQL:

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Create database
sudo -u postgres createdb prism

# Update connection in code
# Replace sqlite3 with pg (node-postgres)
```

---

## Monitoring & Logging

### Application Logs

```bash
# PM2 logs
pm2 logs prism

# View specific log file
tail -f ~/.pm2/logs/prism-out.log
tail -f ~/.pm2/logs/prism-error.log

# Audit logs
tail -f logs/audit_logs.json
```

### System Monitoring

```bash
# Install monitoring tools
sudo apt install -y htop iotop

# Monitor resources
htop
pm2 monit

# Check disk usage
df -h
du -sh /opt/prism/*
```

### Log Rotation

```bash
# Configure PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Health Checks

```bash
# Check application health
curl http://localhost:5000/api/users

# Check with timeout
curl --max-time 5 http://localhost:5000/api/users

# Automated health check script
cat > /opt/prism/healthcheck.sh << 'EOF'
#!/bin/bash
if curl -f http://localhost:5000/api/users > /dev/null 2>&1; then
    echo "$(date): PRISM is healthy"
else
    echo "$(date): PRISM is down, restarting..."
    pm2 restart prism
fi
EOF

chmod +x /opt/prism/healthcheck.sh

# Add to crontab (every 5 minutes)
echo "*/5 * * * * /opt/prism/healthcheck.sh >> /var/log/prism-health.log 2>&1" | crontab -
```

---

## Security Hardening

### 1. Secure Environment Variables

```bash
# Restrict .env file permissions
chmod 600 .env
chown $USER:$USER .env
```

### 2. Enable Firewall

```bash
# UFW (Ubuntu)
sudo ufw enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw deny 5000/tcp  # Block direct access to Node.js
```

### 3. Fail2Ban for Brute Force Protection

```bash
# Install Fail2Ban
sudo apt install -y fail2ban

# Configure for Nginx
sudo nano /etc/fail2ban/jail.local
```

Add:
```ini
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime = 3600
```

### 4. Regular Updates

```bash
# Automated security updates
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 5. Database Security

```bash
# Restrict database file permissions
chmod 600 prism.db
chown $USER:$USER prism.db

# Backup encryption (optional)
gpg --symmetric --cipher-algo AES256 prism.db.backup
```

### 6. API Key Rotation

```bash
# Rotate API key via API
curl -X POST http://localhost:5000/api/settings/apikey \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "nvapi-new_key_here"}'

# Or update .env and restart
pm2 restart prism
```

---

## Troubleshooting

### Common Issues

#### Issue: Port Already in Use

```bash
# Find process using port 5000
sudo lsof -i :5000

# Kill process
sudo kill -9 <PID>

# Or change port in .env
PORT=5001
```

#### Issue: Database Locked

```bash
# Stop all processes accessing database
pm2 stop prism

# Remove lock file if exists
rm -f prism.db-shm prism.db-wal

# Restart
pm2 start prism
```

#### Issue: Out of Memory

```bash
# Check memory usage
free -h

# Increase Node.js memory limit
node --max-old-space-size=4096 server.js

# Or in PM2
pm2 start server.js --name prism --node-args="--max-old-space-size=4096"
```

#### Issue: PDF Parsing Fails

```bash
# Check PDF files exist
ls -lh documents/*.pdf

# Re-generate PDFs
node pdf_generator.js

# Check permissions
chmod 644 documents/*.pdf
```

#### Issue: API Key Not Working

```bash
# Verify API key is set
echo $NVIDIA_API_KEY

# Test API key
curl -H "Authorization: Bearer $NVIDIA_API_KEY" \
  https://integrate.api.nvidia.com/v1/chat/completions

# System works in offline mode without API key
```

### Debug Mode

```bash
# Enable debug logging
NODE_ENV=development npm start

# Or with PM2
pm2 start server.js --name prism --node-args="--inspect"
pm2 logs prism --lines 100
```

### Performance Tuning

```bash
# Increase file descriptors
ulimit -n 65536

# Add to /etc/security/limits.conf
echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
```

---

## Maintenance

### Regular Tasks

**Daily:**
- Monitor logs for errors
- Check disk space
- Review audit logs

**Weekly:**
- Backup database
- Review security alerts
- Update dependencies

**Monthly:**
- System updates
- API key rotation
- Performance review

### Update Application

```bash
# Pull latest changes
cd /opt/prism
git pull origin main

# Install new dependencies
npm ci --production

# Re-seed if schema changed
npm run seed

# Restart application
pm2 restart prism
```

### Rollback

```bash
# Revert to previous version
git log --oneline
git checkout <commit-hash>

# Restore database backup
cp prism.db.backup.20260521 prism.db

# Restart
pm2 restart prism
```

---

## Support

### Getting Help

- **Documentation**: README.md, ARCHITECTURE.md, API.md
- **Issues**: GitHub Issues
- **Logs**: `pm2 logs prism` or `logs/audit_logs.json`

### Reporting Issues

Include:
1. Error message
2. Steps to reproduce
3. Environment details (OS, Node version)
4. Relevant logs

---

**Deployment Guide Version**: 1.0.0  
**Last Updated**: May 21, 2026  
**Maintained By**: PRISM Development Team