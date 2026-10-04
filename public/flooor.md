---
title: "flooor.fun Plugin"
description: "Query live auction state and submit bids, sign, claim, and settle NFT auctions on flooor.fun using Base MCP send_calls and chain_rpc_request."
tags: [nft, auction, marketplace, base]
name: flooor
version: 0.3.0
integration: onchain-only
chains: [base]
risk: [irreversible]
---

# flooor.fun Plugin

> [!IMPORTANT]
> Run Base MCP onboarding first (see `SKILL.md`). All sign, claim, and sell operations require the user to hold **at least 1 NFT** from the flooor.fun collection. Since the v2 contract upgrade, every NFT signs and claims on its own — a wallet with several NFTs signs/claims once per token, and all of them can go in a single `send_calls` batch. flooor.fun is a continuous NFT auction platform on Base — users bid ETH each epoch, sign during the sign phase to earn pool rewards, and claim their share after the epoch ends.

## Overview

flooor.fun runs a perpetual NFT auction on Base. Each epoch:

1. Users place ETH bids — the highest bidder at settlement wins the NFT.
2. NFT holders sign during the sign phase to register their participation.
3. After the sign phase, NFT holders claim their share of the accumulated fee pool.
4. The NFT owner settles the auction by calling `sellToHighest`, receiving 95% of the winning bid. Of the 5% fee, 4.5% goes to the community pool and 0.5% to the protocol.

**Contract:** `0xD53292182A342953f446CD4D10Dc177776044306` on Base
**NFT Collection:** resolved at runtime via `collectionId()` read

No external API is required. All interactions use Base MCP `chain_rpc_request` for reads and `send_calls` for writes.

---

## Agent Wallet (recommended, one-time setup)

For frictionless repeat use — especially `signOrClaim` which runs every epoch — set up an agent wallet so the agent can submit transactions without a browser approval each time.

**Setup (user action, one-time):**

1. Open Base Account at `keys.coinbase.com` → Agents / Spend Permissions
2. Create an agent key (or import the agent's pubkey if provided)
3. Configure spend policy with these limits:
   - **Allowed contract:** `0xD53292182A342953f446CD4D10Dc177776044306`
   - **Allowed selectors:** `0x4abd3ac1` (`signOrClaim`)
   - **Max value per call:** `0`
   - **Chain:** Base mainnet
   - **Optional:** daily call limit (e.g. 2 × number of NFTs per day — one sign + one claim per token per epoch)
4. Sign the delegation transaction in Base Account

**Important:** Do NOT include `0x0d489fd4` (`sellToHighest`) in the agent's allowed selectors. Settlement is irreversible and must remain under explicit user approval.

**Agent verification (before every write):**

Call Base MCP `get_wallets`. Then:

- `agentWallets[]` is empty OR no entry with `inSession: true` → fall back to Base Account approval flow (default `send_calls` behavior)
- `agentWallets[].inSession == true` AND its spend policy covers the target call → submit `send_calls` with that `agentWalletId`. No approval URL is generated; the call executes immediately.

If the agent wallet exists but the call is outside its policy (e.g. `sellToHighest`, or value > 0), do NOT attempt to use it — route through Base Account approval instead.

---

## Pre-check (required before ALL write operations)

Before executing sign, claim, or sellToHighest, the agent **must** verify the user holds at least 1 NFT from the collection and resolve their token IDs.

**Step 1 — Resolve collection address:**

Call `chain_rpc_request` with `eth_call`:
```json
{ "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "0x3d26bb67" }
```
Decode result as `address` → this is the NFT collection contract (`collectionId`).

**Step 2 — Check user's NFT balance:**

Call `balanceOf(userAddress)` on the collection contract (selector `0x70a08231`):
```json
{ "to": "<collectionId>", "data": "0x70a08231" + "<userAddress 32-byte zero-padded>" }
```
Decode as `uint256`.

- **0** → Stop: *"You don't own any NFTs from this collection."*
- **N ≥ 1** → Continue. Resolve each `tokenId` via `tokenOfOwnerByIndex(userAddress, i)` (selector `0x2f745c59`) for `i = 0 … N-1`. Decode as `uint256`.

**Step 3 — Per-token status (sign / claim only):**

Read `currentEpochStart()` (`0x61a8c8c4`), then for each `tokenId`:
- `isTokenSigned(epochStart, tokenId)` (`0x3da097b1`) → `bool`
- `isTokenClaimed(epochStart, tokenId)` (`0x6c4684df`) → `bool`

Sign only tokens that are not signed yet; claim only tokens that are signed and not claimed. Including an ineligible token reverts the whole batch.

---

## 1. Read — Auction Status

User intent: *"What's the current bid?", "Who's winning?", "Show auction status", "What epoch are we on?"*

Use Base MCP `chain_rpc_request` → `eth_call` on Base (`chainId: "0x2105"`):

| Field | Selector | Returns |
|---|---|---|
| Highest bid amount | `0xf6535778` | `uint256` wei → divide by 1e18 for ETH |
| Highest bidder | `0x16338ce2` | `address` |
| Next minimum bid | `0xc030b03f` | `uint256` wei |
| Current epoch ID | `0xeacdc5ff` | `uint256` |
| Is sign phase active | `0x73c87a52` | `bool` |
| Accumulated fee pool | `0xd8e84946` | `uint256` wei → divide by 1e18 for ETH |

Call format:
```json
{
  "method": "eth_call",
  "params": [
    { "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "<selector>" },
    "latest"
  ],
  "chainId": "0x2105"
}
```

Present `activebidAM` and `nextMinBid` in ETH (not wei). Show `activeBidder` as a shortened address.

---

## 2. Write — Sign

User intent: *"Sign", "Sign for this epoch", "Participate in current epoch"*

1. Run Pre-check → resolve token IDs, keep those with `isTokenSigned == false`.
2. Read `isSignPhase()` (`0x73c87a52`) → must return `true`. If `false`, stop: *"The sign phase is not active right now. Wait for the current auction to settle."*
3. Check agent wallet via `get_wallets`:
   - **Agent in session + policy covers signOrClaim** → submit immediately without confirmation. No approval URL.
   - **No agent / out of policy** → confirm with user: *"Sign for epoch [epochId] with tokens [tokenIds]?"* then submit; surface approval URL.
4. Submit via Base MCP `send_calls` — one call per eligible token, all in the same batch:

```json
{
  "chain": "base",
  "calls": [
    { "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "0x4abd3ac1" + "<tokenId #1 as 32-byte zero-padded hex>", "value": "0x0" },
    { "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "0x4abd3ac1" + "<tokenId #2 as 32-byte zero-padded hex>", "value": "0x0" }
  ]
}
```

Confirm success via `get_request_status` after submission.

---

## 3. Write — Claim

User intent: *"Claim my reward", "Claim my share", "Collect my earnings", "Claim pool rewards"*

1. Run Pre-check → resolve token IDs, keep those with `isTokenSigned == true` and `isTokenClaimed == false`.
2. Read `isSignPhase()` (`0x73c87a52`) → must return `false`. If `true`, stop: *"Claim phase is not active yet. Wait for the sign phase to end."*
3. Check agent wallet via `get_wallets`:
   - **Agent in session + policy covers signOrClaim** → submit immediately without confirmation. No approval URL.
   - **No agent / out of policy** → confirm with user: *"Claim pool rewards for epoch [epochId] with tokens [tokenIds]?"* then submit; surface approval URL.
4. Submit via Base MCP `send_calls` — one call per eligible token, all in the same batch:

```json
{
  "chain": "base",
  "calls": [
    { "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "0x4abd3ac1" + "<tokenId #1 as 32-byte zero-padded hex>", "value": "0x0" },
    { "to": "0xD53292182A342953f446CD4D10Dc177776044306", "data": "0x4abd3ac1" + "<tokenId #2 as 32-byte zero-padded hex>", "value": "0x0" }
  ]
}
```

Confirm success via `get_request_status` after submission.

---

## 4. Write — Sell to Highest Bidder

User intent: *"Settle the auction", "Sell my NFT", "Sell to highest bidder", "Close the auction"*

This is the primary settlement function. When called by the NFT owner, it:
- Transfers the NFT to the highest bidder
- Sends 95% of the winning bid to the seller
- Adds 4.5% to the community pool and sends 0.5% to the protocol

**Always requires explicit user approval — never auto-executed even when an agent wallet is in session.**

1. Run Pre-check → resolve token IDs. With exactly 1 NFT, use it automatically; with several, ask the user which one to sell.
2. Read current auction state: show `activebidAM` (in ETH) and `activeBidder` so user knows what they will receive.
3. Confirm with user: *"Settle auction for token [tokenId]? You will receive [amount] ETH (95% of the winning bid)."*
4. On confirmation, submit via Base MCP `send_calls`:

```json
{
  "chain": "base",
  "calls": [{
    "to": "0xD53292182A342953f446CD4D10Dc177776044306",
    "data": "0x0d489fd4" + "<tokenId as 32-byte zero-padded hex>",
    "value": "0x0"
  }]
}
```

Surface the approval URL as "Approve Transaction". Confirm success via `get_request_status` after user acts.

---

## Routing Table

| User says | Action |
|---|---|
| "current bid", "who's winning", "auction status", "what epoch" | Read `activebidAM` + `activeBidder` + `nextMinBid` + `currentEpochId` |
| "sign", "participate", "sign for epoch" | Pre-check → `isSignPhase` true → check agent wallet → `signOrClaim(tokenId)` (silent if agent in session) |
| "claim", "claim reward", "collect", "claim pool" | Pre-check → `isSignPhase` false → check agent wallet → `signOrClaim(tokenId)` (silent if agent in session) |
| "sell", "settle", "sell to highest", "close auction" | Pre-check → show bid amount → confirm → `sellToHighest(tokenId)` (always approval flow) |
| "set up agent", "auto sign", "no more approvals" | Walk user through Agent Wallet setup section |

---

## Function Reference

| Function | Selector | Type | Parameters |
|---|---|---|---|
| `activebidAM()` | `0xf6535778` | read | — |
| `activeBidder()` | `0x16338ce2` | read | — |
| `nextMinBid()` | `0xc030b03f` | read | — |
| `currentEpochId()` | `0xeacdc5ff` | read | — |
| `isSignPhase()` | `0x73c87a52` | read | — |
| `poolAccrued()` | `0xd8e84946` | read | — |
| `collectionId()` | `0x3d26bb67` | read | — |
| `currentEpochStart()` | `0x61a8c8c4` | read | — |
| `isTokenSigned(uint256,uint256)` | `0x3da097b1` | read | epochStart, tokenId |
| `isTokenClaimed(uint256,uint256)` | `0x6c4684df` | read | epochStart, tokenId |
| `signOrClaim(uint256)` | `0x4abd3ac1` | write | tokenId |
| `sellToHighest(uint256)` | `0x0d489fd4` | write | tokenId |
| `balanceOf(address)` [collection] | `0x70a08231` | read | owner address |
| `tokenOfOwnerByIndex(address,uint256)` [collection] | `0x2f745c59` | read | owner, index |

---

## Risks & Warnings

- `irreversible`: Once `sellToHighest` is approved, the NFT is transferred and ETH is distributed — this cannot be undone. Always confirm bid amount and recipient before submitting. Never include this selector in an agent wallet spend policy.
- Always run the Pre-check before any write operation. Signing an already-signed token, or claiming an unsigned/claimed one, reverts — and in a batch it reverts every call.
- Do not report success until Base MCP `get_request_status` confirms completion.
- When using an agent wallet, the user has pre-authorized `signOrClaim` calls within their configured spend policy. Stay strictly within that policy — if a call would exceed policy bounds (different selector, non-zero value, daily limit hit), fall back to Base Account approval.
