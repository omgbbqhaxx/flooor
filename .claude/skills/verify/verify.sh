#!/usr/bin/env bash
# Usage: verify.sh --<0xDeployedAddress> --<sourceName> --<base|rh|robinhood> [--runs=<n>] [--project=<foundryDir>] [--sourcify] [--json] [--dry-run]
#   sourceName: app/contracts/mainnetcontracts/<name>.sol dosya adı (rhmachines / rhmachines.sol)
#               veya kontrat adı (flooordotfunrhmachines) — script dosyayı bulur.
# Deploy edilmiş Flooor market kontratını Blockscout'ta doğrular (forge verify-contract).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
SRC_DIR="$REPO/app/contracts/mainnetcontracts"

ADDR=""; NAME=""; CHAIN=""; RUNS=""; PROJECT=""; DRY=0; VERIFIER="blockscout"; JSON_OUT=0
for raw in "$@"; do
  tok="${raw#--}"; tok="${tok#-}"
  [[ -z "$tok" ]] && continue
  low="$(echo "$tok" | tr '[:upper:]' '[:lower:]')"
  if [[ "$tok" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    [[ -n "$ADDR" ]] && { echo "error: iki adres verildi ($ADDR, $tok)" >&2; exit 1; }
    ADDR="$tok"
  elif [[ "$low" == "base" || "$low" == "rh" || "$low" == "robinhood" ]]; then
    CHAIN="$low"
  elif [[ "$low" == runs=* ]]; then
    RUNS="${tok#*=}"
  elif [[ "$low" == project=* ]]; then
    PROJECT="${tok#*=}"
  elif [[ "$low" == "dry-run" || "$low" == "dry" ]]; then
    DRY=1
  elif [[ "$low" == "sourcify" ]]; then
    VERIFIER="sourcify"
  elif [[ "$low" == "json" ]]; then
    JSON_OUT=1
  else
    [[ -n "$NAME" ]] && { echo "error: iki isim verildi ($NAME, $tok)" >&2; exit 1; }
    NAME="$tok"
  fi
done

if [[ -z "$ADDR" || -z "$NAME" || -z "$CHAIN" ]]; then
  echo "usage: verify.sh --0x<DeployedAddress> --<sourceName> --<base|rh|robinhood> [--runs=<n>] [--project=<dir>] [--dry-run]" >&2
  exit 1
fi

# --- kaynak dosyayı bul: önce dosya adı, sonra "contract <NAME> {" araması
FILE=""
base="${NAME%.sol}"
if [[ -f "$SRC_DIR/$base.sol" ]]; then
  FILE="$SRC_DIR/$base.sol"
else
  FILE="$(grep -lE "^\s*contract\s+$NAME\s*\{" "$SRC_DIR"/*.sol 2>/dev/null | head -1 || true)"
fi
[[ -z "$FILE" ]] && { echo "error: '$NAME' için $SRC_DIR altında .sol bulunamadı" >&2; exit 1; }
CONTRACT="$(grep -oE "^\s*contract\s+[A-Za-z0-9_]+" "$FILE" | head -1 | awk '{print $2}')"
[[ -z "$CONTRACT" ]] && { echo "error: $FILE içinde 'contract X {' satırı yok" >&2; exit 1; }
FILE_BASENAME="$(basename "$FILE")"

# --- chain
case "$CHAIN" in
  base)         CHAIN_ID=8453; WETH="0x4200000000000000000000000000000000000006"
                VERIFIER_URL="https://base.blockscout.com/api/"; RPC="https://mainnet.base.org" ;;
  rh|robinhood) CHAIN_ID=4663; WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"
                VERIFIER_URL="https://robinhoodchain.blockscout.com/api/"; RPC="https://rpc.mainnet.chain.robinhood.com" ;;
esac

# --- constructor(address _weth) → abi-encode elle (cast gerekmez): 12 byte sıfır + 20 byte adres
weth_hex="$(echo "${WETH#0x}" | tr '[:upper:]' '[:lower:]')"
CTOR_ARGS="0x000000000000000000000000${weth_hex}"

# --- zincirdeki bytecode'un CBOR metadata'sından solc sürümü + on-chain WETH() kontrolü
SOLC=""; ONCHAIN_WETH=""
if command -v python3 >/dev/null && command -v curl >/dev/null; then
  read -r SOLC ONCHAIN_WETH < <(python3 "$(dirname "$0")/chain_meta.py" "$RPC" "$ADDR" 2>/dev/null || echo "- -")
fi
[[ "$SOLC" == "-" ]] && SOLC=""
[[ "$ONCHAIN_WETH" == "-" ]] && ONCHAIN_WETH=""

if [[ -z "$SOLC" ]]; then
  SOLC="$(grep -oE 'pragma solidity \^?[0-9]+\.[0-9]+\.[0-9]+' "$FILE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
  echo "warn: zincirden solc sürümü okunamadı, pragma'daki kullanılıyor: $SOLC" >&2
fi
if [[ -n "$ONCHAIN_WETH" && "$ONCHAIN_WETH" != "$(echo "$WETH" | tr '[:upper:]' '[:lower:]')" ]]; then
  echo "error: zincirdeki WETH() = $ONCHAIN_WETH, beklenen ($CHAIN) = $WETH — yanlış chain ya da yanlış _weth ile deploy edilmiş" >&2
  exit 1
fi
if [[ -z "$ONCHAIN_WETH" ]]; then
  echo "error: $CHAIN zincirinde $ADDR adresinde WETH() okunamadı — adres bu chain'de bir Flooor market kontratı değil (yanlış chain, koleksiyon adresi ya da kod yok)" >&2
  exit 1
fi

# --- forge projesi: --project verildiyse orada, yoksa geçici bir proje kur
if [[ -n "$PROJECT" ]]; then
  WORK="$PROJECT"
  mkdir -p "$WORK/src"
  cp "$FILE" "$WORK/src/$FILE_BASENAME"
else
  WORK="${TMPDIR:-/tmp}/flooor-verify-$base-$CHAIN_ID"
  rm -rf "$WORK"; mkdir -p "$WORK/src"
  cp "$FILE" "$WORK/src/$FILE_BASENAME"
  {
    echo '[profile.default]'
    echo 'src = "src"'
    echo 'out = "out"'
    echo 'libs = []'
    echo "solc_version = \"$SOLC\""
    if [[ -n "$RUNS" ]]; then echo 'optimizer = true'; echo "optimizer_runs = $RUNS"; else echo 'optimizer = false'; fi
  } > "$WORK/foundry.toml"
fi

CMD=(forge verify-contract "$ADDR" "src/$FILE_BASENAME:$CONTRACT"
     --chain-id "$CHAIN_ID" --verifier "$VERIFIER"
     --compiler-version "$SOLC" --constructor-args "$CTOR_ARGS" --watch)
[[ "$VERIFIER" == "blockscout" ]] && CMD+=(--verifier-url "$VERIFIER_URL")
[[ -n "$RUNS" && -n "$PROJECT" ]] && CMD+=(--num-of-optimizations "$RUNS")

echo "file:        $FILE"
echo "contract:    $CONTRACT"
echo "address:     $ADDR"
echo "chain:       $CHAIN (chainId $CHAIN_ID)"
echo "solc:        $SOLC"
if [[ -n "$RUNS" ]]; then echo "optimizer:   on, runs=$RUNS"; else echo "optimizer:   off (foundry varsayılanı)"; fi
echo "_weth:       $WETH"
echo "ctor args:   $CTOR_ARGS"
echo "verifier:    $VERIFIER"
echo "project dir: $WORK"
echo
echo "cd \"$WORK\" && ${CMD[*]}"
echo

if [[ $DRY -eq 1 ]]; then exit 0; fi
if ! command -v forge >/dev/null; then
  echo "forge bu makinede yok (PATH'te değil). Yukarıdaki komutu forge kurulu ortamda çalıştır." >&2
  echo "Kurulum: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 2
fi
if [[ $JSON_OUT -eq 1 ]]; then
  OUT="$REPO/$base-standard-input.json"
  (cd "$WORK" && forge verify-contract "$ADDR" "src/$FILE_BASENAME:$CONTRACT" --chain-id "$CHAIN_ID" \
     --compiler-version "$SOLC" --show-standard-json-input > "$OUT")
  echo "standard JSON input yazıldı: $OUT (Blockscout UI → Standard JSON input ile yükle; constructor args: $CTOR_ARGS)"
  exit 0
fi
cd "$WORK" && "${CMD[@]}"
