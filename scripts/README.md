# 🚀 Overseer Deployment Scripts

Production-grade deployment system for Overseer with one-line installation.

## 📋 Quick Start

### One-Line Installation

```bash
curl -fsSL https://raw.githubusercontent.com/ErzenXz/Overseer/main/scripts/install.sh | bash
```

Or with custom options:

```bash
wget https://raw.githubusercontent.com/ErzenXz/Overseer/main/scripts/install.sh
chmod +x install.sh
./install.sh --help
```

---

## 📁 Scripts Overview

### 🛠️ Installation & Setup

#### `scripts/install.sh`
**One-line production installer for any VPS**

Features:
- ✅ Auto-detects OS (Ubuntu/Debian, CentOS/RHEL, macOS)
- ✅ Installs Node.js 20+ if not present
- ✅ Installs system dependencies (git, sqlite, build tools)
- ✅ Clones Overseer repository
- ✅ Runs interactive setup wizard
- ✅ Initializes database
- ✅ Creates systemd services
- ✅ Configures nginx reverse proxy (optional)
- ✅ Sets up SSL with Let's Encrypt (optional)
- ✅ Configures firewall (ufw)

Usage:
```bash
# Standard installation
./install.sh

# Custom installation directory
./install.sh --dir /opt/overseer

# Skip nginx setup
./install.sh --no-nginx

# Skip SSL setup
./install.sh --no-ssl

# Non-interactive mode
./install.sh --non-interactive

# View all options
./install.sh --help
```

#### `scripts/setup.js`
**Interactive configuration wizard**

Features:
- 🔐 Generates secure random keys automatically
- 🤖 Tests Telegram bot tokens with API validation
- 💬 Tests Discord bot tokens
- 🧠 Tests LLM provider API keys (OpenAI, Anthropic, Google)
- 👤 Creates admin user with password confirmation
- ⚙️ Configures agent settings
- 🔧 Sets tool permissions

Usage:
```bash
node scripts/setup.js
```

The wizard will create a `.env` file with all necessary configuration.

---

### 💾 Backup & Restore

#### `scripts/backup.sh`
**Automated backup system**

Features:
- 📦 SQLite database backup with WAL checkpoint
- 🔧 Environment configuration backup
- 📝 Recent logs backup (last 7 days)
- 🎨 Custom skills backup
- 📁 Data directory backup
- 🗜️ Automatic compression
- ✅ Backup verification (integrity check)
- 🗑️ Automatic retention (keeps last N backups)
- ☁️ Remote backup support (rsync/scp)
- 📋 Backup manifest generation

Usage:
```bash
# Run backup
./scripts/backup.sh

# Custom backup location
./scripts/backup.sh /path/to/backups

# Restore from backup
./scripts/backup.sh restore /path/to/backup.tar.gz
```

Configuration (in `.env`):
```env
# Optional remote backup
REMOTE_BACKUP_HOST=backup-server.com
REMOTE_BACKUP_USER=backup
REMOTE_BACKUP_PATH=/backups/overseer
```

Automated backups with cron:
```bash
# Add to crontab (daily at 2 AM)
crontab -e
0 2 * * * /opt/overseer/scripts/backup.sh >> /opt/overseer/logs/backup.log 2>&1
```

---

### 🏥 Health Monitoring

#### `scripts/health-check.sh`
**System health monitoring**

Features:
- 🌐 Web server API health check
- 📱 Telegram bot status check
- 💬 Discord bot status check
- 🤖 Agent runner status check
- 💾 Database integrity check
- 💿 Disk space monitoring
- 🧠 Memory usage monitoring
- 📊 Process monitoring
- 📝 Log file analysis
- ⚙️ Systemd service checks
- 🚨 Alert notifications (email/webhook)

Usage:
```bash
# Run health check
./scripts/health-check.sh

# Verbose output
./scripts/health-check.sh --verbose

# With alerts (email/webhook)
./scripts/health-check.sh --alert
```

Automated monitoring with cron:
```bash
# Add to crontab (every 5 minutes)
crontab -e
*/5 * * * * /opt/overseer/scripts/health-check.sh --alert >> /opt/overseer/logs/health-check-cron.log 2>&1
```

Alert configuration (in `.env`):
```env
# Email alerts
ALERT_EMAIL=admin@example.com

# Webhook alerts (e.g., Slack, Discord)
ALERT_WEBHOOK=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Health check thresholds:
- Disk space warning: 80%
- Disk space critical: 90%
- Memory warning: 80%
- Memory critical: 90%

---

### 📦 Additional Scripts

#### `scripts/install-docker.sh`
**Docker-specific installation**

Installs Docker, Docker Compose, and sets up Overseer containers.

Usage:
```bash
./scripts/install-docker.sh
```

#### `scripts/update.sh`
**Update Overseer to latest version**

Safely updates Overseer with automatic backup and rollback.

Usage:
```bash
./scripts/update.sh
```

#### `scripts/uninstall.sh`
**Complete uninstallation**

Removes Overseer, services, and optionally data.

Usage:
```bash
./scripts/uninstall.sh
```

---

## 🐳 Docker Deployment

### Quick Start

```bash
# Copy environment file
cp .env.example .env

# Edit configuration
nano .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Docker Compose Services

The `docker-compose.yml` includes:

- **overseer-web**: Next.js web server (port 3000)
- **overseer-telegram**: Telegram bot
- **overseer-discord**: Discord bot
- **nginx**: Reverse proxy with SSL support
- **Volumes**: Persistent storage for database, logs, skills

### Individual Service Control

```bash
# Start specific service
docker-compose up -d overseer-web

# Restart service
docker-compose restart overseer-telegram

# View service logs
docker-compose logs -f overseer-discord

# Execute command in container
docker-compose exec overseer-web npm run db:init
```

---

## ⚙️ Process Management

### Systemd (Production - Recommended)

Service files are located in `systemd/` directory:
- `overseer.service` - Web server
- `overseer-telegram.service` - Telegram bot
- `overseer-discord.service` - Discord bot

**Management:**

```bash
# Start services
sudo systemctl start overseer.service
sudo systemctl start overseer-telegram.service
sudo systemctl start overseer-discord.service

# Enable auto-start on boot
sudo systemctl enable overseer.service

# View status
sudo systemctl status overseer.service

# View logs
sudo journalctl -u overseer.service -f

# Restart
sudo systemctl restart overseer.service
```

### PM2 (Alternative)

Configuration file: `ecosystem.config.js`

**Management:**

```bash
# Start all services
pm2 start ecosystem.config.js --env production

# Start specific service
pm2 start ecosystem.config.js --only overseer-web

# Monitor
pm2 monit

# View logs
pm2 logs

# Restart
pm2 restart all

# Save process list
pm2 save

# Setup auto-start
pm2 startup
pm2 save
```

---

## 🔧 Configuration Files

### Environment Configuration

**`.env`** - Main configuration file

Generated by `scripts/setup.js` or manually created from `.env.example`.

Key sections:
- Application settings (port, base URL)
- Security keys (session secret, encryption key)
- Database path
- Admin credentials
- Telegram bot configuration
- Discord bot configuration
- LLM providers (OpenAI, Anthropic, Google, etc.)
- Agent settings
- Tool permissions

### Nginx Configuration

**`nginx/overseer.conf`** - Reverse proxy configuration

Features:
- HTTP to HTTPS redirect
- SSL/TLS termination
- WebSocket support
- Rate limiting (API: 10 req/s, General: 30 req/s)
- Security headers
- Gzip compression
- Static asset caching
- Health check endpoint

Installation:
```bash
sudo cp nginx/overseer.conf /etc/nginx/sites-available/overseer
sudo ln -s /etc/nginx/sites-available/overseer /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### PM2 Ecosystem

**`ecosystem.config.js`** - PM2 process configuration

Features:
- Cluster mode for web server (uses all CPU cores)
- Auto-restart on failure
- Memory limits
- Log management
- Environment-specific configs
- Deployment configuration

---

## 🔒 Security

### Firewall Setup

The installer automatically configures UFW (Ubuntu/Debian):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### SSL/HTTPS Setup

#### Let's Encrypt (Recommended)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
sudo certbot renew --dry-run
```

#### Self-Signed Certificate (Development)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/overseer-selfsigned.key \
  -out /etc/ssl/certs/overseer-selfsigned.crt
```

### Security Best Practices

1. **Strong Passwords**: Use generated secrets for SESSION_SECRET and ENCRYPTION_KEY
2. **Firewall**: Only expose ports 80, 443, and SSH
3. **SSH Hardening**: Disable root login, use key-based auth
4. **Regular Updates**: Keep system and dependencies updated
5. **Backup**: Automated daily backups with retention policy
6. **Monitoring**: Health checks every 5 minutes with alerts
7. **Rate Limiting**: Configured in nginx to prevent abuse
8. **Fail2Ban**: Automatically ban malicious IPs

---

## 📊 Monitoring & Maintenance

### Log Files

- **Application logs**: `./logs/*.log`
- **Systemd logs**: `sudo journalctl -u overseer.service`
- **Nginx logs**: `/var/log/nginx/overseer_*.log`
- **PM2 logs**: `~/.pm2/logs/`

### Log Rotation

Create `/etc/logrotate.d/overseer`:

```
/opt/overseer/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0644 overseer overseer
}
```

### Health Monitoring

- **Manual check**: `./scripts/health-check.sh --verbose`
- **Automated**: Cron job every 5 minutes
- **Web endpoint**: `http://your-server/api/health`
- **PM2 monitoring**: `pm2 monit`

### Performance Monitoring

```bash
# System resources
htop

# Disk usage
df -h
du -sh /opt/overseer/*

# Process monitoring
ps aux | grep node

# Network connections
netstat -tulpn | grep node
```

---

## 🆘 Troubleshooting

### Common Issues

#### Service Won't Start

```bash
# Check status
sudo systemctl status overseer.service

# View logs
sudo journalctl -u overseer.service -n 50

# Check port usage
sudo lsof -i :3000
```

#### Database Locked

```bash
# Stop all services
sudo systemctl stop overseer.service overseer-telegram.service overseer-discord.service

# Remove WAL files
rm -f data/overseer.db-wal data/overseer.db-shm

# Restart
sudo systemctl start overseer.service
```

#### High Memory Usage

```bash
# Check memory
free -h

# Restart services
sudo systemctl restart overseer.service

# Check for memory leaks
pm2 monit
```

#### Telegram Bot Not Responding

```bash
# Check service
sudo systemctl status overseer-telegram.service

# View logs
sudo journalctl -u overseer-telegram.service -f

# Test token
curl https://api.telegram.org/bot<TOKEN>/getMe

# Check webhook
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

#### Can't Access Web UI

```bash
# Check web server
curl http://localhost:3000/api/health

# Check nginx
sudo systemctl status nginx
sudo nginx -t

# Check firewall
sudo ufw status
```

---

## 📚 Documentation

- **[Deployment Guide](https://docs.overseer.sh/guides/deployment)** - Comprehensive deployment documentation
- **[API Documentation](https://docs.overseer.sh/api-reference/overview)** - API reference
- **[Agent Setup](../AGENT_SETUP.md)** - Agent configuration guide

---

## 🔄 Update & Upgrade

### Update Overseer

```bash
cd /opt/overseer

# Pull latest changes
git pull

# Install dependencies
npm install

# Rebuild
npm run build

# Restart services
sudo systemctl restart overseer.service overseer-telegram.service overseer-discord.service
```

### Automated Updates

Create `/opt/overseer/scripts/auto-update.sh`:

```bash
#!/bin/bash
cd /opt/overseer
git pull
npm install
npm run build
sudo systemctl restart overseer.service overseer-telegram.service overseer-discord.service
```

Add to crontab:
```bash
0 3 * * 0 /opt/overseer/scripts/auto-update.sh >> /opt/overseer/logs/update.log 2>&1
```

---

## 💡 Tips & Best Practices

### 1. Use PM2 for Development, Systemd for Production

- **Development**: `pm2 start ecosystem.config.js`
- **Production**: `systemctl start overseer.service`

### 2. Enable Automated Backups

```bash
# Daily backups at 2 AM
0 2 * * * /opt/overseer/scripts/backup.sh
```

### 3. Monitor System Health

```bash
# Every 5 minutes with alerts
*/5 * * * * /opt/overseer/scripts/health-check.sh --alert
```

### 4. Keep Logs Under Control

- Use log rotation (logrotate)
- Monitor disk space
- Archive old logs to remote storage

### 5. Test Before Deploying

```bash
# Run locally first
npm run dev

# Test build
npm run build
npm run start
```

### 6. Use Environment-Specific Configs

- Development: `.env.development`
- Staging: `.env.staging`
- Production: `.env.production`

### 7. Secure Your Secrets

```bash
# Restrict .env permissions
chmod 600 .env

# Never commit .env to git
echo ".env" >> .gitignore
```

---

## 🎯 Supported Platforms

### Operating Systems

- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ CentOS 8+ / Rocky Linux 8+
- ✅ macOS (via install.sh)
- ✅ Windows Server 2019+ (manual installation)

### VPS Providers

- ✅ DigitalOcean
- ✅ AWS EC2
- ✅ Hetzner Cloud
- ✅ Linode
- ✅ Vultr
- ✅ Oracle Cloud (Free Tier)
- ✅ Google Cloud Platform
- ✅ Azure

### Container Platforms

- ✅ Docker
- ✅ Docker Compose
- ✅ Kubernetes
- ✅ Podman

---

## 🤝 Contributing

Contributions to improve the deployment scripts are welcome!

Areas for improvement:
- Additional OS support
- More deployment platforms
- Better error handling
- Enhanced monitoring
- Performance optimizations

---

## 📄 License

MIT License - See [LICENSE](../LICENSE) file for details

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/ErzenXz/Overseer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ErzenXz/Overseer/discussions)
- **Documentation**: [Full Docs](https://docs.overseer.sh/)

---

**Deployment made easy! 🚀**

Start deploying Overseer in minutes with one-line installation:

```bash
curl -fsSL https://raw.githubusercontent.com/ErzenXz/Overseer/main/scripts/install.sh | bash
```
