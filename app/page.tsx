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
import Image from "next/image";
import blockies from "blockies";

// Retry utility with exponential backoff
const retryWithBackoff = async (
  fn: () => Promise<unknown>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<unknown> => {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Check if it's a rate limit or connection error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isRetryableError =
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests") ||
        errorMessage.includes("ERR_CONNECTION_RESET") ||
        errorMessage.includes("ERR_TIMED_OUT") ||
        errorMessage.includes("timeout");

      if (!isRetryableError) {
        throw lastError;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries + 1} after ${delay}ms delay`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
};

import MARKET_ABI from "@/app/abi/market.json";
import NFT_ABI from "@/app/abi/nft.json";

// Addresses
const CONTRACT_ADDR = "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const;
const COLLECTION_ADDR = "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const;

export default function Page() {
  //const calls = []; // to be populated with buyFloor call later
  const [bidInput, setBidInput] = useState("");
  const [isApproved, setIsApproved] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
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
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const config = useConfig();
  const chainId = useChainId();
  const { address } = useAccount();
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);

  // Cache duration in milliseconds (5 minutes)
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

  // Check approval status
  const checkApprovalStatus = useCallback(async () => {
    if (!address) {
      setIsApproved(false);
      return;
    }

    setIsCheckingApproval(true);
    try {
      const approved = await retryWithBackoff(async () => {
        return await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
        });
      });
      setIsApproved(approved as boolean);
    } catch (error) {
      console.error("Error checking approval status:", error);
      setIsApproved(false);
    } finally {
      setIsCheckingApproval(false);
    }
  }, [config, address]);

  // Check approval status when address changes
  useEffect(() => {
    checkApprovalStatus();
  }, [checkApprovalStatus]);

  // Check approval status when user NFTs change (new NFT acquired)
  useEffect(() => {
    if (userNFTs.length > 0) {
      checkApprovalStatus();
    }
  }, [userNFTs, checkApprovalStatus]);

  // Fetch owned token ID
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

  // Fetch owned token ID when address changes
  useEffect(() => {
    fetchOwnedTokenId();
  }, [fetchOwnedTokenId]);

  // Get phase info from contract
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
        bigint
      ];

      setPhaseInfo({
        currentPhase,
        eid,
        elapsed,
        remaining,
      });

      setRemainingTimeDisplay(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  // Get daily signers count
  const getDailySigners = useCallback(async () => {
    try {
      // Get currentEpochStart and use it directly for partCount
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

  // Get daily vault amount
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

      const etherAmount = formatEther(poolAccrued);
      const etherNumber = parseFloat(etherAmount);
      setDailyVault(etherNumber.toFixed(8));
    } catch (error) {
      console.error("Error getting daily vault:", error);
    }
  }, [config]);

  // Get current bid amount
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

      // Convert wei to ether using viem's formatEther for precise conversion
      const etherAmount = formatEther(activeBidAmount);
      const etherNumber = parseFloat(etherAmount);
      setCurrentBid(etherNumber.toFixed(8));
    } catch (error) {
      console.error("Error getting current bid:", error);
    }
  }, [config]);

  // Get active bidder address
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

      // Try to resolve ENS/Base name
      if (
        bidderAddress &&
        bidderAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          // Try Base name resolution first
          const baseName = await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: "0x4200000000000000000000000000000000000006", // Base Name Service
              abi: [
                {
                  inputs: [{ name: "name", type: "string" }],
                  name: "addr",
                  outputs: [{ name: "", type: "address" }],
                  stateMutability: "view",
                  type: "function",
                },
              ],
              functionName: "addr",
              args: [bidderAddress],
            })) as string;
          });

          if (
            baseName &&
            typeof baseName === "string" &&
            baseName !== "0x0000000000000000000000000000000000000000"
          ) {
            setActiveBidderName(baseName);
          } else {
            // Fallback to shortened address
            setActiveBidderName(
              `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`
            );
          }
        } catch {
          // Fallback to shortened address
          setActiveBidderName(
            `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`
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

  // Check if user has signed in current epoch
  const checkUserSignedStatus = useCallback(async () => {
    if (!address || !phaseInfo) {
      setUserHasSigned(false);
      setUserHasClaimed(false);
      return;
    }

    if (!ownedTokenId) {
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
        } catch (error: unknown) {
          const errorMsg = (error as Error)?.message?.toLowerCase() || "";
          if (
            errorMsg.includes("already claimed") ||
            errorMsg.includes("claimed")
          ) {
            claimedStatus = true;
          }
        }
      } else {
        claimedStatus = false;
      }

      setUserHasClaimed(claimedStatus);
    } catch (error) {
      console.error("Error checking user signed status:", error);
      setUserHasSigned(false);
      setUserHasClaimed(false);
    }
  }, [config, address, phaseInfo, ownedTokenId]);

  // Calculate yield per NFT
  const calculateYieldPerNFT = useCallback(() => {
    const vaultAmount = parseFloat(dailyVault);
    const signersCount = dailySigners;

    if (signersCount > 0 && vaultAmount > 0) {
      const yieldPerNFTAmount = vaultAmount / signersCount;
      setYieldPerNFT(yieldPerNFTAmount.toFixed(8));
    } else {
      setYieldPerNFT("0.00000000");
    }
  }, [dailyVault, dailySigners]);

  // Get user's NFTs
  const getUserNFTs = useCallback(async () => {
    if (!address || !config) {
      setUserNFTs([]);
      return;
    }

    try {
      const nfts: bigint[] = [];

      // Get first 5 NFTs owned by user
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
          // No more NFTs or error
          break;
        }
      }

      setUserNFTs(nfts);
    } catch (error) {
      console.error("Error getting user NFTs:", error);
      setUserNFTs([]);
    }
  }, [address, config]);

  // Get NFT images from tokenURI
  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) {
      setNftImages({});
      return;
    }

    const images: { [key: string]: string } = {};

    for (const tokenId of userNFTs) {
      try {
        const tokenURI = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "tokenURI",
            args: [tokenId],
          })) as string;
        })) as string;

        // Decode base64 JSON
        if (tokenURI.startsWith("data:application/json;base64,")) {
          const base64Data = tokenURI.split(",")[1];
          const jsonData = JSON.parse(atob(base64Data));

          if (jsonData.image_data) {
            // Create data URL for SVG
            const svgDataUrl = `data:image/svg+xml;base64,${btoa(
              jsonData.image_data
            )}`;
            images[tokenId.toString()] = svgDataUrl;
          }
        }
      } catch (error) {
        console.error(`Error getting image for token ${tokenId}:`, error);
      }
    }

    setNftImages(images);
  }, [userNFTs, config]);

  // Update yield per NFT when vault or signers change
  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);

  // Get NFT images when userNFTs change
  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);

  // Check user signed status when address or phase changes
  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) {
      checkUserSignedStatus();
    }
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  // Update phase info when component mounts and periodically
  useEffect(() => {
    const fetchAllData = async () => {
      const now = Date.now();

      // Skip if we fetched recently (within cache duration)
      if (now - lastFetchTime < CACHE_DURATION) {
        return;
      }

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

    // Update all data every 2 minutes (reduced frequency)
    const interval = setInterval(fetchAllData, 2 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [
    getPhaseInfo,
    getDailySigners,
    getDailyVault,
    getCurrentBid,
    getActiveBidder,
    checkUserSignedStatus,
    getUserNFTs,
    lastFetchTime,
    CACHE_DURATION,
  ]);

  // Countdown timer - updates every second
  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) {
          setLastFetchTime(0);
          return 0;
        }

        if (prev <= 120) {
          setLastFetchTime(0);
        }

        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countdownInterval);
    };
  }, []);

  // Format time as HH:MM:SS
  const formatTimeRemaining = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0"
    )}:${String(secs).padStart(2, "0")}`;
  }, []);

  // Get button text based on phase and user's sign status
  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return "Daily Sign";

    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) {
          return "Refreshing...";
        }
        return `Claim: ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else {
        return "Daily Sign";
      }
    } else {
      if (userHasClaimed) {
        return `Next sign: ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else if (userHasSigned) {
        return "Claim";
      } else {
        return `Sign ended: ${formatTimeRemaining(remainingTimeDisplay)}`;
      }
    }
  }, [
    phaseInfo,
    userHasSigned,
    userHasClaimed,
    remainingTimeDisplay,
    formatTimeRemaining,
  ]);

  // Check if button should be disabled
  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo) return true;
    if (!address) return true;

    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    if (remainingTimeDisplay < 30 && isSignPhase && userHasSigned) {
      return true;
    }

    if (isSignPhase) {
      return userHasSigned;
    } else {
      return !userHasSigned || userHasClaimed;
    }
  }, [phaseInfo, userHasSigned, userHasClaimed, address, remainingTimeDisplay]);

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value;
      // Convert commas to dots
      nextValue = nextValue.replace(/,/g, ".");
      // Remove all characters except digits and dots
      nextValue = nextValue.replace(/[^0-9.]/g, "");
      // Keep only the first dot
      const firstDotIndex = nextValue.indexOf(".");
      if (firstDotIndex !== -1) {
        nextValue =
          nextValue.slice(0, firstDotIndex + 1) +
          nextValue.slice(firstDotIndex + 1).replace(/\./g, "");
      }
      // If it starts with a dot, prefix 0
      if (nextValue.startsWith(".")) {
        nextValue = `0${nextValue}`;
      }
      setBidInput(nextValue);
    },
    []
  );

  const handleBid = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
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
      });
      toast.success("Bid placed successfully! 🎉");
    } catch (error) {
      if (error instanceof Error && error.message.includes("network")) {
        toast.error(
          "Transaction cancelled: Wrong network. Please switch to Base."
        );
      } else {
        throw error;
      }
    }
  }, [config, ensureBase, bidInput, address]);

  const handleSell = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    try {
      await ensureBase();

      // Check approval status before selling
      await checkApprovalStatus();

      // If not approved, redirect to approve and sell
      if (!isApproved) {
        toast.warning("Approval required. Please use 'Approve & Sell' button.");
        return;
      }

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
      const tokenId = owned.reduce((a, b) => (a > b ? a : b));
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "sellToHighest",
        args: [tokenId],
      });
      toast.success("NFT sold successfully! 🎉");
    } catch (error) {
      if (error instanceof Error && error.message.includes("network")) {
        alert("Transaction cancelled: Wrong network. Please switch to Base.");
      } else {
        throw error;
      }
    }
  }, [config, ensureBase, address, isApproved, checkApprovalStatus]);

  const handleApproveAndSell = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }

    try {
      await ensureBase();

      // Always check approval status before proceeding
      await checkApprovalStatus();

      if (!isApproved) {
        await writeContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "setApprovalForAll",
          args: [CONTRACT_ADDR, true],
        });
        toast.success("Approval set for marketplace contract ✅");
        // Re-check approval status after setting approval
        await checkApprovalStatus();
      }

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
      const tokenId = owned.reduce((a, b) => (a > b ? a : b));
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "sellToHighest",
        args: [tokenId],
      });
      toast.success("NFT sold successfully! 🎉");
    } catch (error) {
      if (error instanceof Error && error.message.includes("network")) {
        toast.error(
          "Transaction cancelled: Wrong network. Please switch to Base."
        );
      } else {
        throw error;
      }
    }
  }, [config, ensureBase, address, isApproved, checkApprovalStatus]);

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
      });

      if (isSignPhase) {
        setUserHasSigned(true);
        toast.success("Sign successful! ✍️");
      } else {
        setUserHasClaimed(true);
        toast.success("Claim successful! 💰");
      }

      setTimeout(() => {
        checkUserSignedStatus();
        getPhaseInfo();
      }, 2000);
    } catch (error) {
      if (error instanceof Error && error.message.includes("network")) {
        toast.error(
          "Transaction cancelled: Wrong network. Please switch to Base."
        );
      } else {
        throw error;
      }
    }
  }, [
    config,
    ensureBase,
    phaseInfo,
    address,
    checkUserSignedStatus,
    getPhaseInfo,
  ]);

  return (
    <div className="text-white min-h-screen">
      <div className="max-w-3xl mx-auto px-3">
        <header className="py-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Logo className="h-24 w-auto mt-1" />
            </div>

            <div>
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
                      {(() => {
                        if (!connected) {
                          return (
                            <button
                              onClick={openConnectModal}
                              type="button"
                              className="px-6 py-2 border-2 border-gray-400 rounded-full hover:bg-transparent transition text-sm !bg-transparent"
                              style={{
                                color: "rgb(9, 9, 11)",
                                fontSize: "15px",
                                letterSpacing: "-0.01em",
                                fontWeight: "500",
                              }}
                            >
                              Connect Wallet
                            </button>
                          );
                        }

                        if (chain.unsupported) {
                          return (
                            <button
                              onClick={openChainModal}
                              type="button"
                              className="px-4 py-2 border-2 border-red-400 rounded-full hover:bg-red-50 transition text-sm bg-red-100 text-red-600 font-bold"
                            >
                              Wrong Network
                            </button>
                          );
                        }

                        return (
                          <div className="flex gap-2">
                            <button
                              onClick={openAccountModal}
                              type="button"
                              className="px-6 py-2 border-2 border-gray-400 rounded-full hover:bg-transparent transition text-sm !bg-transparent flex items-center gap-2"
                              style={{
                                color: "rgb(9, 9, 11)",
                                fontSize: "15px",
                                letterSpacing: "-0.01em",
                                fontWeight: "500",
                              }}
                            >
                              {chain.hasIcon && chain.iconUrl && (
                                <Image
                                  alt={chain.name ?? "Chain icon"}
                                  src={chain.iconUrl}
                                  width={20}
                                  height={20}
                                />
                              )}
                              {account.displayName}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </div>
        </header>

        <main className="flex flex-col mt-20 space-y-16">
          {/* Hero Section - Resim ve İçerik */}
          <div className="flex flex-col lg:flex-row items-center lg:items-start space-y-8 lg:space-y-0 lg:space-x-12 w-full">
            {/* Resim - Mobilde ortalanmış */}
            <div className="w-64 h-64 bg-gray-300 rounded-lg flex items-center justify-center flex-shrink-0">
              <Image
                src="/bg.png"
                alt="Açıklamaa"
                width={256}
                height={256}
                priority
                className="w-full h-full object-cover rounded-lg"
              />
            </div>

            {/* İçerik - Sağ tarafta */}
            <div className="flex flex-col space-y-6 lg:max-w-md">
              {/* Network Warning Banner */}
              {showNetworkWarning && address && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <svg
                        className="h-5 w-5 mr-2"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="font-bold">
                        Wrong Network! Please switch to Base
                      </span>
                    </div>
                    <button
                      onClick={() => ensureBase()}
                      className="ml-2 px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-xs font-bold"
                    >
                      Switch Network
                    </button>
                  </div>
                </div>
              )}

              {/* RPC Error Banner */}
              {rpcError && (
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg text-sm">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700 mr-2"></div>
                    {rpcError}
                  </div>
                </div>
              )}

              {/* Loading Indicator */}
              {isLoading && !rpcError && (
                <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded-lg text-sm">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-700 mr-2"></div>
                    Loading latest data...
                  </div>
                </div>
              )}

              {/* Manual Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setLastFetchTime(0); // Force refresh by resetting cache
                    const fetchAllData = async () => {
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
                        setLastFetchTime(Date.now());
                      } catch (error) {
                        console.error("Error fetching data:", error);
                        setRpcError("Failed to load some data. Retrying...");
                      } finally {
                        setIsLoading(false);
                      }
                    };
                    fetchAllData();
                  }}
                  className="inline-flex items-center px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1.5"></div>
                      Refreshing...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-3 h-3 mr-1.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Refresh Data
                    </>
                  )}
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 font-oldschool uppercase tracking-wide mb-1">
                      Daily Signers
                    </div>
                    <div className="text-lg font-oldschool font-bold text-black">
                      {dailySigners}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-gray-500 font-oldschool uppercase tracking-wide mb-1">
                      Daily Vault
                    </div>
                    <div className="flex items-center justify-center text-lg font-oldschool font-bold text-black">
                      <svg
                        className="w-7 h-7 mr-2"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z"
                          fill="currentColor"
                        />
                        <path
                          d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z"
                          fill="currentColor"
                        />
                      </svg>
                      {dailyVault}
                    </div>
                  </div>

                  <div className="text-center">
                    <div className="text-xs text-gray-500 font-oldschool uppercase tracking-wide mb-1">
                      Yield per NFT
                    </div>
                    <div className="flex items-center justify-center text-lg font-oldschool font-bold text-black">
                      <svg
                        className="w-7 h-7 mr-2"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z"
                          fill="currentColor"
                        />
                        <path
                          d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z"
                          fill="currentColor"
                        />
                      </svg>
                      {yieldPerNFT}
                    </div>
                  </div>
                </div>
              </div>

              {/* Current Bid & Action Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {/* Current Bid Card */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
                  <div className="text-center">
                    <div className="text-xs text-blue-600 font-oldschool uppercase tracking-wide mb-1">
                      Current Bid
                    </div>
                    <div className="flex items-center justify-center text-xl font-oldschool font-bold text-blue-900 mb-2">
                      <svg
                        className="w-7 h-7 mr-2"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z"
                          fill="currentColor"
                        />
                        <path
                          d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z"
                          fill="currentColor"
                        />
                      </svg>
                      {currentBid}
                    </div>
                    {activeBidder &&
                      activeBidder !==
                        "0x0000000000000000000000000000000000000000" && (
                        <div className="flex items-center justify-center text-xs text-blue-500 font-oldschool">
                          {activeBidder && (
                            <div className="w-4 h-4 mr-1 rounded-full overflow-hidden relative">
                              <div className="absolute inset-0 rounded-full overflow-hidden">
                                <canvas
                                  ref={(canvas) => {
                                    if (canvas && activeBidder) {
                                      try {
                                        const blockieCanvas = blockies({
                                          seed: activeBidder.toLowerCase(),
                                          size: 8,
                                          scale: 4,
                                        });
                                        const ctx = canvas.getContext("2d");
                                        if (ctx) {
                                          canvas.width = 32;
                                          canvas.height = 32;
                                          ctx.drawImage(blockieCanvas, 0, 0);
                                        }
                                      } catch (error) {
                                        console.error(
                                          "Error drawing blockie:",
                                          error
                                        );
                                      }
                                    }
                                  }}
                                  className="w-full h-full"
                                />
                              </div>
                            </div>
                          )}
                          <a
                            href={`https://basescan.org/address/${activeBidder}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-700 hover:underline transition-colors cursor-pointer inline-flex items-center"
                            title={`View ${
                              activeBidderName || activeBidder
                            } on Basescan`}
                          >
                            {activeBidderName ||
                              `${activeBidder.slice(
                                0,
                                6
                              )}...${activeBidder.slice(-4)}`}
                            <svg
                              className="w-3 h-3 ml-1"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                              />
                            </svg>
                          </a>
                        </div>
                      )}
                  </div>
                </div>

                {/* Action Card */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                  <div className="text-center">
                    <div className="text-xs text-green-600 font-oldschool uppercase tracking-wide mb-1">
                      {isApproved ? "Ready to Sell" : "Approve & Sell"}
                    </div>
                    <div className="mb-2">
                      {isCheckingApproval ? (
                        <div className="inline-flex items-center px-3 py-1.5 bg-green-100 text-green-700 rounded-md font-oldschool text-xs">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-600 mr-1.5"></div>
                          Checking...
                        </div>
                      ) : (
                        <button
                          onClick={
                            isApproved ? handleSell : handleApproveAndSell
                          }
                          className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md font-oldschool font-medium hover:bg-green-700 transition-colors text-xs"
                        >
                          {isApproved ? "Sell" : "Approve & Sell"}
                        </button>
                      )}
                    </div>
                    {!isApproved && !isCheckingApproval && (
                      <div className="text-xs text-orange-600 font-oldschool text-center">
                        Approval required for new NFTs
                      </div>
                    )}
                    {address && userNFTs.length > 0 && userNFTs.length <= 5 && (
                      <div className="flex justify-center space-x-1">
                        {userNFTs.map((tokenId) => (
                          <a
                            key={tokenId.toString()}
                            href={`https://basescan.org/token/${COLLECTION_ADDR}?a=${tokenId.toString()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-4 h-4 rounded-full overflow-hidden border border-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
                            title={`View Noun #${tokenId.toString()} on Basescan`}
                          >
                            {nftImages[tokenId.toString()] ? (
                              <Image
                                src={nftImages[tokenId.toString()]}
                                alt={`Noun ${tokenId.toString()}`}
                                width={16}
                                height={16}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                <span className="text-xs font-bold text-gray-600">
                                  #{tokenId.toString()}
                                </span>
                              </div>
                            )}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 text-left">
                <div className="flex items-center space-x-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ξ 0.00"
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-oldschool text-lg bg-white text-black placeholder-gray-400 caret-black focus:border-black focus:outline-none transition-colors"
                      value={bidInput}
                      onChange={handleBidInputChange}
                    />
                  </div>

                  <button
                    onClick={handleBid}
                    className="px-6 py-3 bg-black text-white rounded-lg font-oldschool font-bold hover:bg-gray-800 transition-colors whitespace-nowrap"
                  >
                    Bid
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={handleSign}
                  disabled={isSignButtonDisabled()}
                  className={`px-8 py-3 rounded-full font-oldschool font-bold transition-colors min-w-[280px] tabular-nums ${
                    isSignButtonDisabled()
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-black text-white hover:bg-gray-800"
                  }`}
                >
                  {getSignButtonText()}
                </button>
                <a
                  href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-8 py-3 border-2 border-black text-black rounded-full font-oldschool font-bold hover:bg-black hover:text-white transition-colors inline-block text-center"
                >
                  Docs
                </a>
              </div>
            </div>
          </div>

          <div
            className="bg-white w-screen -mx-3 py-16"
            style={{
              marginLeft: "calc(-50vw + 50%)",
              marginRight: "calc(-50vw + 50%)",
            }}
          >
            <div className="max-w-3xl mx-auto px-3">
              <h1 className="text-4xl lg:text-5xl font-extrabold text-black font-oldschool leading-tight text-center mb-12">
                Royalties to the community.
              </h1>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 justify-items-center">
                <div className="bg-[#63A0F9] rounded-lg w-48 h-48 flex items-center justify-center px-2">
                  <span className="text-xl font-bold font-oldschool text-center">
                    Light stake (sign) with your nft. <br></br> %5 of all
                    royalties are shared with the stakers.<br></br>
                  </span>
                </div>

                <div className="bg-[#FFC110] rounded-lg w-48 h-48 flex items-center justify-center">
                  <span className="text-xl font-bold font-oldschool text-center">
                    No more Listing.<br></br> Just bid or sell.
                  </span>
                </div>
                <div className="bg-[#FE500C] rounded-lg w-48 h-48 flex items-center justify-center px-2">
                  <span className="text-xl font-bold font-oldschool text-center">
                    post-democratic distribution<br></br> with tri-quadratic
                    equations.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-32 border-t border-white-800">
          <div className="max-w-3xl mx-auto px-3 py-8">
            <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
              <div className="flex items-center space-x-4">
                <Logo className="h-8 w-auto" />
                <span className="text-sm text-gray-400 font-oldschool font-bold">
                  flooor.fun
                </span>
              </div>

              <div className="flex items-center space-x-6 text-sm text-gray-400">
                <a
                  href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Docs
                </a>
                <a
                  href="https://github.com/omgbbqhaxx/flooor"
                  target="_blank"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  GitHub
                </a>

                <a
                  href="https://x.com/vrnouns"
                  target="_blank"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Twitter
                </a>

                <a
                  href="https://basescan.org/address/0xf6b2c2411a101db46c8513ddaef10b11184c58ff#readContract"
                  target="_blank"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Contract
                </a>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white-800 text-center">
              <p className="text-xs text-gray-500 font-oldschool font-bold">
                © 2025 flooor.fun . CC0 - Licensed.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
