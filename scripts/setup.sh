#!/usr/bin/env bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  RouteForge — Setup & Launch${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. Check Node.js version
REQUIRED_NODE=18
NODE_VERSION=$(node --version 2>/dev/null | sed 's/v//;s/\..*//')

if [ -z "$NODE_VERSION" ]; then
    echo -e "${RED}❌ Node.js is not installed.${NC}"
    echo "   Please install Node.js ≥ ${REQUIRED_NODE} from https://nodejs.org/"
    exit 1
fi

if [ "$NODE_VERSION" -lt "$REQUIRED_NODE" ]; then
    echo -e "${RED}❌ Node.js v${NODE_VERSION} is too old.${NC}"
    echo "   Please upgrade to Node.js ≥ ${REQUIRED_NODE}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js v$(node --version)"

# 2. Check package manager
if command -v yarn &> /dev/null; then
    PKG_MGR="yarn"
    echo -e "${GREEN}✓${NC} Yarn $(yarn --version)"
elif command -v npm &> /dev/null; then
    PKG_MGR="npm"
    echo -e "${GREEN}✓${NC} NPM $(npm --version)"
else
    echo -e "${RED}❌ No package manager found.${NC}"
    echo "   Please install npm or yarn."
    exit 1
fi

# 3. Install dependencies
echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
if [ "$PKG_MGR" = "yarn" ]; then
    yarn install --frozen-lockfile
else
    npm ci
fi
echo -e "${GREEN}✓${NC} Dependencies installed"

# 4. Check for .env file
echo ""
if [ -f "apps/api/.env" ]; then
    echo -e "${GREEN}✓${NC} apps/api/.env found"
    KEY_COUNT=$(grep -c "^[A-Z_]*=" apps/api/.env 2>/dev/null || echo "0")
    echo -e "   ${BLUE}ℹ${NC}  Found ${KEY_COUNT} environment variables"
else
    echo -e "${YELLOW}⚠️  apps/api/.env NOT FOUND${NC}"
    echo ""
    echo -e "   ${YELLOW}Without API keys, disruption data may be empty.${NC}"
    echo -e "   ${YELLOW}Routing may also fail if no routing APIs are configured.${NC}"
    echo ""
    echo -e "   ${BLUE}To enable full functionality, create:${NC}"
    echo -e "   ${BLUE}   apps/api/.env${NC}"
    echo ""
    echo -e "   ${BLUE}Example (.env.example):${NC}"
    echo -e "   OPENWEATHER_API_KEY=your_key"
    echo -e "   GOOGLE_MAPS_API_KEY=your_key"
    echo ""
fi

# 5. Start servers
echo ""
echo -e "${BLUE}🚀 Starting servers...${NC}"
echo -e "   API will run on  ${GREEN}http://localhost:8080${NC}"
echo -e "   Web will run on  ${GREEN}http://localhost:5173${NC}"
echo ""

if [ "$PKG_MGR" = "yarn" ]; then
    yarn dev
else
    npx concurrently "npm run dev --workspace=@routeforge/api" "npm run dev --workspace=@routeforge/web"
fi