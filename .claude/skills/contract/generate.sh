#!/usr/bin/env bash
# Usage: generate.sh --<0xCollectionAddress> --<contractName> --<base|rh|robinhood>   (order-independent)
# Copies the v2 template (ronks.sol) into a new .sol with the given contract name and collection address.
# chain: base (default) | robinhood — only affects the WETH header comment; WETH itself is a constructor arg at deploy.
set -euo pipefail

# Argümanlar sıra bağımsız, her biri --önekli (tek - veya öneksiz de kabul edilir):
#   --0x<40hex>            koleksiyon adresi
#   --base | --rh | --robinhood   ağ
#   --<diğer>              kontrat adı
ADDR=""; NAME=""; CHAIN=""
for raw in "$@"; do
  tok="${raw#--}"; tok="${tok#-}"
  [[ -z "$tok" ]] && continue
  low="$(echo "$tok" | tr '[:upper:]' '[:lower:]')"
  if [[ "$tok" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    [[ -n "$ADDR" ]] && { echo "error: iki adres verildi ($ADDR, $tok)" >&2; exit 1; }
    ADDR="$tok"
  elif [[ "$low" == "base" || "$low" == "rh" || "$low" == "robinhood" ]]; then
    [[ -n "$CHAIN" ]] && { echo "error: iki ağ verildi ($CHAIN, $low)" >&2; exit 1; }
    CHAIN="$low"
  else
    [[ -n "$NAME" ]] && { echo "error: iki isim verildi ($NAME, $tok)" >&2; exit 1; }
    NAME="$tok"
  fi
done
CHAIN="${CHAIN:-base}"

if [[ -z "$ADDR" || -z "$NAME" ]]; then
  echo "usage: generate.sh --0x<CollectionAddress> --<contractName> --<base|rh|robinhood>" >&2; exit 1
fi

case "$CHAIN" in
  base)      WETH="0x4200000000000000000000000000000000000006"; CHAIN_LABEL="BASE (chainId 8453)" ;;
  robinhood|rh) WETH="0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"; CHAIN_LABEL="ROBINHOOD CHAIN (chainId 4663)" ;;
  *) echo "error: unknown chain '$CHAIN' (base|rh|robinhood)" >&2; exit 1 ;;
esac
if ! [[ "$ADDR" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
  echo "error: '$ADDR' is not a 40-hex address" >&2; exit 1
fi
if ! [[ "$NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "error: '$NAME' is not a valid Solidity identifier" >&2; exit 1
fi

ROOT="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
DIR="$ROOT/app/contracts/mainnetcontracts"
TEMPLATE="$DIR/ronks.sol"
TEMPLATE_NAME="flooordotfunronks"
TEMPLATE_ADDR="0x9b368Ea7e4E614C56cB29C2dC12049201Dc4db15"

# file name: contract name minus a leading "flooordotfun" / "flooor" prefix, lowercased
FILE="$(echo "$NAME" | sed -E 's/^flooordotfun//; s/^flooor//' | tr '[:upper:]' '[:lower:]')"
[[ -z "$FILE" ]] && FILE="$(echo "$NAME" | tr '[:upper:]' '[:lower:]')"
OUT="$DIR/$FILE.sol"

if [[ -e "$OUT" ]]; then
  echo "error: $OUT already exists, refusing to overwrite" >&2; exit 1
fi

sed -e "s/contract $TEMPLATE_NAME {/contract $NAME {/" \
    -e "s/$TEMPLATE_ADDR/$ADDR/" \
    -e "3s|^\([[:space:]]*\)//.*|\1// $WETH $CHAIN_LABEL WETH — constructor arg (_weth)|" \
    "$TEMPLATE" > "$OUT"

# verify both substitutions landed
grep -q "contract $NAME {" "$OUT" || { echo "error: name substitution failed" >&2; rm -f "$OUT"; exit 1; }
grep -q "collectionId = $ADDR;" "$OUT" || { echo "error: address substitution failed" >&2; rm -f "$OUT"; exit 1; }
grep -q "// $WETH" "$OUT" || { echo "error: WETH comment substitution failed" >&2; rm -f "$OUT"; exit 1; }

echo "created: ${OUT#$ROOT/}"
echo "contract: $NAME"
echo "collectionId: $ADDR"
echo "chain: $CHAIN_LABEL"
echo "deploy constructor arg _weth: $WETH"
