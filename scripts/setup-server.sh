#!/bin/bash
# BotForg Server Setup Script
# Run this on a fresh Ubuntu 22.04 server

set -e

echo "🔧 Setting up BotForg server..."

# Update system
echo "📦 Updating system..."
apt-get update
apt-get upgrade -y

# Install Docker
echo "🐳 Installing Docker..."
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Install additional tools
echo "🔧 Installing tools..."
apt-get install -y git nginx certbot python3-certbot-nginx ufw htop

# Configure firewall
echo "🔥 Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# Create botforg user
echo "👤 Creating botforg user..."
useradd -m -s /bin/bash botforg || true
usermod -aG docker botforg

# Create project directory
echo "📁 Creating project directory..."
mkdir -p /opt/botforg
mkdir -p /opt/botforg-backups
chown -R botforg:botforg /opt/botforg
chown -R botforg:botforg /opt/botforg-backups

# Clone repository
echo "📥 Cloning repository..."
cd /opt/botforg
if [ ! -d ".git" ]; then
    git clone https://github.com/mamonov701701-ui/botforg.git .
fi
chown -R botforg:botforg /opt/botforg

echo ""
echo "✅ Server setup completed!"
echo ""
echo "Next steps:"
echo "1. Copy env.production.example to .env and fill in your values"
echo "2. Set up SSL certificates: certbot --nginx -d botforg.app"
echo "3. Start the application: docker compose up -d"
echo ""

