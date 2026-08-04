#!/bin/bash

# ============================================
# Local Development Environment Setup
# ============================================
# Sets up .dev.vars file for local development with Wrangler

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Setting up local development environment...${NC}"

# Check if .dev.vars already exists
if [ -f ".dev.vars" ]; then
    echo -e "${YELLOW}⚠️  .dev.vars already exists${NC}"
    read -p "Do you want to overwrite it? (y/N): " overwrite
    if [ "$overwrite" != "y" ] && [ "$overwrite" != "Y" ]; then
        echo -e "${GREEN}Keeping existing .dev.vars${NC}"
        exit 0
    fi
fi

# Generate random secrets
JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-jwt-secret-change-in-production")
SESSION_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-session-secret-change-in-production")
CRON_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "your-cron-secret-change-in-production")

# Create .dev.vars file
cat > .dev.vars << EOF
# ============================================
# Local Development Environment Variables
# ============================================
# Generated on $(date)
# DO NOT commit this file to git!

# Database (Neon PostgreSQL)
# Get your connection string from: https://console.neon.tech
DATABASE_URL=

# Security Secrets
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
CRON_SECRET=$CRON_SECRET

# Xero OAuth (Optional - only needed for Xero features)
# Get from: https://developer.xero.com/myapps
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=

# Email (Resend - Required for magic links to work)
# Get from: https://resend.com/api-keys
RESEND_API_KEY=

# AI (Groq - Optional)
# Get from: https://console.groq.com/keys
GROQ_API_KEY=

# Monday.com (Optional)
MONDAY_API_TOKEN=

# R2 Storage (Optional)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
EOF

echo -e "${GREEN}✅ Created .dev.vars${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit .dev.vars and add your actual values"
echo "2. Get your Neon database URL from https://console.neon.tech"
echo "3. Get your Resend API key from https://resend.com for email features"
echo ""
echo -e "${BLUE}To start development server:${NC}"
echo "  npx wrangler pages dev -- npm run dev"
