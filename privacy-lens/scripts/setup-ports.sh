#!/bin/bash
# Script to set up .env files with port numbers for all PrivacyLens processes
# Usage: bash scripts/setup-ports.sh

set -e

# Define directories and ports
declare -A services=(
  [plugin-api]=3001
  [client-api]=3002
  [archive-api]=3003
  [admin-dashboard]=3004
)

for service in "${!services[@]}"; do
  dir="$(dirname "$0")/../processes/$service"
  port="${services[$service]}"
  case $service in
    plugin-api)
      var="PLUGIN_API_PORT";;
    client-api)
      var="CLIENT_API_PORT";;
    archive-api)
      var="ARCHIVE_API_PORT";;
    admin-dashboard)
      var="ADMIN_DASHBOARD_PORT";;
  esac
  echo "$var=$port" > "$dir/.env"
  echo "Wrote $var=$port to $dir/.env"
done

echo "All .env files created/updated." 