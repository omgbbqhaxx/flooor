#!/usr/bin/env bash
# Usage: ./scripts/send-notification.sh "Title (max 30 chars)" "Message body (max 200 chars)" "/target_path"
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f .env.local ] && set -a && source .env.local && set +a

if [ -z "${BASE_NOTIFICATIONS_API_KEY:-}" ]; then
  echo "BASE_NOTIFICATIONS_API_KEY .env.local içinde bulunamadı" >&2
  exit 1
fi

TITLE="${1:?Title gerekli}"
MESSAGE="${2:?Message gerekli}"
TARGET_PATH="${3:-/}"
APP_URL="https://flooor.fun"

echo "Bildirime izin veren kullanıcılar alınıyor..."
USERS_RESPONSE=$(curl -s -G "https://dashboard.base.org/api/v1/notifications/app/users" \
  --data-urlencode "app_url=${APP_URL}" \
  --data-urlencode "notification_enabled=true" \
  -H "x-api-key: ${BASE_NOTIFICATIONS_API_KEY}")

echo "$USERS_RESPONSE"

ADDRESSES=$(echo "$USERS_RESPONSE" | node -e '
  let data = "";
  process.stdin.on("data", d => data += d);
  process.stdin.on("end", () => {
    const json = JSON.parse(data);
    const addrs = (json.users || []).map(u => u.address);
    process.stdout.write(JSON.stringify(addrs));
  });
')

COUNT=$(echo "$ADDRESSES" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).length.toString()))')

if [ "$COUNT" = "0" ]; then
  echo "Bildirime izin veren kullanıcı bulunamadı, gönderim yapılmadı."
  exit 0
fi

echo "$COUNT kullanıcıya bildirim gönderiliyor..."

BODY=$(node -e "
  const addresses = $ADDRESSES;
  console.log(JSON.stringify({
    app_url: '${APP_URL}',
    wallet_addresses: addresses,
    title: process.argv[1],
    message: process.argv[2],
    target_path: process.argv[3],
  }));
" "$TITLE" "$MESSAGE" "$TARGET_PATH")

curl -s -X POST "https://dashboard.base.org/api/v1/notifications/send" \
  -H "x-api-key: ${BASE_NOTIFICATIONS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY"

echo
