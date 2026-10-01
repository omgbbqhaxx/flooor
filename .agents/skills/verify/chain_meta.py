#!/usr/bin/env python3
"""Usage: chain_meta.py <rpc> <address>
Prints "<solc|-> <weth|->": solc version from the deployed bytecode's CBOR metadata, and WETH() from the contract."""
import sys, json, subprocess

rpc, addr = sys.argv[1], sys.argv[2]

def call(method, params):
    # curl kullan: bazı RPC'ler (Robinhood) Python urllib'in User-Agent'ını 403 ile reddediyor.
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    out = subprocess.run(["curl", "-s", "--max-time", "20", "-X", "POST", rpc,
                          "-H", "content-type: application/json", "-d", body],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out).get("result") or ""

solc = ""
weth = ""
try:
    code = bytes.fromhex(call("eth_getCode", [addr, "latest"])[2:])
    if code:
        L = int.from_bytes(code[-2:], "big")
        meta = code[-2 - L:-2]
        i = meta.find(b"solc")
        if i >= 0:
            solc = ".".join(str(b) for b in meta[i + 5:i + 8])
    r = call("eth_call", [{"to": addr, "data": "0xad5c4648"}, "latest"])  # WETH()
    if len(r) >= 66:
        weth = "0x" + r[-40:]
except Exception:
    pass
print(solc or "-", weth or "-")
