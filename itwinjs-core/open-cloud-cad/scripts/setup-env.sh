#!/bin/bash
# Open Cloud CAD - Environment Setup Script
# This script creates .env files from .env.example templates

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==============================================="
echo "Open Cloud CAD - Environment Setup"
echo "==============================================="
echo ""

# Function to setup env file
setup_env() {
    local service=$1
    local env_file=$2
    local example_file="${env_file}.example"

    echo "Setting up ${service}..."

    if [ -f "$env_file" ]; then
        echo "  ⚠️  .env already exists for ${service}"
        read -p "  Overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "  Skipped"
            return
        fi
    fi

    if [ -f "$example_file" ]; then
        cp "$example_file" "$env_file"
        echo "  ✅ Created .env from template"
    else
        echo "  ❌ Template not found: $example_file"
        return 1
    fi
}

# Setup web frontend
echo ""
setup_env "Frontend (web)" "$PROJECT_DIR/apps/web/.env"

# Setup web-agent
echo ""
setup_env "Webhook Agent" "$PROJECT_DIR/apps/web-agent/.env"

echo ""
echo "==============================================="
echo "Setup Complete!"
echo "==============================================="
echo ""
echo "IMPORTANT NOTES:"
echo ""
echo "1. Frontend (.env):"
echo "   - Default config should work for local development"
echo "   - VITE_IMODELHUB_URL is set to http://localhost:4000"
echo ""
echo "2. Webhook Agent (.env):"
echo "   - WEBHOOK_SECRET must match imodelhub-services"
echo "   - Default: 'your-webhook-signing-secret-change-in-production'"
echo ""
echo "3. imodelhub-services (separate repo):"
echo "   - Ensure WEBHOOK_SIGNING_SECRET matches web-agent's WEBHOOK_SECRET"
echo "   - Both should use the same value"
echo ""
echo "Next Steps:"
echo "  1. Review and edit .env files if needed"
echo "  2. Start services: docker-compose up -d"
echo "  3. Start backend: cd apps/backend && rushx dev"
echo "  4. Start web-agent: cd apps/web-agent && npm start"
echo "  5. Start frontend: cd apps/web && npm run dev"
echo ""
echo "For detailed configuration, see: docs/WEBHOOK_CONFIG.md"
echo ""
