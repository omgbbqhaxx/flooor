"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import Link from "next/link";

import { useState, useCallback, useEffect } from "react";
import { useConfig, useAccount, useSwitchChain } from "wagmi";
import { writeContract, readContract } from "wagmi/actions";
import { base } from "wagmi/chains";
import {
  parseEther,
  formatEther,
  keccak256,
  encodePacked,
  namehash,
  toHex,
  type Address,
} from "viem";
import { Attribution } from "ox/erc8021";
import { Playfair_Display, Inter } from "next/font/google";

import WARPLETS_ABI from "@/app/abi/warplets.json";
import NFT_ABI from "@/app/abi/nft.json";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const BUILDER_CODE = "bc_uzb9vqpt";
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

const retryWithBackoff = async (
  fn: () => Promise<unknown>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<unknown> => {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) throw lastError;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isRetryableError =
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests") ||
        errorMessage.includes("ERR_CONNECTION_RESET") ||
        errorMessage.includes("ERR_TIMED_OUT") ||
        errorMessage.includes("timeout");
      if (!isRetryableError) throw lastError;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
};

// warpletsv2 (app/contracts/warplets.sol) henüz deploy edilmedi.
// Deploy edildiğinde gerçek adresi buraya yaz — sıfır adres olduğu sürece
// sayfa "Coming Soon" moda düşer ve zincir çağrısı yapmaz.
const CONTRACT_ADDR = "0x0000000000000000000000000000000000000000" as const;
const COLLECTION_ADDR = "0x699727F9E01A822EFdcf7333073f0461e5914b4E" as const;
const MINIMUM_BID_FOR_SELL = 0.015;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const IS_DEPLOYED = CONTRACT_ADDR.toLowerCase() !== ZERO_ADDRESS;

const BASENAME_L2_RESOLVER_ADDRESS = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const L2_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const convertChainIdToCoinType = (chainId: number): string => {
  const coinType = (0x80000000 | chainId) >>> 0;
  return coinType.toString(16).toUpperCase();
};

const convertReverseNodeToBytes = (address: Address, chainId: number) => {
  const addressFormatted = address.toLowerCase().substring(2);
  const addressNode = keccak256(toHex(addressFormatted));
  const baseReverseNode = namehash(`${convertChainIdToCoinType(chainId)}.reverse`);
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]),
  );
};

const INK = "#1A1A1A";
const MUTED = "#75716A";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";
const GREEN = "#1E7B4F";

const SERIF = { fontFamily: "var(--font-serif)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;
const smallCaps = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MUTED,
} as const;

type PhaseInfo = {
  currentPhase: string;
  eid: bigint;
  elapsed: bigint;
  remaining: bigint;
};

export default function WarpletsPage() {
  const config = useConfig();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain: switchChainHook } = useSwitchChain();

  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const [dailySigners, setDailySigners] = useState<number>(0);
  const [dailyVault, setDailyVault] = useState<string>("0");
  const [currentBid, setCurrentBid] = useState<string>("0");
  const [activeBidder, setActiveBidder] = useState<string>("");
  const [activeBidderName, setActiveBidderName] = useState<string>("");
  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [nftImages, setNftImages] = useState<{ [key: string]: string }>({});
  const [nftApprovalStatus, setNftApprovalStatus] = useState<{ [key: string]: boolean }>({});
  const [nftSignedStatus, setNftSignedStatus] = useState<{ [key: string]: boolean }>({});
  const [nftClaimedStatus, setNftClaimedStatus] = useState<{ [key: string]: boolean }>({});
  const [nftBusy, setNftBusy] = useState<{ [key: string]: boolean }>({});
  const [pendingSellTokenId, setPendingSellTokenId] = useState<bigint | null>(null);
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      );
      const data = await res.json();
      setEthPrice(parseFloat(data.price));
    } catch {
      // sessizce geç, fiyat null kalır
    }
  }, []);

  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEthPrice]);

  const toUsd = useCallback(
    (eth: string) => {
      if (!ethPrice) return null;
      const val = parseFloat(eth) * ethPrice;
      if (isNaN(val) || val === 0) return null;
      return val < 0.01 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
    },
    [ethPrice],
  );

  const ensureBase = useCallback(async () => {
    if (connectedChain?.id !== base.id) {
      try {
        switchChainHook({ chainId: base.id });
      } catch (error) {
        console.error("Failed to switch network:", error);
        throw new Error("Please switch to Base network to continue");
      }
    }
  }, [connectedChain, switchChainHook]);

  const getPhaseInfo = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const info = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "getPhaseInfo",
          args: [],
        })) as [string, bigint, bigint, bigint];
      })) as [string, bigint, bigint, bigint];
      const [currentPhase, eid, elapsed, remaining] = info;
      setPhaseInfo({ currentPhase, eid, elapsed, remaining });
      setRemainingTimeDisplay(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  const getDailySigners = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const currentEpochStart = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      })) as bigint;
      const signersCount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "partCount",
          args: [currentEpochStart],
        })) as bigint;
      })) as bigint;
      setDailySigners(Number(signersCount));
    } catch (error) {
      console.error("Error getting daily signers:", error);
    }
  }, [config]);

  const getDailyVault = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const poolAccrued = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "poolAccrued",
          args: [],
        })) as bigint;
      })) as bigint;
      setDailyVault(parseFloat(formatEther(poolAccrued)).toFixed(8));
    } catch (error) {
      console.error("Error getting daily vault:", error);
    }
  }, [config]);

  const getCurrentBid = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const activeBidAmount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "activebidAM",
          args: [],
        })) as bigint;
      })) as bigint;
      setCurrentBid(parseFloat(formatEther(activeBidAmount)).toFixed(8));
    } catch (error) {
      console.error("Error getting current bid:", error);
    }
  }, [config]);

  const getActiveBidder = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const bidderAddress = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "activeBidder",
          args: [],
        })) as string;
      })) as string;
      setActiveBidder(bidderAddress);
      if (bidderAddress && bidderAddress !== ZERO_ADDRESS) {
        try {
          const baseName = (await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: BASENAME_L2_RESOLVER_ADDRESS,
              abi: L2_RESOLVER_ABI,
              functionName: "name",
              args: [convertReverseNodeToBytes(bidderAddress as Address, base.id)],
              chainId: base.id,
            })) as string;
          })) as string;
          setActiveBidderName(
            baseName && baseName !== ""
              ? baseName
              : `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
          );
        } catch {
          setActiveBidderName(
            `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
          );
        }
      } else {
        setActiveBidderName("");
      }
    } catch (error) {
      console.error("Error getting active bidder:", error);
      setActiveBidder("");
      setActiveBidderName("");
    }
  }, [config]);

  const getUserNFTs = useCallback(async () => {
    if (!address || !config) {
      setUserNFTs([]);
      return;
    }
    try {
      const balance = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
      })) as bigint;
      const count = Number(balance);
      const ids: bigint[] = [];
      for (let i = 0; i < count; i++) {
        const tokenId = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [address, BigInt(i)],
          })) as bigint;
        })) as bigint;
        ids.push(tokenId);
      }
      setUserNFTs(ids);
    } catch (error) {
      console.error("Error getting user NFTs:", error);
      setUserNFTs([]);
    }
  }, [address, config]);

  const decodeTokenImage = (tokenURI: string): string | null => {
    try {
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const jsonData = JSON.parse(atob(tokenURI.split(",")[1]));
        if (jsonData.image_data) {
          return `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
        }
        if (jsonData.image) return resolveUri(jsonData.image);
        return null;
      }
      return resolveUri(tokenURI);
    } catch {
      return null;
    }
  };

  const resolveUri = (uri: string): string => {
    if (uri.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
    }
    return uri;
  };

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) {
      setNftImages({});
      return;
    }
    const images: { [key: string]: string } = {};
    for (const id of userNFTs) {
      const idStr = id.toString();
      try {
        const tokenURI = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "tokenURI",
            args: [id],
          })) as string;
        })) as string;
        if (tokenURI.startsWith("http") || tokenURI.startsWith("ipfs://")) {
          try {
            const res = await fetch(resolveUri(tokenURI));
            const meta = await res.json();
            if (meta.image) images[idStr] = resolveUri(meta.image);
          } catch {
            // metadata çekilemedi, görsel atlanır
          }
        } else {
          const image = decodeTokenImage(tokenURI);
          if (image) images[idStr] = image;
        }
      } catch (error) {
        console.error(`Error getting image for token ${idStr}:`, error);
      }
    }
    setNftImages(images);
  }, [userNFTs, config]);

  const checkApprovalStatus = useCallback(async () => {
    if (!address || userNFTs.length === 0) {
      setNftApprovalStatus({});
      return;
    }
    const approvalStatus: { [key: string]: boolean } = {};
    let isAllApproved = false;
    try {
      isAllApproved = (await retryWithBackoff(async () => {
        return await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
        });
      })) as boolean;
    } catch (error) {
      console.error("Error checking isApprovedForAll:", error);
    }
    if (isAllApproved) {
      for (const id of userNFTs) approvalStatus[id.toString()] = true;
    } else {
      for (const id of userNFTs) {
        const idStr = id.toString();
        try {
          const approvedAddress = (await retryWithBackoff(async () => {
            return await readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "getApproved",
              args: [id],
            });
          })) as string;
          approvalStatus[idStr] = approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase();
        } catch (error) {
          console.error(`Error checking approval for token ${idStr}:`, error);
          approvalStatus[idStr] = false;
        }
      }
    }
    setNftApprovalStatus(approvalStatus);
  }, [config, address, userNFTs]);

  const checkSignClaimStatus = useCallback(async () => {
    if (!IS_DEPLOYED || !userNFTs.length) {
      setNftSignedStatus({});
      setNftClaimedStatus({});
      return;
    }
    try {
      const currentEpochStart = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      })) as bigint;
      const signed: { [key: string]: boolean } = {};
      const claimed: { [key: string]: boolean } = {};
      for (const id of userNFTs) {
        const idStr = id.toString();
        signed[idStr] = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: WARPLETS_ABI,
            functionName: "isTokenSigned",
            args: [currentEpochStart, id],
          })) as boolean;
        })) as boolean;
        claimed[idStr] = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: WARPLETS_ABI,
            functionName: "isTokenClaimed",
            args: [currentEpochStart, id],
          })) as boolean;
        })) as boolean;
      }
      setNftSignedStatus(signed);
      setNftClaimedStatus(claimed);
    } catch (error) {
      console.error("Error checking sign/claim status:", error);
    }
  }, [config, userNFTs]);

  useEffect(() => {
    getUserNFTs();
  }, [getUserNFTs]);

  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);

  useEffect(() => {
    checkApprovalStatus();
    checkSignClaimStatus();
  }, [checkApprovalStatus, checkSignClaimStatus]);

  const fetchAllData = useCallback(async () => {
    await Promise.allSettled([
      getPhaseInfo(),
      getDailySigners(),
      getDailyVault(),
      getCurrentBid(),
      getActiveBidder(),
      getUserNFTs(),
    ]);
  }, [getPhaseInfo, getDailySigners, getDailyVault, getCurrentBid, getActiveBidder, getUserNFTs]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) return 0;
        if (prev === 1) getPhaseInfo();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTimeRemaining = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  const isSignPhase = phaseInfo?.currentPhase.toLowerCase().includes("sign") ?? false;

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const firstDotIndex = nextValue.indexOf(".");
      if (firstDotIndex !== -1) {
        nextValue =
          nextValue.slice(0, firstDotIndex + 1) +
          nextValue.slice(firstDotIndex + 1).replace(/\./g, "");
      }
      if (nextValue.startsWith(".")) nextValue = `0${nextValue}`;
      setBidInput(nextValue);
      setBidError(false);
    },
    [],
  );

  const handleBid = useCallback(async () => {
    if (!IS_DEPLOYED) {
      toast.info("Warplets contract is not live yet — stay tuned.");
      return;
    }
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    if (connectedChain?.id !== base.id) {
      toast.error("Please switch to Base network first.");
      return;
    }
    const bidAmount = parseFloat(bidInput || "0");
    const currentBidNum = parseFloat(currentBid);
    const hasActiveBid = activeBidder && activeBidder !== ZERO_ADDRESS && currentBidNum > 0;
    const minRequired = hasActiveBid
      ? Math.max(currentBidNum * 1.05, MINIMUM_BID_FOR_SELL)
      : MINIMUM_BID_FOR_SELL;
    if (bidAmount < minRequired) {
      setBidInput("");
      setBidError(true);
      return;
    }
    try {
      await ensureBase();
      const value = parseEther((bidInput || "0") as `${string}`);
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: WARPLETS_ABI,
        functionName: "placeBid",
        args: [],
        value,
        dataSuffix: DATA_SUFFIX,
      });
      toast.success("Bid placed successfully!");
      setTimeout(() => {
        getCurrentBid();
        getActiveBidder();
      }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleBid() },
      });
    }
  }, [config, ensureBase, bidInput, address, connectedChain, currentBid, activeBidder, getCurrentBid, getActiveBidder]);

  const handleSignOrClaim = useCallback(
    async (tokenId: bigint) => {
      if (!IS_DEPLOYED) {
        toast.info("Warplets contract is not live yet — stay tuned.");
        return;
      }
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const idStr = tokenId.toString();
      setNftBusy((prev) => ({ ...prev, [idStr]: true }));
      try {
        await ensureBase();
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "signOrClaim",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(isSignPhase ? `Token #${idStr} signed!` : `Token #${idStr} claimed!`);
        setTimeout(() => {
          checkSignClaimStatus();
          getPhaseInfo();
          getDailyVault();
        }, 2000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Sign/Claim failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSignOrClaim(tokenId) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [idStr]: false }));
      }
    },
    [config, ensureBase, address, isSignPhase, checkSignClaimStatus, getPhaseInfo, getDailyVault],
  );

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!IS_DEPLOYED) {
        toast.info("Warplets contract is not live yet — stay tuned.");
        return;
      }
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const idStr = tokenId.toString();
      try {
        await ensureBase();
        if (parseFloat(currentBid) < MINIMUM_BID_FOR_SELL) {
          toast.error(`Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`);
          return;
        }
        setNftBusy((prev) => ({ ...prev, [idStr]: true }));
        const isApproved = nftApprovalStatus[idStr] === true;
        if (!isApproved) {
          toast.info(`Approving token #${idStr}...`);
          await retryWithBackoff(async () => {
            return await writeContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "setApprovalForAll",
              args: [CONTRACT_ADDR, true],
              dataSuffix: DATA_SUFFIX,
            });
          }, 5, 2000);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await checkApprovalStatus();
        }
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: WARPLETS_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Token #${idStr} sold successfully!`);
        setTimeout(() => {
          getCurrentBid();
          getActiveBidder();
          getDailyVault();
          getUserNFTs();
        }, 2000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Sell failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [idStr]: false }));
      }
    },
    [config, ensureBase, address, nftApprovalStatus, checkApprovalStatus, currentBid, getCurrentBid, getActiveBidder, getDailyVault, getUserNFTs],
  );

  const requestSellNFT = useCallback(
    (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      if (parseFloat(currentBid) < MINIMUM_BID_FOR_SELL) {
        toast.error(`Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`);
        return;
      }
      setPendingSellTokenId(tokenId);
    },
    [address, currentBid],
  );

  const confirmSellNFT = useCallback(() => {
    const tokenId = pendingSellTokenId;
    setPendingSellTokenId(null);
    if (tokenId !== null) handleSellNFT(tokenId);
  }, [pendingSellTokenId, handleSellNFT]);

  const hasBid = activeBidder && activeBidder !== ZERO_ADDRESS && parseFloat(currentBid) > 0;
  const minOutbidAmount = hasBid
    ? Math.max(parseFloat(currentBid) * 1.05, MINIMUM_BID_FOR_SELL)
    : MINIMUM_BID_FOR_SELL;
  const dailyVaultUsd = toUsd(dailyVault);

  return (
    <div
      className={`${playfair.variable} ${inter.variable}`}
      style={{ backgroundColor: IVORY, minHeight: "100vh", color: INK }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor: "rgba(247,245,241,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <Link
            href="/"
            style={{ ...SERIF, fontWeight: 500, fontSize: "26px", letterSpacing: "0.02em", color: INK }}
          >
            Flooor
          </Link>
          <nav className="hidden md:flex items-center gap-10">
            <a href="/warplets" style={{ ...smallCaps, color: INK }}>
              Warplets
            </a>
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              DAO
            </a>
            <a
              href="https://opensea.io/collection/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Collection
            </a>
          </nav>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: INK,
                        color: IVORY,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Connect
                    </button>
                  ) : chain.unsupported ? (
                    <button
                      onClick={openChainModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "#9B1C1C",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "transparent",
                        color: INK,
                        border: `1px solid ${HAIRLINE}`,
                        cursor: "pointer",
                      }}
                    >
                      {account.displayName}
                    </button>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-5 sm:px-8 py-20 flex flex-col items-center text-center">
        <p style={smallCaps}>{IS_DEPLOYED ? "Live on Base" : "Coming Soon"}</p>
        <h1
          style={{
            ...SERIF,
            fontSize: "clamp(40px, 6vw, 72px)",
            fontWeight: 400,
            letterSpacing: "-0.01em",
            lineHeight: 1.1,
            color: INK,
            marginTop: "20px",
            marginBottom: "24px",
          }}
        >
          Warplets
        </h1>
        <p style={{ ...SANS, fontSize: "16px", lineHeight: 1.7, color: MUTED, maxWidth: "480px" }}>
          A new collection on Flooor. Every sale feeds the vault — distributed to holders daily.
        </p>

        {/* Other Collections */}
        <div className="mt-10 pt-10 w-full" style={{ maxWidth: "480px", borderTop: `1px solid ${HAIRLINE}` }}>
          <p style={{ ...smallCaps, textAlign: "left" }}>Other Collections</p>
          <div className="mt-6">
            {[
              { name: "VRNouns", sub: "Base · Onchain", href: "/", floor: "Ξ 0.004" },
              {
                name: "OK Computer",
                sub: "Base",
                img: "https://i2c.seadn.io/base/05d807397e5b420d8b9cc7cb8cb07a0d/549fb12b972ea6f3790a2965d31686/55549fb12b972ea6f3790a2965d31686.gif",
              },
              {
                name: "Based Punks",
                sub: "Base",
                img: "https://gateway.pinata.cloud/ipfs/QmfD5sHPyB2s8UUE1spKU8BaQzNZa22AjD6zUj7wbrPdAD/1279",
              },
            ].map((col) => (
              <div
                key={col.name}
                className="flex items-center justify-between gap-4 py-3.5"
                style={{ borderTop: `1px solid ${HAIRLINE}` }}
              >
                <div className="flex items-center gap-3 text-left">
                  <div
                    className="overflow-hidden flex-shrink-0"
                    style={{ width: "40px", height: "40px", backgroundColor: PLINTH }}
                  >
                    {col.img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={col.img} alt={col.name} className="w-full h-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <p style={{ ...SERIF, fontSize: "15px" }}>{col.name}</p>
                    <p style={{ ...SANS, fontSize: "11px", color: MUTED, marginTop: "2px" }}>{col.sub}</p>
                  </div>
                </div>
                {col.href ? (
                  <a
                    href={col.href}
                    className="text-xs hover:text-black transition-colors whitespace-nowrap"
                    style={{ ...SANS, color: MUTED }}
                  >
                    Floor {col.floor} · Trade →
                  </a>
                ) : (
                  <span className="text-xs whitespace-nowrap" style={{ ...smallCaps, color: MUTED }}>
                    Soon
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {!IS_DEPLOYED && (
          <div
            className="mt-10 px-8 py-6"
            style={{ backgroundColor: PLINTH, border: `1px solid ${HAIRLINE}`, maxWidth: "480px", width: "100%" }}
          >
            <p style={{ ...smallCaps, marginBottom: "8px" }}>Royalties to the community</p>
            <p style={{ ...SANS, fontSize: "14px", color: MUTED, lineHeight: 1.6 }}>
              The Warplets contract is being finalized and isn&apos;t live yet. Connect your wallet to be ready when it ships.
            </p>
          </div>
        )}

        {IS_DEPLOYED && (
          <>
            {/* Phase / vault status */}
            <div
              className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-px w-full"
              style={{ maxWidth: "640px", backgroundColor: HAIRLINE, border: `1px solid ${HAIRLINE}` }}
            >
              <div className="px-6 py-5" style={{ backgroundColor: PLINTH }}>
                <p style={smallCaps}>Phase</p>
                <p style={{ ...SERIF, fontSize: "22px", marginTop: "6px", color: isSignPhase ? GREEN : INK }}>
                  {phaseInfo?.currentPhase ?? "—"}
                </p>
                <p style={{ ...SANS, fontSize: "12px", color: MUTED, marginTop: "4px" }}>
                  {formatTimeRemaining(remainingTimeDisplay)} left
                </p>
              </div>
              <div className="px-6 py-5" style={{ backgroundColor: PLINTH }}>
                <p style={smallCaps}>Daily Vault</p>
                <p style={{ ...SERIF, fontSize: "22px", marginTop: "6px" }}>{dailyVault} ETH</p>
                <p style={{ ...SANS, fontSize: "12px", color: MUTED, marginTop: "4px" }}>
                  {dailyVaultUsd ?? "—"} · {dailySigners} signed
                </p>
              </div>
              <div className="px-6 py-5" style={{ backgroundColor: PLINTH }}>
                <p style={smallCaps}>Highest Bid</p>
                <p style={{ ...SERIF, fontSize: "22px", marginTop: "6px" }}>{currentBid} ETH</p>
                <p style={{ ...SANS, fontSize: "12px", color: MUTED, marginTop: "4px" }}>
                  {activeBidderName || "No bids yet"}
                </p>
              </div>
            </div>

            {/* Bid box */}
            <div className="mt-8 w-full flex flex-col sm:flex-row gap-3 items-center justify-center" style={{ maxWidth: "480px" }}>
              <input
                value={bidInput}
                onChange={handleBidInputChange}
                placeholder={`Min ${minOutbidAmount.toFixed(4)} ETH`}
                style={{
                  ...SANS,
                  fontSize: "14px",
                  padding: "12px 16px",
                  border: `1px solid ${bidError ? "#9B1C1C" : HAIRLINE}`,
                  backgroundColor: "#fff",
                  width: "100%",
                  outline: "none",
                }}
              />
              <button
                onClick={handleBid}
                style={{
                  ...SANS,
                  fontSize: "12px",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "12px 24px",
                  backgroundColor: INK,
                  color: IVORY,
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Place Bid
              </button>
            </div>

            {/* Owned NFTs */}
            <div className="mt-20 w-full" style={{ maxWidth: "900px" }}>
              <p style={smallCaps}>Your Warplets</p>
              {!address ? (
                <p style={{ ...SANS, fontSize: "14px", color: MUTED, marginTop: "16px" }}>
                  Connect your wallet to see your tokens.
                </p>
              ) : userNFTs.length === 0 ? (
                <p style={{ ...SANS, fontSize: "14px", color: MUTED, marginTop: "16px" }}>
                  No Warplets found in this wallet.
                </p>
              ) : (
                <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {userNFTs.map((tokenId) => {
                    const idStr = tokenId.toString();
                    const signed = nftSignedStatus[idStr] === true;
                    const claimed = nftClaimedStatus[idStr] === true;
                    const busy = nftBusy[idStr] === true;
                    const image = nftImages[idStr];
                    const signClaimLabel = isSignPhase
                      ? signed ? "Signed" : "Sign"
                      : signed && !claimed ? "Claim" : claimed ? "Claimed" : "Not signed";
                    const signClaimDisabled =
                      busy || (isSignPhase ? signed : !signed || claimed);
                    return (
                      <div
                        key={idStr}
                        className="flex flex-col"
                        style={{ backgroundColor: PLINTH, border: `1px solid ${HAIRLINE}` }}
                      >
                        <div
                          style={{
                            aspectRatio: "1 / 1",
                            backgroundColor: HAIRLINE,
                            backgroundImage: image ? `url(${image})` : undefined,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                          }}
                        />
                        <div className="px-3 py-3 flex flex-col gap-2">
                          <p style={{ ...SANS, fontSize: "13px", fontWeight: 500 }}>#{idStr}</p>
                          <button
                            onClick={() => handleSignOrClaim(tokenId)}
                            disabled={signClaimDisabled}
                            style={{
                              ...SANS,
                              fontSize: "11px",
                              fontWeight: 500,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              padding: "8px 10px",
                              backgroundColor: signClaimDisabled ? HAIRLINE : INK,
                              color: signClaimDisabled ? MUTED : IVORY,
                              border: "none",
                              cursor: signClaimDisabled ? "default" : "pointer",
                            }}
                          >
                            {busy ? "..." : signClaimLabel}
                          </button>
                          <button
                            onClick={() => requestSellNFT(tokenId)}
                            disabled={busy || !hasBid}
                            style={{
                              ...SANS,
                              fontSize: "11px",
                              fontWeight: 500,
                              letterSpacing: "0.06em",
                              textTransform: "uppercase",
                              padding: "8px 10px",
                              backgroundColor: "transparent",
                              color: !hasBid ? MUTED : INK,
                              border: `1px solid ${HAIRLINE}`,
                              cursor: !hasBid ? "default" : "pointer",
                            }}
                          >
                            Sell to highest
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

      </main>

      {/* Sell confirmation modal */}
      {pendingSellTokenId !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(26,26,26,0.5)" }}
        >
          <div className="w-full" style={{ maxWidth: "360px", backgroundColor: IVORY, border: `1px solid ${HAIRLINE}` }}>
            <div className="px-6 py-6">
              <p style={{ ...SERIF, fontSize: "20px", marginBottom: "12px" }}>
                Sell #{pendingSellTokenId.toString()}?
              </p>
              <p style={{ ...SANS, fontSize: "13px", color: MUTED, lineHeight: 1.6 }}>
                This will transfer the token to the current highest bidder for {currentBid} ETH.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setPendingSellTokenId(null)}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: "transparent",
                    color: INK,
                    border: `1px solid ${HAIRLINE}`,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSellNFT}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: INK,
                    color: IVORY,
                    border: "none",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Confirm Sell
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${HAIRLINE}`, padding: "40px 0", marginTop: "80px" }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span style={{ ...SANS, fontSize: "12px", color: MUTED }}>© 2024 Flooor. Built on Base.</span>
          <div className="flex items-center gap-6">
            <a
              href="https://x.com/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...SANS, fontSize: "12px", color: MUTED }}
            >
              X / Twitter
            </a>
            <a
              href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...SANS, fontSize: "12px", color: MUTED }}
            >
              Farcaster
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
