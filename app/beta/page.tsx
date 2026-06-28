"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

import { useState, useCallback, useEffect } from "react";
import { useConfig, useAccount, useSwitchChain } from "wagmi";
import {
  writeContract,
  readContract,
  simulateContract,
} from "wagmi/actions";
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
import Image from "next/image";
import { Playfair_Display, Inter } from "next/font/google";

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

import MARKET_ABI from "@/app/abi/market.json";
import NFT_ABI from "@/app/abi/nft.json";

const CONTRACT_ADDR = "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const;
const COLLECTION_ADDR = "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const;
const MINIMUM_BID_FOR_SELL = 0.015;

// Basename çözümleme — L1 üzerinden CCIP-Read yerine, veri zaten Base'de yaşadığı için
// Base'in resmi L2Resolver kontratından doğrudan okuyoruz (bkz. github.com/base/basenames)
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

// ENSIP-11: L2 coinType = 0x80000000 | chainId
const convertChainIdToCoinType = (chainId: number): string => {
  const coinType = (0x80000000 | chainId) >>> 0;
  return coinType.toString(16).toUpperCase();
};

// ENSIP-19 reverse node — adresin Base üzerindeki reverse kaydının node hash'i
const convertReverseNodeToBytes = (address: Address, chainId: number) => {
  const addressFormatted = address.toLowerCase().substring(2);
  const addressNode = keccak256(toHex(addressFormatted));
  const baseReverseNode = namehash(`${convertChainIdToCoinType(chainId)}.reverse`);
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]),
  );
};

// Sotheby's-inspired palette — restrained, gallery-like
const INK = "#1A1A1A";
const MUTED = "#75716A";
const FAINT = "#A8A39B";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";
const GREEN = "#1E7B4F";
const AMBER = "#A9731E";
const GOLD = "#A4863D";

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

export default function BetaPage() {
  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [nftApprovalStatus, setNftApprovalStatus] = useState<{
    [key: string]: boolean;
  }>({});
  const [nftLoadingStatus, setNftLoadingStatus] = useState<{
    [key: string]: boolean;
  }>({});
  const [phaseInfo, setPhaseInfo] = useState<{
    currentPhase: string;
    eid: bigint;
    elapsed: bigint;
    remaining: bigint;
  } | null>(null);
  const [dailySigners, setDailySigners] = useState<number>(0);
  const [dailyVault, setDailyVault] = useState<string>("0");
  const [currentBid, setCurrentBid] = useState<string>("0");
  const [activeBidder, setActiveBidder] = useState<string>("");
  const [activeBidderName, setActiveBidderName] = useState<string>("");
  const [yieldPerNFT, setYieldPerNFT] = useState<string>("0");
  const [userHasSigned, setUserHasSigned] = useState<boolean>(false);
  const [userHasClaimed, setUserHasClaimed] = useState<boolean>(false);
  const [ownedTokenId, setOwnedTokenId] = useState<bigint | null>(null);
  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [nftImages, setNftImages] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const [pendingSellTokenId, setPendingSellTokenId] = useState<bigint | null>(
    null,
  );
  const [heroToken, setHeroToken] = useState<{
    id: string;
    image: string;
  } | null>(null);
  const config = useConfig();
  const { address, chain: connectedChain } = useAccount();
  const { switchChain: switchChainHook } = useSwitchChain();
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      );
      const data = await res.json();
      setEthPrice(parseFloat(data.price));
    } catch {
      // silently fail, price stays null
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

  const fmtEth = useCallback((eth: string) => {
    const n = parseFloat(eth);
    if (!n || isNaN(n)) return "0";
    if (n >= 1) return n.toFixed(3);
    if (n >= 0.001) return n.toFixed(4);
    return n.toFixed(6);
  }, []);

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


  const checkApprovalStatus = useCallback(async () => {
    if (!address) return;
    setIsCheckingApproval(true);
    try {
      await retryWithBackoff(async () => {
        return await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
        });
      });
    } catch (error) {
      console.error("Error checking approval status:", error);
    } finally {
      setIsCheckingApproval(false);
    }
  }, [config, address]);

  const checkIndividualNFTApprovals = useCallback(async () => {
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
      isAllApproved = false;
    }
    if (isAllApproved) {
      // setApprovalForAll koleksiyon genelinde geçerli — tüm NFT'ler onaylı
      for (const id of userNFTs) {
        approvalStatus[id.toString()] = true;
      }
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
          approvalStatus[idStr] =
            approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase();
        } catch (error) {
          console.error(`Error checking approval for token ${id}:`, error);
          approvalStatus[idStr] = false;
        }
      }
    }
    setNftApprovalStatus(approvalStatus);
  }, [config, address, userNFTs]);

  useEffect(() => {
    checkApprovalStatus();
  }, [checkApprovalStatus]);

  useEffect(() => {
    if (userNFTs.length > 0) {
      const timeoutId = setTimeout(() => {
        checkApprovalStatus();
        checkIndividualNFTApprovals();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [userNFTs, checkApprovalStatus, checkIndividualNFTApprovals]);

  const fetchOwnedTokenId = useCallback(async () => {
    if (!address) {
      setOwnedTokenId(null);
      return;
    }
    try {
      const owned: bigint[] = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
        })) as unknown as bigint[];
      })) as bigint[];
      if (owned && owned.length > 0) {
        const tokenId = owned.reduce((a, b) => (a > b ? a : b));
        setOwnedTokenId(tokenId);
      } else {
        setOwnedTokenId(null);
      }
    } catch (error) {
      console.error("Error fetching owned token ID:", error);
      setOwnedTokenId(null);
    }
  }, [config, address]);

  useEffect(() => {
    fetchOwnedTokenId();
  }, [fetchOwnedTokenId]);

  const getPhaseInfo = useCallback(async () => {
    try {
      const info = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "getPhaseInfo",
          args: [],
        })) as [string, bigint, bigint, bigint];
      });
      const [currentPhase, eid, elapsed, remaining] = info as [
        string,
        bigint,
        bigint,
        bigint,
      ];
      setPhaseInfo({ currentPhase, eid, elapsed, remaining });
      setRemainingTimeDisplay(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  const getDailySigners = useCallback(async () => {
    try {
      const currentEpochStart = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      });
      const signersCount = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "partCount",
          args: [currentEpochStart],
        })) as bigint;
      });
      setDailySigners(Number(signersCount));
    } catch (error) {
      console.error("Error getting daily signers:", error);
    }
  }, [config]);

  const getDailyVault = useCallback(async () => {
    try {
      const poolAccrued = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
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
    try {
      const activeBidAmount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
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
    try {
      const bidderAddress = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "activeBidder",
          args: [],
        })) as string;
      })) as string;
      setActiveBidder(bidderAddress);
      if (
        bidderAddress &&
        bidderAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          const baseName = await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: BASENAME_L2_RESOLVER_ADDRESS,
              abi: L2_RESOLVER_ABI,
              functionName: "name",
              args: [convertReverseNodeToBytes(bidderAddress as Address, base.id)],
              chainId: base.id,
            })) as string;
          });
          if (baseName && typeof baseName === "string" && baseName !== "") {
            setActiveBidderName(baseName);
          } else {
            setActiveBidderName(
              `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
            );
          }
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

  const checkUserSignedStatus = useCallback(async () => {
    if (!address || !phaseInfo || !ownedTokenId) {
      setUserHasSigned(false);
      setUserHasClaimed(false);
      return;
    }
    try {
      const currentEpochStart = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      });
      const signedTokenId = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "mySignedToken",
          args: [currentEpochStart, address],
        })) as bigint;
      });
      const hasSigned = (signedTokenId as bigint) > BigInt(0);
      setUserHasSigned(hasSigned);
      const isSignPhase =
        phaseInfo.currentPhase.toLowerCase().includes("sign") ||
        phaseInfo.currentPhase.toLowerCase() === "signing" ||
        phaseInfo.currentPhase.toLowerCase() === "sign_phase";
      let claimedStatus = false;
      if (hasSigned && !isSignPhase) {
        try {
          await simulateContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "signOrClaim",
            args: [BigInt(ownedTokenId)],
            account: address,
          });
          claimedStatus = false;
        } catch {
          claimedStatus = true;
        }
      }
      setUserHasClaimed(claimedStatus);
    } catch (error) {
      console.error("Error checking user signed status:", error);
    }
  }, [config, address, phaseInfo, ownedTokenId]);

  const calculateYieldPerNFT = useCallback(() => {
    const vaultAmount = parseFloat(dailyVault);
    const signersCount = dailySigners;
    if (signersCount > 0 && vaultAmount > 0) {
      setYieldPerNFT((vaultAmount / signersCount).toFixed(8));
    } else {
      setYieldPerNFT("0.00000000");
    }
  }, [dailyVault, dailySigners]);

  const getUserNFTs = useCallback(async () => {
    if (!address || !config) {
      setUserNFTs([]);
      return;
    }
    try {
      const nfts: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        try {
          const tokenId = (await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [address, BigInt(i)],
            })) as bigint;
          })) as bigint;
          nfts.push(tokenId);
        } catch {
          break;
        }
      }
      setUserNFTs(nfts);
    } catch (error) {
      console.error("Error getting user NFTs:", error);
      setUserNFTs([]);
    }
  }, [address, config]);

  const decodeTokenImage = (tokenURI: string): string | null => {
    if (tokenURI.startsWith("data:application/json;base64,")) {
      const jsonData = JSON.parse(atob(tokenURI.split(",")[1]));
      if (jsonData.image_data) {
        return `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
      }
    }
    return null;
  };

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) {
      setNftImages({});
      return;
    }
    const images: { [key: string]: string } = {};
    const highestTokenId = userNFTs.reduce((a, b) => (a > b ? a : b));
    const tokenIdStr = highestTokenId.toString();
    try {
      const tokenURI = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenURI",
          args: [highestTokenId],
        })) as string;
      })) as string;
      const image = decodeTokenImage(tokenURI);
      if (image) images[tokenIdStr] = image;
    } catch (error) {
      console.error(`Error getting image for token ${highestTokenId}:`, error);
    }
    setNftImages(images);
  }, [userNFTs, config]);

  // Günün eseri: zincirdeki en son mint edilmiş VRNoun
  const getHeroNFT = useCallback(async () => {
    try {
      const supply = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "totalSupply",
          args: [],
        })) as bigint;
      })) as bigint;
      if (supply === BigInt(0)) return;
      const tokenId = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenByIndex",
          args: [supply - BigInt(1)],
        })) as bigint;
      })) as bigint;
      const tokenURI = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenURI",
          args: [tokenId],
        })) as string;
      })) as string;
      const image = decodeTokenImage(tokenURI);
      if (image) setHeroToken({ id: tokenId.toString(), image });
    } catch (error) {
      console.error("Error fetching hero NFT:", error);
    }
  }, [config]);

  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);
  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);
  useEffect(() => {
    getHeroNFT();
  }, [getHeroNFT]);

  // Cüzdan bağlandığı anda NFT'leri otomatik yükle — refresh gerekmez
  useEffect(() => {
    getUserNFTs();
  }, [getUserNFTs]);

  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) {
      checkUserSignedStatus();
    }
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.allSettled([
      getPhaseInfo(),
      getDailySigners(),
      getDailyVault(),
      getCurrentBid(),
      getActiveBidder(),
      checkUserSignedStatus(),
      getUserNFTs(),
      checkApprovalStatus(),
    ]);
    setIsLoading(false);
  }, [
    getPhaseInfo,
    getDailySigners,
    getDailyVault,
    getCurrentBid,
    getActiveBidder,
    checkUserSignedStatus,
    getUserNFTs,
    checkApprovalStatus,
  ]);

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

  // Yield per NFT'nin USD karşılığı — buton metinlerinde kullanılır
  const yieldUsd = toUsd(yieldPerNFT) ?? "$0.00";

  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return `Daily Sign · Earn ${yieldUsd}`;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) return "Refreshing...";
        return `Claim opens ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else {
        return `Daily Sign · Earn ${yieldUsd}`;
      }
    } else {
      if (userHasClaimed)
        return `Next sign ${formatTimeRemaining(remainingTimeDisplay)}`;
      else if (userHasSigned) return `Claim ${yieldUsd}`;
      else return `Sign ended ${formatTimeRemaining(remainingTimeDisplay)}`;
    }
  }, [
    phaseInfo,
    userHasSigned,
    userHasClaimed,
    remainingTimeDisplay,
    formatTimeRemaining,
    yieldUsd,
  ]);

  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo || !address) return true;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (remainingTimeDisplay < 30 && isSignPhase && userHasSigned) return true;
    if (isSignPhase) return userHasSigned;
    else return !userHasSigned || userHasClaimed;
  }, [phaseInfo, userHasSigned, userHasClaimed, address, remainingTimeDisplay]);

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value
        .replace(/,/g, ".")
        .replace(/[^0-9.]/g, "");
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
    const hasActiveBid =
      activeBidder &&
      activeBidder !== "0x0000000000000000000000000000000000000000" &&
      currentBidNum > 0;
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
        abi: MARKET_ABI,
        functionName: "placeBid",
        args: [],
        value,
        dataSuffix: DATA_SUFFIX,
      });
      toast.success("Bid placed successfully!");
      // Bid sonrası anında güncelle
      setTimeout(() => {
        getCurrentBid();
        getActiveBidder();
      }, 2000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleBid() },
      });
    }
  }, [config, ensureBase, bidInput, address, connectedChain, currentBid, activeBidder, getCurrentBid, getActiveBidder]);

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      try {
        await ensureBase();
        const currentBidNumber = parseFloat(currentBid);
        if (currentBidNumber < MINIMUM_BID_FOR_SELL) {
          toast.error(
            `Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`,
          );
          return;
        }
        if (userNFTs.length > 1) {
          toast.error("You must hold only 1 NFT to sell.");
          return;
        }
        const tokenIdStr = tokenId.toString();
        const isThisNFTApproved = nftApprovalStatus[tokenIdStr] === true;
        if (!isThisNFTApproved) {
          setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: true }));
          toast.info(`Approving Noun #${tokenIdStr}...`);
          try {
            await retryWithBackoff(
              async () => {
                return await writeContract(config, {
                  address: COLLECTION_ADDR,
                  abi: NFT_ABI,
                  functionName: "setApprovalForAll",
                  args: [CONTRACT_ADDR, true],
                  dataSuffix: DATA_SUFFIX,
                });
              },
              5,
              2000,
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const isActuallyApproved = await retryWithBackoff(async () => {
              return await readContract(config, {
                address: COLLECTION_ADDR,
                abi: NFT_ABI,
                functionName: "isApprovedForAll",
                args: [address, CONTRACT_ADDR],
              });
            });
            if (isActuallyApproved) {
              toast.success("Approval confirmed!");
              setNftApprovalStatus((prev) => ({ ...prev, [tokenIdStr]: true }));
              await checkIndividualNFTApprovals();
            } else {
              throw new Error("Approval not confirmed on blockchain");
            }
          } catch (error) {
            toast.error("Approval failed. Please try again.");
            throw error;
          } finally {
            setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: false }));
          }
        }
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Noun #${tokenIdStr} sold successfully!`);
        // Satış sonrası anında güncelle
        setTimeout(() => {
          getCurrentBid();
          getActiveBidder();
          getDailyVault();
          getUserNFTs();
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toast.error(`Sell failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
        });
      }
    },
    [
      config,
      ensureBase,
      address,
      nftApprovalStatus,
      checkIndividualNFTApprovals,
      currentBid,
      userNFTs,
      getCurrentBid,
      getActiveBidder,
      getDailyVault,
      getUserNFTs,
    ],
  );

  // Mobil webview'larda window.confirm çalışmadığı için kendi modalımızla onay alıyoruz
  const requestSellNFT = useCallback(
    (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      if (parseFloat(currentBid) < MINIMUM_BID_FOR_SELL) {
        toast.error(
          `Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`,
        );
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

  const handleSign = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    try {
      await ensureBase();
      const owned: bigint[] = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
        })) as unknown as bigint[];
      })) as bigint[];
      if (!owned || owned.length === 0) {
        toast.error("No NFTs owned");
        return;
      }
      if (owned.length > 1) {
        toast.warning("You must hodl only 1 vrnouns in your wallet");
        return;
      }
      const tokenId = owned.reduce((a, b) => (a > b ? a : b));
      const isSignPhase =
        phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
        phaseInfo?.currentPhase.toLowerCase() === "signing" ||
        phaseInfo?.currentPhase.toLowerCase() === "sign_phase";
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "signOrClaim",
        args: [tokenId],
        dataSuffix: DATA_SUFFIX,
      });
      if (isSignPhase) {
        setUserHasSigned(true);
        toast.success("Sign successful!");
      } else {
        setUserHasClaimed(true);
        toast.success("Claim successful!");
      }
      setTimeout(() => {
        checkUserSignedStatus();
        getPhaseInfo();
      }, 2000);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Sign/Claim failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleSign() },
      });
    }
  }, [
    config,
    ensureBase,
    phaseInfo,
    address,
    checkUserSignedStatus,
    getPhaseInfo,
  ]);

  const isWrongNetwork = !!address && connectedChain?.id !== base.id;

  const isSignPhase =
    phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
    phaseInfo?.currentPhase.toLowerCase() === "signing" ||
    phaseInfo?.currentPhase.toLowerCase() === "sign_phase";

  // Claim'e hazır durum — buton zarif yeşile döner
  const isClaimReady =
    !!phaseInfo && !isSignPhase && userHasSigned && !userHasClaimed;

  const hasBid =
    activeBidder &&
    activeBidder !== "0x0000000000000000000000000000000000000000" &&
    parseFloat(currentBid) > 0;

  const minOutbidAmount = hasBid
    ? Math.max(parseFloat(currentBid) * 1.05, MINIMUM_BID_FOR_SELL)
    : MINIMUM_BID_FOR_SELL;

  return (
    <div
      className={`${playfair.variable} ${inter.variable} min-h-screen relative z-10`}
      style={{ backgroundColor: "#FFFFFF", color: INK, ...SANS }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <a
            href="/beta"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontSize: "26px",
              letterSpacing: "0.02em",
              color: INK,
            }}
          >
            Flooor
          </a>
          <nav className="hidden md:flex items-center gap-10">
            <a
              href="/warplets"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
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
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              mounted,
            }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: {
                      opacity: 0,
                      pointerEvents: "none",
                      userSelect: "none",
                    },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      type="button"
                      className="px-6 py-3 transition-opacity hover:opacity-80"
                      style={{
                        ...smallCaps,
                        color: "#fff",
                        backgroundColor: INK,
                      }}
                    >
                      Connect
                    </button>
                  ) : chain.unsupported ? (
                    <button
                      onClick={openChainModal}
                      type="button"
                      className="px-6 py-3"
                      style={{
                        ...smallCaps,
                        color: "#9B1C1C",
                        border: "1px solid #9B1C1C",
                        backgroundColor: "#fff",
                      }}
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      type="button"
                      className="px-6 py-3 transition-colors hover:bg-black hover:text-white"
                      style={{
                        ...smallCaps,
                        color: INK,
                        border: `1px solid ${INK}`,
                        backgroundColor: "#fff",
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

      {/* Network Gate — full-screen block until on Base */}
      {isWrongNetwork && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(26,26,26,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
        >
          <div
            className="w-full max-w-sm p-8 sm:p-10 text-center"
            style={{ backgroundColor: "#fff", border: `1px solid ${HAIRLINE}`, boxShadow: "0 24px 64px -16px rgba(0,0,0,0.3)" }}
          >
            <div
              className="mx-auto mb-6 flex items-center justify-center"
              style={{ width: 48, height: 48, borderRadius: "50%", backgroundColor: "#FBF3F3", border: "1px solid #F3CACA" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L2 17h16L10 2z" stroke="#9B1C1C" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M10 8v4M10 14.5v.5" stroke="#9B1C1C" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <p style={{ ...smallCaps, color: "#9B1C1C" }}>Wrong Network</p>
            <h3 className="mt-3" style={{ ...SERIF, fontWeight: 500, fontSize: "22px" }}>
              Switch to Base
            </h3>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: MUTED }}>
              Flooor runs on Base. Please switch your wallet to the Base network to continue.
            </p>
            <button
              onClick={() => ensureBase()}
              className="mt-7 w-full py-4 transition-opacity hover:opacity-85"
              style={{ ...smallCaps, color: "#fff", backgroundColor: INK }}
            >
              Switch to Base
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Lot hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 pt-12 lg:pt-16 items-start">
          {/* Artwork */}
          <div className="lg:sticky lg:top-28">
            <div
              className="flex items-center justify-center p-8 sm:p-14"
              style={{ backgroundColor: PLINTH }}
            >
              <Image
                src={heroToken?.image ?? "/bg.png"}
                alt={heroToken ? `VRNoun #${heroToken.id}` : "VRNouns"}
                width={560}
                height={560}
                priority
                className="w-full h-auto max-w-[440px]"
                style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
              />
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <p className="text-sm" style={{ ...SERIF, fontStyle: "italic", color: MUTED }}>
                {heroToken ? `VRNoun No. ${heroToken.id}` : "VRNouns"} — onchain
                SVG, Base
              </p>
              <a
                href="https://opensea.io/collection/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs hover:text-black transition-colors"
                style={{ ...smallCaps }}
              >
                View Collection
              </a>
            </div>
          </div>

          {/* Lot details */}
          <div>
            <p style={{ ...smallCaps, color: GOLD }}>
              {isSignPhase ? "Live Market — Sign Phase" : "Live Market — Claim Phase"}
              {" · "}Epoch {phaseInfo ? phaseInfo.eid.toString() : "—"}
              {isLoading ? " · syncing" : ""}
            </p>
            <h1
              className="mt-4"
              style={{
                ...SERIF,
                fontWeight: 500,
                fontSize: "clamp(36px, 4.6vw, 58px)",
                lineHeight: 1.08,
                letterSpacing: "-0.01em",
              }}
            >
              Royalties to the community.
            </h1>
            <p
              className="mt-3 text-base leading-relaxed"
              style={{ ...SANS, color: MUTED, maxWidth: "48ch" }}
            >
              Bid on the flooor, or sell your VRNoun instantly — no listings,
              no waiting. Royalties flow back to the community.
            </p>

            {/* Current bid */}
            <div className="mt-10 pt-8" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                <div>
                  <p style={smallCaps}>Current Bid</p>
                  <p
                    className="mt-2 tabular-nums"
                    style={{
                      ...SERIF,
                      fontWeight: 500,
                      fontSize: "clamp(28px, 3.4vw, 44px)",
                      lineHeight: 1.1,
                    }}
                  >
                    Ξ {fmtEth(currentBid)}
                  </p>
                  <p className="mt-1.5 text-sm" style={{ color: MUTED }}>
                    {hasBid ? (
                      <>
                        {toUsd(currentBid) ? `${toUsd(currentBid)} · ` : ""}
                        <a
                          href={`https://basescan.org/address/${activeBidder}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-black transition-colors underline underline-offset-4"
                          style={{ textDecorationColor: HAIRLINE }}
                        >
                          {activeBidderName ||
                            `${activeBidder.slice(0, 6)}…${activeBidder.slice(-4)}`}
                        </a>
                      </>
                    ) : (
                      "No bids yet — place the first."
                    )}
                  </p>
                </div>
                <div>
                  <p style={smallCaps}>
                    {isSignPhase ? "Sign Closes In" : "Claim Closes In"}
                  </p>
                  <p
                    className="mt-2 tabular-nums"
                    style={{
                      ...SERIF,
                      fontWeight: 500,
                      fontSize: "clamp(28px, 3.4vw, 44px)",
                      lineHeight: 1.1,
                    }}
                  >
                    {formatTimeRemaining(remainingTimeDisplay)}
                  </p>
                </div>
              </div>

              {/* Outbid notice */}
              {hasBid && (
                <div
                  className="mt-8 px-4 py-3 flex items-start gap-3"
                  style={{ backgroundColor: PLINTH, border: `1px solid ${HAIRLINE}` }}
                >
                  <span style={{ color: MUTED, fontSize: "13px", lineHeight: 1.5, ...SANS }}>
                    Current bid is Ξ {fmtEth(currentBid)} — you must bid at least{" "}
                    <strong>Ξ {minOutbidAmount.toFixed(6)}</strong> to outbid (5% above current).
                  </span>
                </div>
              )}

              {/* Bid — tam çerçeveli kutu */}
              <div
                className={hasBid ? "mt-3 flex items-stretch" : "mt-8 flex items-stretch"}
                style={{
                  border: `1px solid ${bidError ? "#9B1C1C" : INK}`,
                }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    bidError
                      ? `Minimum Ξ ${minOutbidAmount.toFixed(6)}`
                      : hasBid
                        ? `Ξ ${minOutbidAmount.toFixed(6)} or more`
                        : `Ξ ${MINIMUM_BID_FOR_SELL} or more`
                  }
                  className="flex-1 px-4 py-3.5 focus:outline-none min-w-0 text-lg tabular-nums"
                  style={{
                    ...SANS,
                    color: INK,
                    backgroundColor: "#fff",
                    border: "none",
                  }}
                  value={bidInput}
                  onChange={handleBidInputChange}
                />
                <button
                  onClick={handleBid}
                  className="px-5 sm:px-10 whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{
                    ...smallCaps,
                    color: "#fff",
                    backgroundColor: INK,
                  }}
                >
                  Place Bid
                </button>
              </div>
              <p className="mt-3 text-xs" style={{ color: FAINT }}>
                {hasBid
                  ? `Minimum outbid Ξ ${minOutbidAmount.toFixed(6)} — if someone outbids you, your ETH is returned automatically.`
                  : `Minimum bid Ξ ${MINIMUM_BID_FOR_SELL} — if someone outbids you, your ETH is returned automatically. Every sale feeds the vault.`}
              </p>
            </div>

            {/* Details — signers, vault, yield, epoch */}
            <div className="mt-10">
              {[
                {
                  label: "Signers",
                  value: `${dailySigners}`,
                  sub: "this epoch",
                  green: false,
                },
                {
                  label: "Vault",
                  value: `Ξ ${fmtEth(dailyVault)}`,
                  sub: toUsd(dailyVault),
                  green: false,
                },
                {
                  label: "Yield per NFT",
                  value: `Ξ ${fmtEth(yieldPerNFT)}`,
                  sub: toUsd(yieldPerNFT),
                  green: true,
                },
                {
                  label: "Epoch",
                  value: phaseInfo ? phaseInfo.eid.toString() : "—",
                  sub: "24-hour cycle",
                  green: false,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between py-3.5"
                  style={{ borderTop: `1px solid ${HAIRLINE}` }}
                >
                  <span style={smallCaps}>{row.label}</span>
                  <span
                    className="tabular-nums text-base"
                    style={{
                      ...SANS,
                      fontWeight: 500,
                      color: row.green ? GREEN : INK,
                    }}
                  >
                    {row.value}
                    {row.sub ? (
                      <span style={{ color: FAINT, fontWeight: 400 }}>
                        {" "}
                        · {row.sub}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
              <div className="pt-3.5 text-right">
                <button
                  onClick={fetchAllData}
                  disabled={isLoading}
                  className="text-xs hover:text-black transition-colors disabled:opacity-50"
                  style={{ ...smallCaps, color: MUTED }}
                >
                  {isLoading ? "Refreshing…" : "Refresh Data"}
                </button>
              </div>
            </div>

            {/* Daily sign */}
            <div className="mt-10 pt-8" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
              <p style={smallCaps}>Daily Sign</p>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: MUTED, maxWidth: "48ch" }}
              >
                Hold a Flooor? Sign in today to claim your share of the daily
                vault. No lockup, no transfer.
              </p>
              <button
                onClick={handleSign}
                disabled={isSignButtonDisabled()}
                className="mt-5 w-full sm:w-auto px-12 py-4 transition-opacity enabled:hover:opacity-85"
                style={{
                  ...smallCaps,
                  color: isSignButtonDisabled() ? FAINT : "#fff",
                  backgroundColor: isSignButtonDisabled()
                    ? IVORY
                    : isClaimReady
                      ? GREEN
                      : INK,
                  border: isSignButtonDisabled()
                    ? `1px solid ${HAIRLINE}`
                    : "none",
                  cursor: isSignButtonDisabled() ? "not-allowed" : "pointer",
                }}
              >
                {getSignButtonText()}
              </button>
            </div>
          </div>
        </div>

        {/* Other Collections */}
        <div className="mt-20 pt-10" style={{ maxWidth: "480px", borderTop: `1px solid ${HAIRLINE}` }}>
          <p style={smallCaps}>Other Collections</p>
          <div className="mt-6">
            {[
              {
                name: "Warplets",
                sub: "Base",
                img: "https://i2c.seadn.io/base/0x699727f9e01a822efdcf7333073f0461e5914b4e/c4dd77598815bd89610930ca12be02/a2c4dd77598815bd89610930ca12be02.jpeg?w=1000",
                href: "/warplets",
              },
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={col.img} alt={col.name} className="w-full h-full object-cover" />
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
                    Explore →
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

        {/* Your collection */}
        <div className="mt-20">
          <div className="flex items-baseline justify-between gap-4">
            <p style={smallCaps}>Your Collection</p>
            <button
              onClick={fetchAllData}
              disabled={isLoading}
              className="text-xs hover:text-black transition-colors disabled:opacity-50 shrink-0"
              style={{ ...smallCaps, color: MUTED }}
            >
              {isLoading ? "Refreshing…" : "Refresh Data"}
            </button>
          </div>
          <h2
            className="mt-3"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontSize: "clamp(26px, 3vw, 36px)",
            }}
          >
            Works in your wallet
          </h2>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            Select a work to sell instantly at the current bid.
            {isCheckingApproval ? " Checking approval…" : ""}
          </p>

          {!address ? (
            <div
              className="mt-8 py-14 text-center"
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              <p
                style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
                className="text-lg"
              >
                Connect your wallet to view your collection.
              </p>
            </div>
          ) : userNFTs.length > 0 ? (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-8">
              {userNFTs.map((tokenId) => {
                const tokenIdStr = tokenId.toString();
                const approved = nftApprovalStatus[tokenIdStr];
                return (
                  <button
                    key={tokenIdStr}
                    onClick={() => requestSellNFT(tokenId)}
                    title={`Sell Noun #${tokenIdStr}`}
                    className="group text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
                  >
                    <div
                      className="relative aspect-square flex items-center justify-center p-6 transition-colors"
                      style={{ backgroundColor: PLINTH }}
                    >
                      {nftImages[tokenIdStr] ? (
                        <Image
                          src={nftImages[tokenIdStr]}
                          alt={`Noun ${tokenIdStr}`}
                          width={220}
                          height={220}
                          className="w-full h-auto transition-transform duration-300 group-hover:scale-[1.03]"
                          style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
                        />
                      ) : (
                        <span
                          style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
                        >
                          No. {tokenIdStr}
                        </span>
                      )}
                      {nftLoadingStatus[tokenIdStr] && (
                        <div
                          className="absolute inset-0 flex items-center justify-center"
                          style={{ backgroundColor: "rgba(255,255,255,0.85)" }}
                        >
                          <span style={smallCaps}>Approving…</span>
                        </div>
                      )}
                      <div
                        className="absolute inset-x-0 bottom-0 py-2.5 text-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ backgroundColor: INK }}
                      >
                        <span style={{ ...smallCaps, color: "#fff" }}>
                          Sell This Work
                        </span>
                      </div>
                    </div>
                    <p
                      className="mt-3"
                      style={{ ...SERIF, fontWeight: 500, fontSize: "17px" }}
                    >
                      VRNoun No. {tokenIdStr}
                    </p>
                    <p
                      className="mt-0.5 text-xs"
                      style={{ color: approved ? GREEN : AMBER }}
                    >
                      {approved ? "Approved for sale" : "Approval required"}
                    </p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="mt-8 py-14 text-center"
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              <p
                style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
                className="text-lg"
              >
                No works in your collection — acquire today&apos;s lot above.
              </p>
            </div>
          )}
        </div>

        {/* How it works */}
        <div className="mt-24 pt-14" style={{ borderTop: `1px solid ${HAIRLINE}` }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                I.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Sign &amp; Earn
              </p>
              <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
                Light stake by signing with your NFT. Five percent of all
                royalties are shared with signers, every day.
              </p>
            </div>
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                II.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Bid or Sell
              </p>
              <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
                No listings, no negotiation. Place a bid, or sell your work
                instantly at the standing price — settled on-chain.
              </p>
            </div>
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                III.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Game Theory
              </p>
              <p className="mt-3 text-base leading-relaxed" style={{ color: MUTED }}>
                Built on game theory and designed with a single intention: the
                whole group wins together.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Manifesto */}
      <div className="mt-24 py-20 sm:py-28" style={{ backgroundColor: IVORY }}>
        <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center">
          <div
            className="mx-auto mb-7"
            style={{ width: 56, height: 1, backgroundColor: GOLD }}
          />
          <p style={{ ...smallCaps, color: GOLD }}>Flooor · Est. MMXXV</p>
          <p
            className="mt-6"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontStyle: "italic",
              fontSize: "clamp(30px, 4.5vw, 54px)",
              lineHeight: 1.2,
            }}
          >
            The whole group wins together.
          </p>
        </div>
      </div>

      {/* Sell confirmation modal */}
      {pendingSellTokenId !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(26,26,26,0.4)" }}
          onClick={() => setPendingSellTokenId(null)}
        >
          <div
            className="w-full max-w-md p-8 sm:p-10"
            style={{
              backgroundColor: "#fff",
              border: `1px solid ${HAIRLINE}`,
              boxShadow: "0 24px 64px -16px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={smallCaps}>Confirm Sale</p>
            <h3
              className="mt-3"
              style={{ ...SERIF, fontWeight: 500, fontSize: "26px" }}
            >
              VRNoun No. {pendingSellTokenId.toString()}
            </h3>
            <p
              className="mt-4 text-sm leading-relaxed"
              style={{ color: MUTED }}
            >
              You are about to sell this work for{" "}
              <strong style={{ color: INK }}>
                Ξ {fmtEth(currentBid)}
                {toUsd(currentBid) ? ` (${toUsd(currentBid)})` : ""}
              </strong>
              . This action is final and cannot be undone.
            </p>
            <div className="mt-8 flex gap-4">
              <button
                onClick={() => setPendingSellTokenId(null)}
                className="flex-1 py-3.5 transition-colors hover:bg-black hover:text-white"
                style={{
                  ...smallCaps,
                  color: INK,
                  border: `1px solid ${INK}`,
                  backgroundColor: "#fff",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSellNFT}
                className="flex-1 py-3.5 transition-opacity hover:opacity-85"
                style={{
                  ...smallCaps,
                  color: "#fff",
                  backgroundColor: GREEN,
                }}
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${HAIRLINE}` }}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-14 grid grid-cols-2 md:grid-cols-4 gap-10">
          <div className="col-span-2 md:col-span-1">
            <p style={{ ...SERIF, fontWeight: 500, fontSize: "22px" }}>
              Flooor
            </p>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: MUTED }}
            >
              A daily auction house for onchain art. Base · CC0.
            </p>
          </div>
          <div>
            <p style={smallCaps}>Protocol</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <a
                href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                Documentation
              </a>
              <a
                href="https://github.com/omgbbqhaxx/flooor"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                GitHub
              </a>
              <a
                href="https://snapshot.org/#/s:vrnouns.eth"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                Snapshot DAO
              </a>
            </div>
          </div>
          <div>
            <p style={smallCaps}>Contracts</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <a
                href="https://basescan.org/address/0xbb56a9359df63014b3347585565d6f80ac6305fd#readContract"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                VRNouns
              </a>
              <a
                href="https://basescan.org/address/0xf6b2c2411a101db46c8513ddaef10b11184c58ff#readContract"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                Flooor
              </a>
              <a
                href="https://opensea.io/collection/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                OpenSea
              </a>
            </div>
          </div>
          <div>
            <p style={smallCaps}>Social</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <a
                href="https://x.com/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                X / Twitter
              </a>
              <a
                href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                Farcaster
              </a>
              <a
                href="https://base.app/app/flooor.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm hover:text-black transition-colors"
                style={{ color: MUTED }}
              >
                Base App
              </a>
            </div>
          </div>
        </div>
        <div
          className="py-6 text-center px-5"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <p
            style={{
              ...SERIF,
              fontStyle: "italic",
              fontSize: "15px",
              color: GOLD,
              letterSpacing: "0.08em",
            }}
          >
            MMXXVI
          </p>
          <p className="mt-2 text-xs" style={{ color: FAINT }}>
            © flooor.fun · CC0 Licensed · Front-end v3.0.5 · Contract v1.0 ·
            Beta · Crafted with Claude Fable 5
          </p>
        </div>
      </footer>
    </div>
  );
}
