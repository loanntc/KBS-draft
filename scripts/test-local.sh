#!/bin/bash
# Run build + smoke tests before deploying
set -e

export PATH="/opt/homebrew/bin:$PATH"
BASE_URL="http://localhost:3000"
PASS=0
FAIL=0

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Pre-deploy checks"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. TypeScript + Build ──────────────────────────────────────────────────
echo ""
echo "▶ Building..."
npm run build 2>&1 | tail -5
echo "✓ Build passed"

# ── 2. Start server in background ─────────────────────────────────────────
echo ""
echo "▶ Starting local server..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 1
npm run start &
SERVER_PID=$!
sleep 4   # wait for server to be ready

check() {
  local label="$1"
  local url="$2"
  local expected="$3"   # expected HTTP status
  local code
  # Use --max-redirs 0 but ignore curl's own exit code (47 = redirect stopped)
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-redirs 0 "$url" 2>/dev/null || true)
  if [ "$code" = "$expected" ]; then
    echo "  ✓ $label ($code)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $label — expected $expected, got $code"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "▶ Route smoke tests..."
check "/ (home)"                       "$BASE_URL/"                  "200"
check "/login"                         "$BASE_URL/login"             "200"
check "/community/join"                "$BASE_URL/community/join"    "200"
check "/community → redirect login"   "$BASE_URL/community"         "307"
check "/community/following → 307"    "$BASE_URL/community/following" "307"
check "/community/expert → 307"       "$BASE_URL/community/expert"  "307"
check "/community/my → 307"           "$BASE_URL/community/my"      "307"
check "/community/notifications → 307" "$BASE_URL/community/notifications" "307"
check "/community/settings → 307"     "$BASE_URL/community/settings" "307"

# ── 3. Stop server ─────────────────────────────────────────────────────────
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Results: $PASS passed, $FAIL failed"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAIL" -gt 0 ]; then
  echo "✗ Tests failed — aborting deploy"
  exit 1
fi

echo "✓ All tests passed — deploying..."
echo ""
npx vercel --prod
