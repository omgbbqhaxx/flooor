"use client";

// Nouns market on Ethereum mainnet — the v2 (token-based) flooor contract.
// Every wagmi call below passes chainId: mainnet.id; without it wagmi silently
// falls back to config.chains[0] (Base) and reads/writes the wrong chain.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import { getBalance, getEnsName, readContract, readContracts, writeContract } from "wagmi/actions";
import { mainnet } from "wagmi/chains";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatEther, parseAbi, parseEther, type Abi, type Address } from "viem";
import { toast } from "sonner";
import MARKET_ABI_JSON from "@/app/abi/nouns.json";
import { awaitTx } from "@/app/lib/awaitTx";
import { batchApproveAndSell } from "@/app/lib/approveAndSell";
import { guardSignOrClaim } from "@/app/lib/signGuard";
import {
  EYEBROW,
  FAINT,
  HEADLINE,
  LINK,
  LIVE_GREEN,
  NOUNS_MARKET,
  NOUNS_TOKEN,
  SNOW,
  SUBTLE,
  TEXT,
  WHITE,
} from "./palette";

const CHAIN_ID = mainnet.id;
const MARKET_ABI = MARKET_ABI_JSON as Abi;
const NOUNS_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function approve(address to, uint256 tokenId)",
]);
const ZERO = "0x0000000000000000000000000000000000000000";
const market = { address: NOUNS_MARKET, abi: MARKET_ABI, chainId: CHAIN_ID } as const;
const nouns = { address: NOUNS_TOKEN, abi: NOUNS_ABI, chainId: CHAIN_ID } as const;

type MarketState = {
  phase: "SIGN" | "CLAIM";
  remaining: number;
  epochStart: bigint;
  vault: bigint;
  signers: bigint;
  bid: bigint;
  bidder: Address;
  minBid: bigint;
  nextMinBid: bigint;
};

type OwnedNoun = {
  id: bigint;
  image: string | null;
  approved: boolean;
  signed: boolean;
  claimed: boolean;
};

const isUserRejected = (error: unknown): boolean => {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return msg.includes("user rejected") || msg.includes("user denied") || msg.includes("rejected the request");
};

// Nouns tokenURI is fully on-chain: data:application/json;base64 → image is a
// data:image/svg+xml URI.
const decodeImage = (uri: string): string | null => {
  try {
    const json = JSON.parse(atob(uri.slice(uri.indexOf(",") + 1)));
    return typeof json.image === "string" ? json.image : null;
  } catch {
    return null;
  }
};

const fmtEth = (wei: bigint): string => {
  const n = parseFloat(formatEther(wei));
  if (n === 0) return "0";
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.001) return n.toFixed(4);
  return n.toFixed(6);
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const formatClock = (s: number) =>
  [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((v) => String(v).padStart(2, "0")).join(":");

export default function NounsMarket() {
  const config = useConfig();
  const { address, chain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

  const [state, setState] = useState<MarketState | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [bidderName, setBidderName] = useState<string>("");
  const [ethUsd, setEthUsd] = useState<number | null>(null);
  const [owned, setOwned] = useState<OwnedNoun[] | null>(null);
  const [bidInput, setBidInput] = useState("");
  const [bidding, setBidding] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageCache = useRef<Record<string, string>>({});

  const loadMarket = useCallback(async () => {
    try {
      const [phaseInfo, epochStart, accrued, bid, bidder, minBid, nextMinBid] = (await readContracts(config, {
        allowFailure: false,
        contracts: [
          { ...market, functionName: "getPhaseInfo" },
          { ...market, functionName: "currentEpochStart" },
          { ...market, functionName: "poolAccrued" },
          { ...market, functionName: "activebidAM" },
          { ...market, functionName: "activeBidder" },
          { ...market, functionName: "minbidAM" },
          { ...market, functionName: "nextMinBid" },
        ],
      })) as [[string, bigint, bigint, bigint], bigint, bigint, bigint, Address, bigint, bigint];
      const [snap, signers] = (await readContracts(config, {
        allowFailure: false,
        contracts: [
          { ...market, functionName: "poolSnap", args: [epochStart] },
          { ...market, functionName: "partCount", args: [epochStart] },
        ],
      })) as [bigint, bigint];
      // After the first claim the pool is locked into poolSnap and poolAccrued
      // resets to 0 — show the snapshot when there is one.
      const vault = snap > BigInt(0) ? snap : accrued;
      setState({
        phase: phaseInfo[0] === "SIGN" ? "SIGN" : "CLAIM",
        remaining: Number(phaseInfo[3]),
        epochStart,
        vault,
        signers,
        bid,
        bidder,
        minBid,
        nextMinBid,
      });
      setRemaining(Number(phaseInfo[3]));
      if (bidder !== ZERO) {
        const ens = await getEnsName(config, { address: bidder, chainId: CHAIN_ID }).catch(() => null);
        setBidderName(ens ?? short(bidder));
      } else {
        setBidderName("");
      }
    } catch (error) {
      // Keep the last good state on a transient RPC error
      console.error("Error loading Nouns market:", error);
    }
  }, [config]);

  const loadOwned = useCallback(
    async (epochStart: bigint | undefined) => {
      if (!address || epochStart === undefined) {
        setOwned(null);
        return;
      }
      try {
        const balance = await readContract(config, { ...nouns, functionName: "balanceOf", args: [address] });
        // Nouns is ERC721Enumerable — no transfer-log scan needed
        const ids = (await readContracts(config, {
          allowFailure: false,
          contracts: Array.from({ length: Number(balance) }, (_, i) => ({
            ...nouns,
            functionName: "tokenOfOwnerByIndex" as const,
            args: [address, BigInt(i)] as const,
          })),
        })) as bigint[];
        const approvedForAll = await readContract(config, {
          ...nouns,
          functionName: "isApprovedForAll",
          args: [address, NOUNS_MARKET],
        });
        const rows = await Promise.all(
          ids.map(async (id): Promise<OwnedNoun> => {
            const key = id.toString();
            const [approvedTo, signed, claimed] = (await readContracts(config, {
              allowFailure: false,
              contracts: [
                { ...nouns, functionName: "getApproved", args: [id] },
                { ...market, functionName: "isTokenSigned", args: [epochStart, id] },
                { ...market, functionName: "isTokenClaimed", args: [epochStart, id] },
              ],
            })) as [Address, boolean, boolean];
            if (!imageCache.current[key]) {
              const uri = await readContract(config, { ...nouns, functionName: "tokenURI", args: [id] }).catch(() => "");
              const image = uri ? decodeImage(uri) : null;
              if (image) imageCache.current[key] = image;
            }
            return {
              id,
              image: imageCache.current[key] ?? null,
              approved: approvedForAll || approvedTo.toLowerCase() === NOUNS_MARKET.toLowerCase(),
              signed,
              claimed,
            };
          }),
        );
        setOwned(rows);
      } catch (error) {
        console.error("Error loading owned Nouns:", error);
      }
    },
    [address, config],
  );

  const refresh = useCallback(async () => {
    await loadMarket();
  }, [loadMarket]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    loadOwned(state?.epochStart);
  }, [loadOwned, state?.epochStart]);

  useEffect(() => {
    const id = setInterval(() => setRemaining((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // Phase flipped — reload so buttons switch between Sign and Claim
  useEffect(() => {
    if (state && remaining === 0) loadMarket();
  }, [remaining, state, loadMarket]);

  useEffect(() => {
    fetch("https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT")
      .then((r) => r.json())
      .then((d) => setEthUsd(parseFloat(d.price)))
      .catch(() => {});
  }, []);

  const usd = (wei: bigint) => {
    if (!ethUsd || wei === BigInt(0)) return null;
    const v = parseFloat(formatEther(wei)) * ethUsd;
    return `$${v.toLocaleString(undefined, { maximumFractionDigits: v < 100 ? 2 : 0 })}`;
  };

  const ensureMainnet = useCallback(async () => {
    if (chain?.id === CHAIN_ID) return;
    try {
      await switchChainAsync({ chainId: CHAIN_ID });
    } catch {
      toast.error("Couldn't switch to Ethereum — please switch manually in your wallet.");
      throw new Error("Please switch to Ethereum mainnet to continue");
    }
  }, [chain?.id, switchChainAsync]);

  const reloadAll = useCallback(async () => {
    await loadMarket();
    await loadOwned(state?.epochStart);
  }, [loadMarket, loadOwned, state?.epochStart]);

  const handleBid = useCallback(async () => {
    if (bidding || !state) return;
    if (!address) {
      openConnectModal?.();
      return;
    }
    const typed = bidInput.trim();
    let value: bigint;
    try {
      value = typed ? parseEther(typed as `${number}`) : state.nextMinBid;
    } catch {
      toast.error("Enter a valid ETH amount.");
      return;
    }
    if (value < state.nextMinBid) {
      toast.error(`Minimum bid is Ξ${fmtEth(state.nextMinBid)}.`);
      return;
    }
    setBidding(true);
    try {
      await ensureMainnet();
      const balance = await getBalance(config, { address, chainId: CHAIN_ID });
      if (balance.value < value) {
        toast.error("Insufficient ETH on Ethereum mainnet for this bid.");
        return;
      }
      const hash = await writeContract(config, {
        ...market,
        functionName: "placeBid",
        value,
        account: address,
      });
      if (!(await awaitTx(config, hash, CHAIN_ID))) return;
      toast.success(`Bid of Ξ${fmtEth(value)} placed.`);
      setBidInput("");
      await loadMarket();
    } catch (error) {
      if (isUserRejected(error)) {
        toast.info("Transaction cancelled.");
        return;
      }
      toast.error(`Bid failed: ${error instanceof Error ? error.message : String(error)}`, { duration: 6000 });
    } finally {
      setBidding(false);
    }
  }, [address, bidInput, bidding, config, ensureMainnet, loadMarket, openConnectModal, state]);

  const handleSell = useCallback(
    async (noun: OwnedNoun) => {
      if (!address || !state) return;
      const key = noun.id.toString();
      if (state.bidder === ZERO || state.bid === BigInt(0)) {
        toast.error("There is no active bid to sell into.");
        return;
      }
      if (state.bid < state.minBid) {
        toast.error(`The top bid is below the minimum price of Ξ${fmtEth(state.minBid)}.`);
        return;
      }
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        await ensureMainnet();
        // Unapproved: approve + sell as one atomic batch (EIP-5792). null means
        // the wallet can't batch atomically → classic two-step flow.
        const batched = noun.approved
          ? null
          : await batchApproveAndSell({
              config,
              account: address,
              chainId: CHAIN_ID,
              collection: NOUNS_TOKEN,
              market: NOUNS_MARKET,
              tokenId: noun.id,
            });
        if (batched === false) return;
        if (batched === null) {
          if (!noun.approved) {
            toast.info(`Approving Noun ${key}…`);
            const approveHash = await writeContract(config, {
              ...nouns,
              functionName: "approve",
              args: [NOUNS_MARKET, noun.id],
              account: address,
            });
            if (!(await awaitTx(config, approveHash, CHAIN_ID))) return;
          }
          const hash = await writeContract(config, {
            ...market,
            functionName: "sellToHighest",
            args: [noun.id],
            account: address,
          });
          if (!(await awaitTx(config, hash, CHAIN_ID))) return;
        }
        toast.success(`Noun ${key} sold for Ξ${fmtEth(state.bid)}.`);
        await reloadAll();
      } catch (error) {
        if (isUserRejected(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        toast.error(`Sell failed: ${error instanceof Error ? error.message : String(error)}`, { duration: 6000 });
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [address, config, ensureMainnet, reloadAll, state],
  );

  // Selling a Noun is irreversible — first tap arms (shows the price), second
  // tap within 5s sells.
  const onSellClick = useCallback(
    (noun: OwnedNoun) => {
      const key = noun.id.toString();
      if (armed === key) {
        if (armTimer.current) clearTimeout(armTimer.current);
        setArmed(null);
        handleSell(noun);
        return;
      }
      if (address && state?.bidder.toLowerCase() === address.toLowerCase()) {
        toast.warning("You hold the top bid — selling would send the Noun back to yourself.");
        return;
      }
      setArmed(key);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 5000);
    },
    [address, armed, handleSell, state?.bidder],
  );

  const handleSignOrClaim = useCallback(
    async (noun: OwnedNoun) => {
      if (!address || !state) return;
      const key = noun.id.toString();
      const signing = state.phase === "SIGN";
      setBusy((b) => ({ ...b, [key]: true }));
      try {
        await ensureMainnet();
        // Open the wallet only if the simulation passes — no red "will fail" prompts
        const guard = await guardSignOrClaim({
          config,
          contract: NOUNS_MARKET,
          abi: MARKET_ABI,
          tokenId: noun.id,
          account: address,
          chainId: CHAIN_ID,
        });
        if (!guard.ok) {
          toast.warning(guard.message, { duration: 6000 });
          return;
        }
        const hash = await writeContract(config, {
          ...market,
          functionName: "signOrClaim",
          args: [noun.id],
          account: address,
        });
        if (!(await awaitTx(config, hash, CHAIN_ID))) return;
        toast.success(signing ? `Noun ${key} signed for today.` : `Claimed your share with Noun ${key}.`);
        await reloadAll();
      } catch (error) {
        if (isUserRejected(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        toast.error(`${signing ? "Sign" : "Claim"} failed: ${error instanceof Error ? error.message : String(error)}`, {
          duration: 6000,
        });
      } finally {
        setBusy((b) => ({ ...b, [key]: false }));
      }
    },
    [address, config, ensureMainnet, reloadAll, state],
  );

  const hasBid = !!state && state.bidder !== ZERO && state.bid > BigInt(0);
  const share = state && state.signers > BigInt(0) ? state.vault / state.signers : BigInt(0);
  const wrongChain = !!address && chain?.id !== CHAIN_ID;

  const pill = (bg: string, fg: string) =>
    ({ backgroundColor: bg, color: fg, fontSize: "15px", fontWeight: 500, padding: "10px 20px" }) as const;

  return (
    <section id="market" className="mt-28 scroll-mt-24">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="flex items-center gap-2" style={{ ...EYEBROW, color: LIVE_GREEN }}>
            <span aria-hidden="true" className="rounded-full" style={{ width: 7, height: 7, backgroundColor: LIVE_GREEN }} />
            Live on Ethereum
          </p>
          <h2 className="mt-2" style={{ ...HEADLINE, fontSize: "clamp(32px, 5vw, 48px)" }}>
            The Nouns market.
          </h2>
        </div>
        <a
          href={`https://etherscan.io/address/${NOUNS_MARKET}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:inline hover:underline shrink-0 tabular-nums"
          style={{ color: LINK, fontSize: "15px" }}
        >
          Contract {short(NOUNS_MARKET)}
        </a>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        {/* Top bid + bid form */}
        <div className="rounded-[28px] p-8" style={{ backgroundColor: SNOW }}>
          <p style={EYEBROW}>Top bid</p>
          <p className="mt-2 tabular-nums" style={{ ...HEADLINE, fontSize: "clamp(40px, 6vw, 56px)" }}>
            {state ? (hasBid ? `Ξ ${fmtEth(state.bid)}` : "No bids yet") : "—"}
          </p>
          <p className="mt-2" style={{ fontSize: "15px", color: SUBTLE }}>
            {hasBid ? (
              <>
                {usd(state!.bid) && <span className="tabular-nums">{usd(state!.bid)} · </span>}
                by{" "}
                <a
                  href={`https://etherscan.io/address/${state!.bidder}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: LINK }}
                >
                  {bidderName || short(state!.bidder)}
                </a>
              </>
            ) : (
              "Be the first to set the flooor for a Noun."
            )}
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <label className="flex-1 flex items-center rounded-full px-5" style={{ backgroundColor: WHITE }}>
              <span aria-hidden="true" style={{ color: FAINT, fontSize: "17px" }}>
                Ξ
              </span>
              <input
                inputMode="decimal"
                value={bidInput}
                onChange={(e) => setBidInput(e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, ""))}
                placeholder={state ? fmtEth(state.nextMinBid) : "0.0"}
                aria-label="Bid amount in ETH"
                className="w-full bg-transparent outline-none py-3 pl-2 tabular-nums"
                style={{ fontSize: "17px", color: TEXT }}
              />
            </label>
            <button
              type="button"
              onClick={handleBid}
              disabled={bidding || !state}
              className="rounded-full transition-opacity hover:opacity-85 disabled:opacity-50"
              style={{ ...pill(LINK, WHITE), fontSize: "17px", padding: "12px 28px" }}
            >
              {!address ? "Connect to bid" : wrongChain ? "Switch to Ethereum" : bidding ? "Bidding…" : "Place bid"}
            </button>
          </div>
          <p className="mt-3" style={{ fontSize: "13px", color: FAINT }}>
            {state ? `Minimum next bid Ξ${fmtEth(state.nextMinBid)}. ` : ""}
            Outbid? Your ETH comes straight back to your wallet.
          </p>
        </div>

        {/* Daily vault */}
        <div className="rounded-[28px] p-8 flex flex-col" style={{ backgroundColor: SNOW }}>
          <p style={EYEBROW}>Daily vault</p>
          <p className="mt-2 tabular-nums" style={{ ...HEADLINE, fontSize: "40px" }}>
            {state ? `Ξ ${fmtEth(state.vault)}` : "—"}
          </p>
          <p className="mt-1 tabular-nums" style={{ fontSize: "15px", color: SUBTLE }}>
            {state && usd(state.vault) ? `${usd(state.vault)} · ` : ""}every sale feeds the vault
          </p>
          <dl className="mt-auto pt-7 grid grid-cols-3 gap-3">
            {[
              { k: "Phase", v: state ? (state.phase === "SIGN" ? "Sign" : "Claim") : "—" },
              { k: "Ends in", v: state ? formatClock(remaining) : "—" },
              { k: "Signers", v: state ? state.signers.toString() : "—" },
            ].map((row) => (
              <div key={row.k}>
                <dt style={{ fontSize: "12px", color: FAINT }}>{row.k}</dt>
                <dd className="mt-1 tabular-nums" style={{ fontSize: "17px", fontWeight: 600 }}>
                  {row.v}
                </dd>
              </div>
            ))}
          </dl>
          {state?.phase === "CLAIM" && share > BigInt(0) && (
            <p className="mt-4 tabular-nums" style={{ fontSize: "13px", color: SUBTLE }}>
              Ξ{fmtEth(share)} per signed Noun this epoch.
            </p>
          )}
        </div>
      </div>

      {/* Your Nouns */}
      <div className="mt-12">
        <h3 style={{ ...HEADLINE, fontSize: "28px" }}>Your Nouns</h3>
        {!address ? (
          <div className="mt-5 rounded-[28px] p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5" style={{ backgroundColor: SNOW }}>
            <p style={{ fontSize: "17px", color: SUBTLE }}>
              Connect a wallet that holds a Noun to sell into the top bid, sign daily, and claim your share.
            </p>
            <button
              type="button"
              onClick={() => openConnectModal?.()}
              className="rounded-full shrink-0 transition-opacity hover:opacity-85"
              style={pill(LINK, WHITE)}
            >
              Connect wallet
            </button>
          </div>
        ) : owned === null ? (
          <p className="mt-5" style={{ fontSize: "15px", color: FAINT }}>
            Loading your Nouns…
          </p>
        ) : owned.length === 0 ? (
          <p className="mt-5" style={{ fontSize: "17px", color: SUBTLE }}>
            No Nouns in {short(address)}. Pick one up on{" "}
            <a href="https://nouns.wtf" target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: LINK }}>
              nouns.wtf
            </a>{" "}
            or bid on the flooor above.
          </p>
        ) : (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {owned.map((noun) => {
              const key = noun.id.toString();
              const isBusy = !!busy[key];
              const signing = state?.phase === "SIGN";
              const canAct = signing ? !noun.signed : noun.signed && !noun.claimed;
              const status = signing
                ? noun.signed
                  ? "Signed for today"
                  : null
                : noun.claimed
                  ? "Claimed"
                  : noun.signed
                    ? null
                    : "Not signed this epoch";
              return (
                <div key={key} className="rounded-[28px] overflow-hidden" style={{ backgroundColor: SNOW }}>
                  {noun.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={noun.image}
                      alt={`Noun ${key}`}
                      width={320}
                      height={320}
                      className="block w-full h-auto"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <div className="aspect-square" style={{ backgroundColor: "#E8E8ED" }} />
                  )}
                  <div className="p-5">
                    <p style={{ ...HEADLINE, fontSize: "22px" }}>Noun {key}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => onSellClick(noun)}
                        disabled={isBusy || !hasBid}
                        className="rounded-full transition-opacity hover:opacity-85 disabled:opacity-40 tabular-nums"
                        style={armed === key ? pill("#D70015", WHITE) : pill(TEXT, WHITE)}
                      >
                        {armed === key
                          ? `Tap again to sell for Ξ${state ? fmtEth(state.bid) : ""}`
                          : hasBid
                            ? `Sell for Ξ${fmtEth(state!.bid)}`
                            : "No bid to sell into"}
                      </button>
                      {canAct && (
                        <button
                          type="button"
                          onClick={() => handleSignOrClaim(noun)}
                          disabled={isBusy}
                          className="rounded-full transition-opacity hover:opacity-85 disabled:opacity-40"
                          style={pill(LINK, WHITE)}
                        >
                          {isBusy ? "Confirm in wallet…" : signing ? "Daily Sign" : "Claim"}
                        </button>
                      )}
                    </div>
                    {status && (
                      <p className="mt-3" style={{ fontSize: "13px", color: FAINT }}>
                        {status}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
