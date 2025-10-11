"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

import Logo from "@/app/svg/Logo";
import { useState, useCallback, useEffect } from "react";
import { useConfig, useChainId, useAccount } from "wagmi";
import { writeContract, readContract, switchChain } from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther, formatEther } from "viem";
import Image from "next/image";

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
  const [yieldPerNFT, setYieldPerNFT] = useState<string>("0");
  const [userHasSigned, setUserHasSigned] = useState<boolean>(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
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

      // Debug: Log the phase string to see what contract returns
      console.log("Contract phase string:", currentPhase);

      setPhaseInfo({
        currentPhase,
        eid,
        elapsed,
        remaining,
      });
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

      // Convert wei to ether using viem's formatEther for precise conversion
      console.log("PoolAccrued (wei):", poolAccrued.toString());

      const etherAmount = formatEther(poolAccrued);
      console.log("PoolAccrued (ETH):", etherAmount);

      // Parse the formatted ether string to a number and format to 8 decimal places
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

  // Check if user has signed in current epoch
  const checkUserSignedStatus = useCallback(async () => {
    if (!address || !phaseInfo) {
      setUserHasSigned(false);
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

      // If signedTokenId is 0, user hasn't signed
      setUserHasSigned((signedTokenId as bigint) > BigInt(0));
    } catch (error) {
      console.error("Error checking user signed status:", error);
      setUserHasSigned(false);
    }
  }, [config, address, phaseInfo]);

  // Calculate yield per NFT
  const calculateYieldPerNFT = useCallback(() => {
    const vaultAmount = parseFloat(dailyVault);
    const signersCount = dailySigners;

    console.log("Calculating yield per NFT:");
    console.log("Daily Vault:", dailyVault, "ETH");
    console.log("Daily Signers:", signersCount);

    if (signersCount > 0 && vaultAmount > 0) {
      const yieldPerNFTAmount = vaultAmount / signersCount;
      console.log("Yield per NFT:", yieldPerNFTAmount, "ETH");
      setYieldPerNFT(yieldPerNFTAmount.toFixed(8));
    } else {
      setYieldPerNFT("0.00000000");
    }
  }, [dailyVault, dailySigners]);

  // Update yield per NFT when vault or signers change
  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);

  // Check user signed status when address or phase changes
  useEffect(() => {
    checkUserSignedStatus();
  }, [checkUserSignedStatus, address, phaseInfo]);

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
          checkUserSignedStatus(),
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
    checkUserSignedStatus,
    lastFetchTime,
    CACHE_DURATION,
  ]);

  // Get button text based on phase and user's sign status
  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return "Daily Sign";

    // Check if it's sign phase - contract might return different string values
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    if (isSignPhase) {
      // During sign phase
      if (userHasSigned) {
        // User has signed, show remaining time until claim phase
        const remainingHours = Math.floor(Number(phaseInfo.remaining) / 3600);
        return `Claim in ${remainingHours}h`;
      } else {
        return "Daily Sign";
      }
    } else {
      // During claim phase
      if (userHasSigned) {
        return "Claim";
      } else {
        return "Sign period ended";
      }
    }
  }, [phaseInfo, userHasSigned]);

  // Check if button should be disabled
  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo) return false;

    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    if (isSignPhase) {
      // During sign phase: disable if user has already signed
      return userHasSigned;
    } else {
      // During claim phase: disable if user hasn't signed
      return !userHasSigned;
    }
  }, [phaseInfo, userHasSigned]);

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
        toast.error("Transaction cancelled: Wrong network. Please switch to Base.");
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
  }, [config, ensureBase, address]);

  const handleApproveAndSell = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }

    try {
      await ensureBase();

      if (!isApproved) {
        await writeContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "setApprovalForAll",
          args: [CONTRACT_ADDR, true],
        });
        toast.success("Approval set for marketplace contract ✅");
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
        toast.error("Transaction cancelled: Wrong network. Please switch to Base.");
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
        toast.success("Claim successful! 💰");
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("network")) {
        toast.error("Transaction cancelled: Wrong network. Please switch to Base.");
      } else {
        throw error;
      }
    }
  }, [config, ensureBase, phaseInfo, address]);

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
                              style={{ color: 'rgb(9, 9, 11)', fontSize: '15px', letterSpacing: '-0.01em', fontWeight: '500' }}
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
                              style={{ color: 'rgb(9, 9, 11)', fontSize: '15px', letterSpacing: '-0.01em', fontWeight: '500' }}
                            >
                              {chain.hasIcon && chain.iconUrl && (
                                <img
                                  alt={chain.name ?? "Chain icon"}
                                  src={chain.iconUrl}
                                  style={{ width: 20, height: 20 }}
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
                          checkUserSignedStatus(),
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
                  className="px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  disabled={isLoading}
                >
                  {isLoading ? "Refreshing..." : "Refresh Data"}
                </button>
              </div>

              <p className="text-lg text-gray-400 text-sm font-oldschool leading-relaxed">
                Daily signers: &nbsp;
                <span className="font-oldschool font-bold text-black text-sm">
                  {dailySigners} &nbsp;
                </span>{" "}
                |
                <span className="font-oldschool text-gray-400 text-sm">
                  &nbsp;Daily vault &nbsp;
                  <span className="font-oldschool font-bold text-black text-sm">
                    Ξ {dailyVault}&nbsp;
                  </span>
                </span>
                <br></br>
                <span className="font-oldschool text-gray-400 text-sm">
                  &nbsp; <b style={{ color: "#353533" }}>Yield per nft</b>{" "}
                  &nbsp;
                  <span className="font-oldschool font-bold text-black text-sm">
                    Ξ {yieldPerNFT}
                  </span>
                </span>
              </p>

              {/* 2x2 Grid Layout */}
              <div className="grid grid-cols-2 gap-4 w-full">
                {/* Üst satır - Başlıklar */}
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-oldschool">
                    Current Bid
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-oldschool">
                    {isApproved ? "Sell" : "Approve & Sell"}
                  </p>
                </div>

                {/* Alt satır - İçerikler */}
                <div className="text-center flex items-center justify-center">
                  <p className="text-2xl font-oldschool text-black font-bold">
                    Ξ {currentBid}
                  </p>
                </div>
                <div className="text-center flex items-center justify-center">
                  {isCheckingApproval ? (
                    <div className="w-full max-w-32 px-3 py-2 bg-gray-200 text-black rounded-lg font-oldschool font-bold text-xs flex items-center justify-center">
                      Checking...
                    </div>
                  ) : (
                    <button
                      onClick={isApproved ? handleSell : handleApproveAndSell}
                      className="w-full max-w-32 px-3 py-2 bg-black text-white rounded-lg font-oldschool font-bold hover:bg-gray-800 transition-colors text-xs"
                    >
                      {isApproved ? "Sell" : "Approve & Sell"}
                    </button>
                  )}
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
                  className={`px-8 py-3 rounded-full font-oldschool font-bold transition-colors ${
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
