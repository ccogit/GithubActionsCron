#!/bin/bash

# Test script to verify analyst cache API endpoint

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: ./test-cache-endpoint.sh <deployment-url> <cache-key>"
  echo ""
  echo "Example:"
  echo "  ./test-cache-endpoint.sh stock-watcher.vercel.app a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
  echo "  ./test-cache-endpoint.sh github-actions-cron.vercel.app 63796990c3d90a410e6650a6fe383feb"
  exit 1
fi

# Remove https:// if user included it
DEPLOYMENT_URL="${1#https://}"
DEPLOYMENT_URL="${DEPLOYMENT_URL#http://}"
DEPLOYMENT_URL="${DEPLOYMENT_URL%/}"  # Remove trailing slash
CACHE_KEY="$2"

echo "Testing analyst cache endpoint..."
echo "URL: https://$DEPLOYMENT_URL/api/cache-analyst"
echo "Key: ${CACHE_KEY:0:8}...${CACHE_KEY: -4}"
echo ""

RESPONSE=$(curl -sL -w "\n%{http_code}" -X POST https://$DEPLOYMENT_URL/api/cache-analyst \
  -H "Authorization: Bearer $CACHE_KEY" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

echo ""
if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ Success!"
  exit 0
elif [ "$HTTP_CODE" = "401" ]; then
  echo "✗ Unauthorized (401)"
  echo "  → Check ANALYST_CACHE_KEY in GitHub Secrets"
  echo "  → Check ANALYST_CACHE_KEY in deployment environment"
  exit 1
elif [ "$HTTP_CODE" = "404" ]; then
  echo "✗ Not Found (404)"
  echo "  → Check DEPLOYMENT_URL is correct"
  echo "  → Verify deployment is running"
  exit 1
else
  echo "✗ Request failed with status $HTTP_CODE"
  exit 1
fi
