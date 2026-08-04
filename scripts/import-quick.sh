#!/bin/bash
# Quick import for specific boards
# Usage: DATABASE_URL=... MONDAY_API_TOKEN=... ./scripts/import-quick.sh "Board Name"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MONDAY_API_TOKEN:?MONDAY_API_TOKEN is required}"

npx tsx scripts/import-specific-board.ts "$1"
