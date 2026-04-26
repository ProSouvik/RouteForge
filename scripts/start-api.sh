#!/usr/bin/env bash
set -e

# Move to project root (script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/apps/api"

echo "🔄 Stopping existing API server (if running)..."
pkill -f "src/index.js" 2>/dev/null || true

sleep 1

echo "🚀 Starting API server..."
node --watch src/index.js > /tmp/api.log 2>&1 &

API_PID=$!
echo "✅ API server started (PID: $API_PID)"

# Give server time to start
sleep 3

echo "🔍 Checking API health..."
if curl -s http://localhost:8080/api/health > /dev/null; then
    echo "✅ API is running at http://localhost:8080"
else
    echo "⚠️ API might not be ready yet. Check logs at /tmp/api.log"
fi

echo ""
echo "📄 Logs: /tmp/api.log"
