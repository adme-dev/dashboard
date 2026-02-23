#!/bin/bash
# Quick import for specific boards
# Usage: ./scripts/import-quick.sh "Board Name"

export DATABASE_URL="postgresql://neondb_owner:npg_61XeGcIwAORL@ep-lively-fog-a4dum154-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
export MONDAY_API_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjExMTU2MTI1NSwiYWFpIjoxMSwidWlkIjo1NzQxNzUsImlhZCI6IjIwMjEtMDUtMjdUMTI6MjI6MDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjIyOTIyNCwicmduIjoidXNlMSJ9.ezQH-YElr0wqgirNHIRcRYApXZb0FOg_mqt0l_cO8lc"

npx tsx scripts/import-specific-board.ts "$1"
