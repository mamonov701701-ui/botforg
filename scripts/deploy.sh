#!/bin/bash
# BotForg Deployment Script
# Usage: ./scripts/deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
PROJECT_DIR="/opt/botforg"
BACKUP_DIR="/opt/botforg-backups"

echo "🚀 Starting BotForg deployment..."
echo "Environment: $ENVIRONMENT"

# Create backup directory if not exists
mkdir -p $BACKUP_DIR

# Backup database before deployment
echo "📦 Creating database backup..."
BACKUP_FILE="$BACKUP_DIR/botforg_$(date +%Y%m%d_%H%M%S).sql"
docker-compose exec -T postgres pg_dump -U botforg botforg > $BACKUP_FILE 2>/dev/null || echo "No database to backup yet"

# Pull latest code
echo "📥 Pulling latest code..."
cd $PROJECT_DIR
git pull origin main

# Pull latest images
echo "🐳 Pulling Docker images..."
docker-compose pull

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose down

# Start new containers
echo "🔄 Starting new containers..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services..."
sleep 10

# Run migrations
echo "📊 Running database migrations..."
docker-compose exec -T backend alembic upgrade head || echo "Migrations skipped or failed"

# Health check
echo "🏥 Running health check..."
if curl -f http://localhost:8001/health > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed!"
    exit 1
fi

if curl -f http://localhost:80 > /dev/null 2>&1; then
    echo "✅ Frontend is healthy"
else
    echo "❌ Frontend health check failed!"
    exit 1
fi

# Cleanup old images
echo "🧹 Cleaning up old images..."
docker image prune -f

# Keep only last 5 backups
echo "📁 Cleaning old backups..."
ls -t $BACKUP_DIR/*.sql 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

echo ""
echo "✅ Deployment completed successfully!"
echo ""
echo "Services status:"
docker-compose ps

