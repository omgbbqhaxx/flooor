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

TOTAL_SENT=0
TOTAL_FAILED=0
CURSOR=""
PAGE=1

echo "Bildirime izin veren kullanıcılar alınıyor..."

while :; do
  CURL_ARGS=(-s -G "https://dashboard.base.org/api/v1/notifications/app/users"
    --data-urlencode "app_url=${APP_URL}"
    --data-urlencode "notification_enabled=true"
    -H "x-api-key: ${BASE_NOTIFICATIONS_API_KEY}")
  [ -n "$CURSOR" ] && CURL_ARGS+=(--data-urlencode "cursor=${CURSOR}")

  USERS_RESPONSE=$(curl "${CURL_ARGS[@]}")

  ADDRESSES=$(echo "$USERS_RESPONSE" | node -e '
    let data = "";
    process.stdin.on("data", d => data += d);
    process.stdin.on("end", () => {
      const json = JSON.parse(data);
      const addrs = (json.users || []).map(u => u.address);
      process.stdout.write(JSON.stringify(addrs));
    });
  ')
  CURSOR=$(echo "$USERS_RESPONSE" | node -e '
    let data = "";
    process.stdin.on("data", d => data += d);
    process.stdin.on("end", () => process.stdout.write(String(JSON.parse(data).nextCursor || "")));
  ')

  COUNT=$(echo "$ADDRESSES" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>process.stdout.write(JSON.parse(d).length.toString()))')

  if [ "$COUNT" = "0" ]; then
    [ "$PAGE" = "1" ] && echo "Bildirime izin veren kullanıcı bulunamadı, gönderim yapılmadı."
    break
  fi

  echo "Sayfa ${PAGE}: ${COUNT} kullanıcıya bildirim gönderiliyor..."

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

  SEND_RESPONSE=$(curl -s -X POST "https://dashboard.base.org/api/v1/notifications/send" \
    -H "x-api-key: ${BASE_NOTIFICATIONS_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$BODY")

  read SENT FAILED <<< $(echo "$SEND_RESPONSE" | node -e '
    let d="";process.stdin.on("data",c=>d+=c);
    process.stdin.on("end",()=>{
      const j=JSON.parse(d);
      process.stdout.write(`${j.sentCount||0} ${j.failedCount||0}`);
    });
  ')

  TOTAL_SENT=$((TOTAL_SENT + SENT))
  TOTAL_FAILED=$((TOTAL_FAILED + FAILED))

  [ -z "$CURSOR" ] && break
  PAGE=$((PAGE + 1))
done

echo "Toplam: sentCount=${TOTAL_SENT} failedCount=${TOTAL_FAILED}"
