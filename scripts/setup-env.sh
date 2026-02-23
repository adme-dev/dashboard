#!/bin/bash

# ============================================
# Environment Variable Setup Script for Wrangler
# ============================================
# This script helps you set up environment variables for Cloudflare Pages
#
# Usage:
#   ./scripts/setup-env.sh development   # For local dev
#   ./scripts/setup-env.sh preview       # For preview/staging
#   ./scripts/setup-env.sh production    # For production
#
# Or run interactively:
#   ./scripts/setup-env.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Environment selection
if [ -z "$1" ]; then
    echo -e "${BLUE}Select environment:${NC}"
    echo "1) development (local)"
    echo "2) preview (staging)"
    echo "3) production"
    read -p "Enter choice [1-3]: " choice
    
    case $choice in
        1) ENV="development" ;;
        2) ENV="preview" ;;
        3) ENV="production" ;;
        *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
    esac
else
    ENV="$1"
fi

echo -e "${BLUE}Setting up environment: $ENV${NC}"

# Check if wrangler is installed
if ! command -v npx &> /dev/null; then
    echo -e "${RED}npx is not installed. Please install Node.js and npm.${NC}"
    exit 1
fi

# Function to set secret
set_secret() {
    local name=$1
    local value=$2
    
    if [ -z "$value" ]; then
        echo -e "${YELLOW}⚠️  Skipping $name (empty value)${NC}"
        return
    fi
    
    echo -e "${BLUE}Setting $name...${NC}"
    echo "$value" | npx wrangler pages secret put "$name" --env "$ENV" 2>/dev/null || {
        echo -e "${YELLOW}⚠️  Failed to set $name (may already exist or not logged in)${NC}"
    }
}

# Function to prompt for secret
prompt_secret() {
    local name=$1
    local description=$2
    local required=$3
    
    if [ "$required" = "true" ]; then
        echo -e "${BLUE}$name${NC} ${RED}(required)${NC}"
    else
        echo -e "${BLUE}$name${NC} (optional)"
    fi
    
    if [ -n "$description" ]; then
        echo -e "${YELLOW}$description${NC}"
    fi
    
    read -p "Enter value: " value
    
    if [ "$required" = "true" ] && [ -z "$value" ]; then
        echo -e "${RED}This field is required${NC}"
        prompt_secret "$name" "$description" "$required"
    else
        set_secret "$name" "$value"
    fi
}

# Main setup
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Required Secrets${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

prompt_secret "DATABASE_URL" "Neon PostgreSQL connection string (pooled)" "true"
prompt_secret "JWT_SECRET" "Generate with: openssl rand -base64 32" "true"
prompt_secret "SESSION_SECRET" "Generate with: openssl rand -base64 32" "true"

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Xero OAuth (Required for Xero Integration)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

prompt_secret "XERO_CLIENT_ID" "From https://developer.xero.com/myapps" "false"
prompt_secret "XERO_CLIENT_SECRET" "From https://developer.xero.com/myapps" "false"

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Email (Required for Magic Links)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

prompt_secret "RESEND_API_KEY" "From https://resend.com/api-keys (format: re_xxx)" "false"

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}AI Features (Optional)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

prompt_secret "GROQ_API_KEY" "From https://console.groq.com/keys (format: gsk_xxx)" "false"

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Monday.com Integration (Optional)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

prompt_secret "MONDAY_API_TOKEN" "From Monday.com > Admin > API" "false"

echo ""
echo -e "${YELLOW}============================================${NC}"
echo -e "${YELLOW}Cloudflare R2 Storage (Optional)${NC}"
echo -e "${YELLOW}============================================${NC}"
echo ""

prompt_secret "R2_ACCOUNT_ID" "From Cloudflare Dashboard" "false"
prompt_secret "R2_ACCESS_KEY_ID" "From R2 API Tokens" "false"
prompt_secret "R2_SECRET_ACCESS_KEY" "From R2 API Tokens" "false"

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "To verify your secrets are set:"
echo -e "  ${BLUE}npx wrangler pages secret list --env $ENV${NC}"
echo ""
echo "To view all environment variables:"
echo -e "  ${BLUE}npx wrangler pages deployment tail --env $ENV${NC}"
