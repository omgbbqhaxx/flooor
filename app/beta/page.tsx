"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

import Logo from "@/app/svg/Logo";
import { useState, useCallback, useEffect } from "react";
import { useConfig, useChainId, useAccount } from "wagmi";
import {
  writeContract,
  readContract,
  switchChain,
  simulateContract,
} from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther, formatEther } from "viem";
import { Attribution } from "ox/erc8021";
import Image from "next/image";

const BUILDER_CODE = "bc_uzb9vqpt";
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });
import blockies from "blockies";

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
      const errorMessage = error instanceof Error ? error.message : String(error);
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
const MINIMUM_BID_FOR_SELL = 0.0015;

export default function BetaPage() {
  const [bidInput, setBidInput] = useState("");
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [nftApprovalStatus, setNftApprovalStatus] = useState<{ [key: string]: boolean }>({});
  const [nftLoadingStatus, setNftLoadingStatus] = useState<{ [key: string]: boolean }>({});
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
  const [, setRpcError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const config = useConfig();
  const chainId = useChainId();
  const { address } = useAccount();
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);

  const CACHE_DURATION = 5 * 60 * 1000;

  const ensureBase = useCallback(async () => {
    if (chainId !== base.id) {
      setShowNetworkWarning(true);
      try {
        await switchChain(config, { chainId: base.id });
        setShowNetworkWarning(false);
      } catch (error) {
        console.error("Failed to switch network:", error);
        throw new Error("Please switch to Base network to continue");
      }
    }
  }, [chainId, config]);

  useEffect(() => {
    if (address && chainId !== base.id) {
      setShowNetworkWarning(true);
    } else {
      setShowNetworkWarning(false);
    }
  }, [chainId, address]);

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
    const highestTokenId = userNFTs.reduce((a, b) => (a > b ? a : b));
    const tokenIdStr = highestTokenId.toString();
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
      approvalStatus[tokenIdStr] = true;
    } else {
      try {
        const approvedAddress = (await retryWithBackoff(async () => {
          return await readContract(config, {
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "getApproved",
            args: [highestTokenId],
          });
        })) as string;
        approvalStatus[tokenIdStr] = approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase();
      } catch (error) {
        console.error(`Error checking approval for token ${highestTokenId}:`, error);
        approvalStatus[tokenIdStr] = false;
      }
    }
    setNftApprovalStatus(approvalStatus);
  }, [config, address, userNFTs]);

  useEffect(() => { checkApprovalStatus(); }, [checkApprovalStatus]);

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
    if (!address) { setOwnedTokenId(null); return; }
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

  useEffect(() => { fetchOwnedTokenId(); }, [fetchOwnedTokenId]);

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
      const [currentPhase, eid, elapsed, remaining] = info as [string, bigint, bigint, bigint];
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
      if (bidderAddress && bidderAddress !== "0x0000000000000000000000000000000000000000") {
        try {
          const baseName = await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: "0x4200000000000000000000000000000000000006",
              abi: [{ inputs: [{ name: "name", type: "string" }], name: "addr", outputs: [{ name: "", type: "address" }], stateMutability: "view", type: "function" }],
              functionName: "addr",
              args: [bidderAddress],
            })) as string;
          });
          if (baseName && typeof baseName === "string" && baseName !== "0x0000000000000000000000000000000000000000") {
            setActiveBidderName(baseName);
          } else {
            setActiveBidderName(`${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`);
          }
        } catch {
          setActiveBidderName(`${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`);
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
    if (!address || !config) { setUserNFTs([]); return; }
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
        } catch { break; }
      }
      setUserNFTs(nfts);
    } catch (error) {
      console.error("Error getting user NFTs:", error);
      setUserNFTs([]);
    }
  }, [address, config]);

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) { setNftImages({}); return; }
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
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const base64Data = tokenURI.split(",")[1];
        const jsonData = JSON.parse(atob(base64Data));
        if (jsonData.image_data) {
          images[tokenIdStr] = `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
        }
      }
    } catch (error) {
      console.error(`Error getting image for token ${highestTokenId}:`, error);
    }
    setNftImages(images);
  }, [userNFTs, config]);

  useEffect(() => { calculateYieldPerNFT(); }, [calculateYieldPerNFT]);
  useEffect(() => { getNFTImages(); }, [getNFTImages]);

  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) { checkUserSignedStatus(); }
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  useEffect(() => {
    const fetchAllData = async () => {
      const now = Date.now();
      if (now - lastFetchTime < CACHE_DURATION) return;
      setIsLoading(true);
      setRpcError(null);
      try {
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
        setLastFetchTime(now);
      } catch (error) {
        console.error("Error fetching data:", error);
        setRpcError("Failed to load some data. Retrying...");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
    const interval = setInterval(fetchAllData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [getPhaseInfo, getDailySigners, getDailyVault, getCurrentBid, getActiveBidder, checkUserSignedStatus, getUserNFTs, checkApprovalStatus, lastFetchTime, CACHE_DURATION]);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) return 0;
        if (prev === 1) setLastFetchTime(0);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownInterval);
  }, []);

  const formatTimeRemaining = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return "Daily Sign";
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) return "Refreshing...";
        return `Claim: ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else {
        return "Daily Sign";
      }
    } else {
      if (userHasClaimed) return `Next sign: ${formatTimeRemaining(remainingTimeDisplay)}`;
      else if (userHasSigned) return "Claim";
      else return `Sign ended: ${formatTimeRemaining(remainingTimeDisplay)}`;
    }
  }, [phaseInfo, userHasSigned, userHasClaimed, remainingTimeDisplay, formatTimeRemaining]);

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

  const handleBidInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    let nextValue = event.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
    const firstDotIndex = nextValue.indexOf(".");
    if (firstDotIndex !== -1) {
      nextValue = nextValue.slice(0, firstDotIndex + 1) + nextValue.slice(firstDotIndex + 1).replace(/\./g, "");
    }
    if (nextValue.startsWith(".")) nextValue = `0${nextValue}`;
    setBidInput(nextValue);
  }, []);

  const handleBid = useCallback(async () => {
    if (!address) { toast.warning("Please connect your wallet first"); return; }
    try {
      await ensureBase();
      const bidAmount = parseFloat(bidInput || "0");
      if (bidAmount < MINIMUM_BID_FOR_SELL) {
        toast.error(`Bid amount must be at least ${MINIMUM_BID_FOR_SELL} ETH.`);
        return;
      }
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, { duration: 5000, action: { label: "Retry", onClick: () => handleBid() } });
    }
  }, [config, ensureBase, bidInput, address, getCurrentBid, getActiveBidder]);

  const handleSellNFT = useCallback(async (tokenId: bigint) => {
    if (!address) { toast.warning("Please connect your wallet first"); return; }
    try {
      await ensureBase();
      const currentBidNumber = parseFloat(currentBid);
      if (currentBidNumber < MINIMUM_BID_FOR_SELL) {
        toast.error(`Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`);
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Sell failed: ${errorMessage}`, { duration: 5000, action: { label: "Retry", onClick: () => handleSellNFT(tokenId) } });
    }
  }, [config, ensureBase, address, nftApprovalStatus, nftLoadingStatus, checkIndividualNFTApprovals, currentBid, userNFTs, getCurrentBid, getActiveBidder, getDailyVault, getUserNFTs]);

  const handleSign = useCallback(async () => {
    if (!address) { toast.warning("Please connect your wallet first"); return; }
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
      if (!owned || owned.length === 0) { toast.error("No NFTs owned"); return; }
      if (owned.length > 1) { toast.warning("You must hodl only 1 vrnouns in your wallet"); return; }
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
      setTimeout(() => { checkUserSignedStatus(); getPhaseInfo(); }, 2000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Sign/Claim failed: ${errorMessage}`, { duration: 5000, action: { label: "Retry", onClick: () => handleSign() } });
    }
  }, [config, ensureBase, phaseInfo, address, checkUserSignedStatus, getPhaseInfo]);

  const isSignPhase =
    phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
    phaseInfo?.currentPhase.toLowerCase() === "signing" ||
    phaseInfo?.currentPhase.toLowerCase() === "sign_phase";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#ffffff", color: "#1a1a1a" }}>

      {/* Header — nouns.wtf style */}
      <header style={{ backgroundColor: "#e8e8e8", borderBottom: "1px solid #d5d5d5" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo className="h-10 w-auto" />
            <nav className="hidden md:flex items-center gap-6 text-sm font-semibold" style={{ color: "#444" }}>
              <a href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">Docs</a>
              <a href="https://snapshot.org/#/s:vrnouns.eth" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">DAO</a>
              <a href="https://opensea.io/collection/vrnouns" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">VRNouns</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {/* Phase badge */}
            {phaseInfo && (
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${isSignPhase ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                <span className={`w-2 h-2 rounded-full ${isSignPhase ? "bg-green-500" : "bg-amber-500"}`}></span>
                {isSignPhase ? "SIGN PHASE" : "CLAIM PHASE"}
              </div>
            )}
            <ConnectButton.Custom>
              {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div {...(!ready && { "aria-hidden": true, style: { opacity: 0, pointerEvents: "none", userSelect: "none" } })}>
                    {!connected ? (
                      <button onClick={openConnectModal} type="button"
                        className="px-5 py-2 font-bold text-sm transition-colors rounded-lg"
                        style={{ backgroundColor: "#1a1a1a", color: "#fff" }}>
                        Connect Wallet
                      </button>
                    ) : chain.unsupported ? (
                      <button onClick={openChainModal} type="button"
                        className="px-4 py-2 rounded-lg font-bold text-sm bg-red-100 text-red-600 border border-red-300">
                        Wrong Network
                      </button>
                    ) : (
                      <button onClick={openAccountModal} type="button"
                        className="px-5 py-2 font-bold text-sm rounded-lg border transition-colors flex items-center gap-2"
                        style={{ borderColor: "#ccc", backgroundColor: "#fff" }}>
                        {chain.hasIcon && chain.iconUrl && (
                          <Image alt={chain.name ?? "Chain icon"} src={chain.iconUrl} width={16} height={16} />
                        )}
                        {account.displayName}
                      </button>
                    )}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </header>

      {/* Network Warning */}
      {showNetworkWarning && address && (
        <div className="bg-red-50 border-b border-red-200 py-3 px-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-red-700 font-semibold text-sm">Wrong network — please switch to Base</span>
            <button onClick={() => ensureBase()} className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-bold hover:bg-red-700 transition-colors">
              Switch to Base
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-12">

        {/* Hero: Two-column layout — nouns.wtf style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">

          {/* Left: NFT Image */}
          <div>
            <a href="https://opensea.io/collection/vrnouns" target="_blank" rel="noopener noreferrer"
              className="block rounded-2xl overflow-hidden hover:opacity-95 transition-opacity"
              style={{ border: "1px solid #e0e0e0" }}>
              <Image
                src="/bg.png"
                alt="VRNouns Collection"
                width={560}
                height={560}
                priority
                className="w-full h-auto object-cover"
              />
            </a>
          </div>

          {/* Right: Auction Info */}
          <div className="flex flex-col gap-6">

            {/* Title */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>
                {isSignPhase ? "Sign Phase" : "Claim Phase"} · Epoch #{phaseInfo ? phaseInfo.eid.toString() : "—"}
              </p>
              <h1 className="text-4xl font-extrabold leading-tight" style={{ color: "#1a1a1a" }}>
                VRNouns
              </h1>
            </div>

            {/* Current Bid */}
            <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>Current bid</p>
              <div className="flex items-baseline gap-2">
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1a1a1a" }}>
                  <path d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z" />
                  <path d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z" />
                </svg>
                <span className="text-5xl font-extrabold" style={{ color: "#1a1a1a" }}>{currentBid}</span>
              </div>
              {activeBidder && activeBidder !== "0x0000000000000000000000000000000000000000" && (
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-5 h-5 rounded-full overflow-hidden">
                    <canvas
                      ref={(canvas) => {
                        if (canvas && activeBidder) {
                          try {
                            const blockieCanvas = blockies({ seed: activeBidder.toLowerCase(), size: 8, scale: 4 });
                            const ctx = canvas.getContext("2d");
                            if (ctx) { canvas.width = 32; canvas.height = 32; ctx.drawImage(blockieCanvas, 0, 0); }
                          } catch (e) { console.error(e); }
                        }
                      }}
                      className="w-full h-full"
                    />
                  </div>
                  <a href={`https://basescan.org/address/${activeBidder}`} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold hover:underline" style={{ color: "#4965f0" }}>
                    {activeBidderName || `${activeBidder.slice(0, 6)}...${activeBidder.slice(-4)}`}
                  </a>
                </div>
              )}
            </div>

            {/* Timer */}
            <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>
                {isSignPhase ? "Sign window closes in" : "Claim window closes in"}
              </p>
              <p className="text-3xl font-extrabold tabular-nums" style={{ color: "#1a1a1a" }}>
                {formatTimeRemaining(remainingTimeDisplay)}
              </p>
            </div>

            {/* Bid Input + Button */}
            <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
              <div className="flex gap-3">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={`Ξ ${MINIMUM_BID_FOR_SELL} or more`}
                  className="flex-1 px-4 py-3 rounded-xl text-base font-semibold focus:outline-none transition-colors"
                  style={{ border: "2px solid #d0d0d0", backgroundColor: "#fafafa", color: "#1a1a1a" }}
                  value={bidInput}
                  onChange={handleBidInputChange}
                />
                <button
                  onClick={handleBid}
                  className="px-8 py-3 rounded-xl font-bold text-base transition-colors"
                  style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
                >
                  Bid
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: "#aaa" }}>Minimum bid: Ξ {MINIMUM_BID_FOR_SELL}</p>
            </div>

            {/* Sign / Claim Button */}
            <button
              onClick={handleSign}
              disabled={isSignButtonDisabled()}
              className="w-full py-3 rounded-xl font-bold text-base transition-colors"
              style={isSignButtonDisabled()
                ? { backgroundColor: "#e8e8e8", color: "#aaa", cursor: "not-allowed" }
                : { backgroundColor: isSignPhase ? "#1a1a1a" : "#f0a500", color: isSignPhase ? "#fff" : "#1a1a1a" }}
            >
              {getSignButtonText()}
            </button>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4" style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>Signers</p>
                <p className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>{dailySigners}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>Vault</p>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1a1a1a" }}>
                    <path d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z" />
                    <path d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z" />
                  </svg>
                  <p className="text-xl font-extrabold" style={{ color: "#1a1a1a" }}>{dailyVault}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#888" }}>Yield/NFT</p>
                <div className="flex items-center gap-1">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{ color: "#1a1a1a" }}>
                    <path d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z" />
                    <path d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z" />
                  </svg>
                  <p className="text-xl font-extrabold" style={{ color: "#1a1a1a" }}>{yieldPerNFT}</p>
                </div>
              </div>
            </div>

            {/* Your NFTs */}
            {address && (
              <div style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#888" }}>Your NFTs — click to sell</p>
                {isCheckingApproval && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: "#888" }}>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
                    Checking approval...
                  </div>
                )}
                {userNFTs.length > 0 ? (() => {
                  const highestTokenId = userNFTs.reduce((a, b) => (a > b ? a : b));
                  const tokenIdStr = highestTokenId.toString();
                  const moreCount = userNFTs.length - 1;
                  return (
                    <div className="flex items-center gap-4">
                      <div
                        className="relative w-16 h-16 rounded-xl overflow-hidden cursor-pointer group transition-all"
                        style={{ border: "2px solid #e0e0e0" }}
                        onClick={() => handleSellNFT(highestTokenId)}
                        title={`Sell Noun #${tokenIdStr}`}
                      >
                        {userNFTs.length > 1 && (
                          <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-xs px-1 py-0.5 text-center font-bold z-10">
                            Hold 1 only
                          </div>
                        )}
                        {nftImages[tokenIdStr] ? (
                          <Image src={nftImages[tokenIdStr]} alt={`Noun ${tokenIdStr}`} width={64} height={64} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: "#f0f0f0" }}>
                            <span className="text-xs font-bold" style={{ color: "#666" }}>#{tokenIdStr}</span>
                          </div>
                        )}
                        {nftLoadingStatus[tokenIdStr] && (
                          <div className="absolute inset-0 bg-blue-500 bg-opacity-80 flex items-center justify-center">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                          </div>
                        )}
                        {!nftApprovalStatus[tokenIdStr] && !nftLoadingStatus[tokenIdStr] && (
                          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                            <span className="text-white text-xs font-bold">Approve</span>
                          </div>
                        )}
                        {nftApprovalStatus[tokenIdStr] && !nftLoadingStatus[tokenIdStr] && (
                          <div className="absolute inset-0 bg-green-500 bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                            <span className="text-white text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity">Sell</span>
                          </div>
                        )}
                        <div className="absolute bottom-0.5 left-0.5 bg-black bg-opacity-70 text-white text-xs px-1 rounded font-bold">
                          #{tokenIdStr}
                        </div>
                      </div>
                      <div>
                        <p className="font-bold text-sm" style={{ color: "#1a1a1a" }}>Noun #{tokenIdStr}</p>
                        {moreCount > 0 && <p className="text-xs" style={{ color: "#aaa" }}>+{moreCount} more NFT{moreCount > 1 ? "s" : ""}</p>}
                        <p className="text-xs mt-1" style={{ color: nftApprovalStatus[tokenIdStr] ? "#22c55e" : "#f59e0b" }}>
                          {nftApprovalStatus[tokenIdStr] ? "Approved — ready to sell" : "Approval required"}
                        </p>
                      </div>
                    </div>
                  );
                })() : (
                  <p className="text-sm" style={{ color: "#aaa" }}>No VRNouns found in wallet</p>
                )}
              </div>
            )}

            {/* Quick links */}
            <div className="flex flex-wrap gap-3" style={{ borderTop: "1px solid #e0e0e0", paddingTop: "1.5rem" }}>
              <a href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: "#f0f0f0", color: "#555" }}>
                Farcaster Mini App
              </a>
              <a href="https://base.app/app/flooor.fun" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: "#f0f0f0", color: "#555" }}>
                Base App
              </a>
              <button
                onClick={() => {
                  setLastFetchTime(0);
                  setIsLoading(true);
                  Promise.allSettled([
                    getPhaseInfo(), getDailySigners(), getDailyVault(),
                    getCurrentBid(), getActiveBidder(), checkUserSignedStatus(),
                    getUserNFTs(), checkApprovalStatus(),
                  ]).finally(() => setIsLoading(false));
                }}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ backgroundColor: "#f0f0f0", color: isLoading ? "#aaa" : "#555", cursor: isLoading ? "not-allowed" : "pointer" }}
              >
                {isLoading ? (
                  <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div> Refreshing...</>
                ) : (
                  <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Refresh</>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* Info Cards — nouns.wtf style full-width section */}
        <div className="mt-24 pt-16" style={{ borderTop: "1px solid #e0e0e0" }}>
          <h2 className="text-3xl font-extrabold text-center mb-12" style={{ color: "#1a1a1a" }}>
            Royalties to the community.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl p-8 flex flex-col justify-between min-h-48" style={{ backgroundColor: "#63A0F9" }}>
              <p className="text-lg font-bold leading-snug">
                Light stake (sign) with your NFT. 5% of all royalties are shared with signers.
              </p>
            </div>
            <div className="rounded-2xl p-8 flex flex-col justify-between min-h-48" style={{ backgroundColor: "#FFC110" }}>
              <p className="text-lg font-bold leading-snug">
                No more listing. Just bid or sell.
              </p>
            </div>
            <div className="rounded-2xl p-8 flex flex-col justify-between min-h-48" style={{ backgroundColor: "#FE500C" }}>
              <p className="text-lg font-bold leading-snug">
                Built on game theory — designed so the whole group wins together.
              </p>
            </div>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #e0e0e0", backgroundColor: "#fafafa", marginTop: "6rem" }}>
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-auto" />
            <span className="font-bold text-sm" style={{ color: "#888" }}>flooor.fun</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm font-semibold" style={{ color: "#888" }}>
            <a href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">Docs</a>
            <a href="https://github.com/omgbbqhaxx/flooor" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">GitHub</a>
            <a href="https://x.com/vrnouns" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">X</a>
            <a href="https://basescan.org/address/0xbb56a9359df63014b3347585565d6f80ac6305fd#readContract" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">VRNouns</a>
            <a href="https://basescan.org/address/0xf6b2c2411a101db46c8513ddaef10b11184c58ff#readContract" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">Flooor</a>
            <a href="https://snapshot.org/#/s:vrnouns.eth" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">Snapshot</a>
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs" style={{ borderColor: "#e0e0e0", color: "#bbb" }}>
          © 2025 flooor.fun · CC0 Licensed · Front-end v1.0.18 · Contract v1.0 · Beta
        </div>
      </footer>

    </div>
  );
}
