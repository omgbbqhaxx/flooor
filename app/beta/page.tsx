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
const MINIMUM_BID_FOR_SELL = 0.006;

const EthGlyph = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 1.75L5.75 12.25L12 16L18.25 12.25L12 1.75Z" />
    <path d="M5.75 13.75L12 17.5L18.25 13.75L12 22.25L5.75 13.75Z" />
  </svg>
);

export default function BetaPage() {
  const [bidInput, setBidInput] = useState("");
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
  const config = useConfig();
  const chainId = useChainId();
  const { address } = useAccount();
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);
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
              address: "0x4200000000000000000000000000000000000006",
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
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const base64Data = tokenURI.split(",")[1];
        const jsonData = JSON.parse(atob(base64Data));
        if (jsonData.image_data) {
          images[tokenIdStr] =
            `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
        }
      }
    } catch (error) {
      console.error(`Error getting image for token ${highestTokenId}:`, error);
    }
    setNftImages(images);
  }, [userNFTs, config]);

  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);
  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);

  // Cüzdan bağlandığı anda NFT'leri otomatik yükle — refresh gerekmez
  useEffect(() => {
    getUserNFTs();
  }, [getUserNFTs]);

  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) {
      checkUserSignedStatus();
    }
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  useEffect(() => {
    const fetchAllData = async () => {
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
    };
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
    if (!phaseInfo) return `Daily Sign & Earn ${yieldUsd}`;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) return "Refreshing...";
        return `Claim: ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else {
        return `Daily Sign & Earn ${yieldUsd}`;
      }
    } else {
      if (userHasClaimed)
        return `Next sign: ${formatTimeRemaining(remainingTimeDisplay)}`;
      else if (userHasSigned) return `Claim ${yieldUsd}`;
      else return `Sign ended: ${formatTimeRemaining(remainingTimeDisplay)}`;
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
    },
    [],
  );

  const handleBid = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleBid() },
      });
    }
  }, [config, ensureBase, bidInput, address, getCurrentBid, getActiveBidder]);

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
      nftLoadingStatus,
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

  const isSignPhase =
    phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
    phaseInfo?.currentPhase.toLowerCase() === "signing" ||
    phaseInfo?.currentPhase.toLowerCase() === "sign_phase";

  // Claim'e hazır durum — buton yeşil "para" rengine döner
  const isClaimReady =
    !!phaseInfo && !isSignPhase && userHasSigned && !userHasClaimed;

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    Promise.allSettled([
      getPhaseInfo(),
      getDailySigners(),
      getDailyVault(),
      getCurrentBid(),
      getActiveBidder(),
      checkUserSignedStatus(),
      getUserNFTs(),
      checkApprovalStatus(),
    ]).finally(() => setIsLoading(false));
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

  return (
    <div
      className="min-h-screen relative z-10"
      style={{ backgroundColor: "#F7F6F3", color: "#141414" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid #ECEAE4",
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Logo className="h-9 w-auto" />
            <nav
              className="hidden md:flex items-center gap-6 text-sm font-semibold"
              style={{ color: "#6B6862" }}
            >
              <a
                href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                Docs
              </a>
              <a
                href="https://snapshot.org/#/s:vrnouns.eth"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                DAO
              </a>
              <a
                href="https://opensea.io/collection/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                VRNouns
              </a>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {phaseInfo && (
              <div
                className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                  isSignPhase
                    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                    : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isSignPhase ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                ></span>
                {isSignPhase ? "SIGN PHASE" : "CLAIM PHASE"}
              </div>
            )}
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
                        className="px-5 py-2.5 font-bold text-sm rounded-full transition-all hover:opacity-85 active:scale-[0.98]"
                        style={{
                          backgroundColor: "#141414",
                          color: "#fff",
                          boxShadow: "0 6px 16px -6px rgba(0,0,0,0.35)",
                        }}
                      >
                        Connect Wallet
                      </button>
                    ) : chain.unsupported ? (
                      <button
                        onClick={openChainModal}
                        type="button"
                        className="px-4 py-2 rounded-full font-bold text-sm bg-red-50 text-red-600 ring-1 ring-red-200"
                      >
                        Wrong Network
                      </button>
                    ) : (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="px-4 py-2 font-bold text-sm rounded-full transition-all flex items-center gap-2 hover:bg-white"
                        style={{
                          border: "1px solid #E2DFD8",
                          backgroundColor: "#FDFDFB",
                        }}
                      >
                        {chain.hasIcon && chain.iconUrl && (
                          <Image
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            width={16}
                            height={16}
                          />
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
            <span className="text-red-700 font-semibold text-sm">
              Wrong network — please switch to Base
            </span>
            <button
              onClick={() => ensureBase()}
              className="px-4 py-1.5 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-700 transition-colors"
            >
              Switch to Base
            </button>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-5 sm:px-6 pt-10 pb-20">
        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
          {/* Left: NFT Image */}
          <div className="lg:sticky lg:top-24 relative">
            {/* Nouns renklerinde glow */}
            <div
              aria-hidden
              className="absolute -inset-4 rounded-[40px] blur-2xl opacity-50 pointer-events-none"
              style={{
                background:
                  "linear-gradient(135deg, #63A0F9 0%, #FFC110 50%, #FE500C 100%)",
              }}
            />
            <a
              href="https://opensea.io/collection/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1"
              style={{
                border: "1px solid rgba(255,255,255,0.6)",
                boxShadow: "0 30px 70px -25px rgba(20,20,20,0.35)",
                backgroundColor: "#fff",
              }}
            >
              <Image
                src="/bg.png"
                alt="VRNouns Collection"
                width={560}
                height={560}
                priority
                className="w-full h-auto object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              {/* Live badge */}
              <div
                className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest text-white"
                style={{
                  backgroundColor: "rgba(20,20,20,0.55)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${
                    isSignPhase ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                ></span>
                Live on Base
              </div>
              {/* Bottom overlay */}
              <div
                className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between"
                style={{
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0.25) 55%, transparent)",
                }}
              >
                <div>
                  <p className="text-white font-extrabold text-xl leading-tight">
                    VRNouns
                  </p>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-0.5">
                    CC0 · Base · Royalties to the community.
                  </p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 px-4 py-2 rounded-full bg-white text-xs font-extrabold text-black opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                  View on OpenSea →
                </span>
              </div>
            </a>
          </div>

          {/* Right: Auction Info */}
          <div className="flex flex-col gap-5">
            {/* Title */}
            <div>
              <p
                className="text-xs font-bold uppercase tracking-[0.2em] mb-2"
                style={{ color: "#A8A29E" }}
              >
                {isSignPhase ? "Sign Phase" : "Claim Phase"} · Epoch #
                {phaseInfo ? phaseInfo.eid.toString() : "—"}
              </p>
              <h1
                className="text-5xl font-extrabold tracking-tight leading-none"
                style={{ color: "#141414" }}
              >
                VRNouns
              </h1>
            </div>

            {/* Bid + Timer card */}
            <div
              className="rounded-3xl p-6"
              style={{
                backgroundColor: "#fff",
                border: "1px solid #ECEAE4",
                boxShadow: "0 18px 44px -28px rgba(20,20,20,0.18)",
              }}
            >
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: "#A8A29E" }}
                  >
                    Current bid
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <EthGlyph className="w-6 h-6 self-center" />
                    <span
                      className="text-4xl font-extrabold tabular-nums tracking-tight"
                      style={{ color: "#141414" }}
                    >
                      {fmtEth(currentBid)}
                    </span>
                  </div>
                  {toUsd(currentBid) && (
                    <p
                      className="text-sm font-semibold mt-1"
                      style={{ color: "#A8A29E" }}
                    >
                      {toUsd(currentBid)}
                    </p>
                  )}
                </div>
                <div
                  className="pl-6"
                  style={{ borderLeft: "1px solid #ECEAE4" }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-2"
                    style={{ color: "#A8A29E" }}
                  >
                    {isSignPhase ? "Sign closes in" : "Claim closes in"}
                  </p>
                  <p
                    className="text-4xl font-extrabold tabular-nums tracking-tight"
                    style={{ color: "#141414" }}
                  >
                    {formatTimeRemaining(remainingTimeDisplay)}
                  </p>
                </div>
              </div>

              {activeBidder &&
                activeBidder !==
                  "0x0000000000000000000000000000000000000000" && (
                  <div
                    className="flex items-center gap-2 mt-5 pt-4"
                    style={{ borderTop: "1px solid #F1EFE9" }}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden ring-1 ring-black/5">
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
                            } catch (e) {
                              console.error(e);
                            }
                          }
                        }}
                        className="w-full h-full"
                      />
                    </div>
                    <span
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "#A8A29E" }}
                    >
                      Highest bidder
                    </span>
                    <a
                      href={`https://basescan.org/address/${activeBidder}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold hover:underline ml-auto"
                      style={{ color: "#3B63F3" }}
                    >
                      {activeBidderName ||
                        `${activeBidder.slice(0, 6)}...${activeBidder.slice(-4)}`}
                    </a>
                  </div>
                )}

              {/* Bid input */}
              <div className="mt-5 flex gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={`Ξ ${MINIMUM_BID_FOR_SELL} or more`}
                  className="flex-1 px-4 py-3 rounded-2xl text-base font-semibold focus:outline-none transition-all focus:ring-2 focus:ring-black/10"
                  style={{
                    border: "1px solid #E2DFD8",
                    backgroundColor: "#FAF9F6",
                    color: "#141414",
                  }}
                  value={bidInput}
                  onChange={handleBidInputChange}
                />
                <button
                  onClick={handleBid}
                  className="px-8 py-3 rounded-2xl font-bold text-base transition-all hover:opacity-85 active:scale-[0.98]"
                  style={{
                    backgroundColor: "#141414",
                    color: "#fff",
                    boxShadow: "0 8px 20px -8px rgba(0,0,0,0.4)",
                  }}
                >
                  Bid
                </button>
              </div>
              <p
                className="text-xs font-medium mt-2"
                style={{ color: "#B8B3AC" }}
              >
                Minimum bid: Ξ {MINIMUM_BID_FOR_SELL}
              </p>
            </div>

            {/* Sign / Claim Button */}
            <button
              onClick={handleSign}
              disabled={isSignButtonDisabled()}
              className="w-full py-4 rounded-2xl font-extrabold text-lg transition-all active:scale-[0.99] hover:opacity-90"
              style={
                isSignButtonDisabled()
                  ? {
                      backgroundColor: "#ECEAE4",
                      color: "#A8A29E",
                      cursor: "not-allowed",
                    }
                  : isClaimReady
                    ? {
                        backgroundColor: "#16A34A",
                        color: "#fff",
                        boxShadow: "0 14px 34px -12px rgba(22,163,74,0.55)",
                      }
                    : {
                        backgroundColor: "#141414",
                        color: "#fff",
                        boxShadow: "0 14px 34px -14px rgba(0,0,0,0.45)",
                      }
              }
            >
              {getSignButtonText()}
            </button>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div
                className="rounded-2xl p-4"
                style={{ backgroundColor: "#fff", border: "1px solid #ECEAE4" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#A8A29E" }}
                >
                  Signers
                </p>
                <p
                  className="text-2xl font-extrabold tabular-nums"
                  style={{ color: "#141414" }}
                >
                  {dailySigners}
                </p>
              </div>
              <div
                className="rounded-2xl p-4"
                style={{ backgroundColor: "#fff", border: "1px solid #ECEAE4" }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#A8A29E" }}
                >
                  Vault
                </p>
                <p
                  className="text-base sm:text-2xl font-extrabold tabular-nums whitespace-nowrap"
                  style={{ color: "#141414" }}
                >
                  Ξ{fmtEth(dailyVault)}
                </p>
                {toUsd(dailyVault) && (
                  <p
                    className="text-xs font-semibold mt-0.5"
                    style={{ color: "#A8A29E" }}
                  >
                    {toUsd(dailyVault)}
                  </p>
                )}
              </div>
              <div
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "#F0FDF4",
                  border: "1px solid #BBF7D0",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: "#15803D" }}
                >
                  Yield / NFT
                </p>
                <p
                  className="text-base sm:text-2xl font-extrabold tabular-nums whitespace-nowrap"
                  style={{ color: "#15803D" }}
                >
                  Ξ{fmtEth(yieldPerNFT)}
                </p>
                {toUsd(yieldPerNFT) && (
                  <p
                    className="text-xs font-bold mt-0.5"
                    style={{ color: "#16A34A" }}
                  >
                    {toUsd(yieldPerNFT)}
                  </p>
                )}
              </div>
            </div>

            {/* Your NFTs */}
            {address && (
              <div
                className="rounded-3xl p-6"
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #ECEAE4",
                }}
              >
                <div className="flex items-center justify-between mb-4">
                  <p
                    className="text-xs font-bold uppercase tracking-widest"
                    style={{ color: "#A8A29E" }}
                  >
                    Your NFTs
                  </p>
                  {isCheckingApproval && (
                    <div
                      className="flex items-center gap-2 text-xs font-semibold"
                      style={{ color: "#A8A29E" }}
                    >
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>
                      Checking approval...
                    </div>
                  )}
                </div>
                {userNFTs.length > 0 ? (
                  <div className="flex flex-wrap gap-4">
                    {userNFTs.map((tokenId) => {
                      const tokenIdStr = tokenId.toString();
                      return (
                        <div
                          key={tokenIdStr}
                          className="flex flex-col items-center gap-1.5"
                        >
                          <div
                            className="relative w-24 h-24 rounded-2xl overflow-hidden cursor-pointer group transition-all hover:scale-[1.03]"
                            style={{
                              border: "1px solid #E8E5DF",
                              boxShadow: "0 10px 24px -14px rgba(0,0,0,0.25)",
                            }}
                            onClick={() => requestSellNFT(tokenId)}
                            title={`Sell Noun #${tokenIdStr}`}
                          >
                            {nftImages[tokenIdStr] ? (
                              <Image
                                src={nftImages[tokenIdStr]}
                                alt={`Noun ${tokenIdStr}`}
                                width={96}
                                height={96}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center"
                                style={{ backgroundColor: "#F1EFE9" }}
                              >
                                <span
                                  className="text-sm font-bold"
                                  style={{ color: "#6B6862" }}
                                >
                                  #{tokenIdStr}
                                </span>
                              </div>
                            )}
                            {nftLoadingStatus[tokenIdStr] && (
                              <div className="absolute inset-0 bg-blue-500/80 flex items-center justify-center">
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                              </div>
                            )}
                            {!nftApprovalStatus[tokenIdStr] &&
                              !nftLoadingStatus[tokenIdStr] && (
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                  <span className="text-white text-xs font-bold">
                                    Approve
                                  </span>
                                </div>
                              )}
                            {nftApprovalStatus[tokenIdStr] &&
                              !nftLoadingStatus[tokenIdStr] && (
                                <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/40 transition-all flex items-center justify-center">
                                  <span className="text-white text-sm font-extrabold opacity-0 group-hover:opacity-100 transition-opacity">
                                    Sell
                                  </span>
                                </div>
                              )}
                            <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-md font-bold">
                              #{tokenIdStr}
                            </div>
                          </div>
                          <p
                            className="text-[11px] font-bold"
                            style={{
                              color: nftApprovalStatus[tokenIdStr]
                                ? "#16A34A"
                                : "#D97706",
                            }}
                          >
                            {nftApprovalStatus[tokenIdStr]
                              ? "Ready to sell"
                              : "Tap to approve"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p
                    className="text-sm font-medium"
                    style={{ color: "#B8B3AC" }}
                  >
                    No VRNouns found in wallet
                  </p>
                )}
              </div>
            )}

            {/* Quick links */}
            <div className="flex flex-wrap items-center gap-2">
              <a
                href="https://farcaster.xyz/miniapps/pIFtRBsgnWAF/flooorfun"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: "#6B6862",
                  border: "1px solid #E8E5DF",
                }}
              >
                Farcaster Mini App
              </a>
              <a
                href="https://base.app/app/flooor.fun"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: "#6B6862",
                  border: "1px solid #E8E5DF",
                }}
              >
                Base App
              </a>
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-all hover:bg-white"
                style={{
                  backgroundColor: "#F1EFE9",
                  color: isLoading ? "#B8B3AC" : "#6B6862",
                  border: "1px solid #E8E5DF",
                  cursor: isLoading ? "not-allowed" : "pointer",
                }}
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-400"></div>{" "}
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3 h-3"
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
                    </svg>{" "}
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Info Cards */}
        <div className="mt-24 pt-16" style={{ borderTop: "1px solid #ECEAE4" }}>
          <h2
            className="text-3xl sm:text-4xl font-extrabold tracking-tight text-center mb-3"
            style={{ color: "#141414" }}
          >
            Royalties to the community.
          </h2>
          <p
            className="text-center text-base font-medium mb-12 max-w-xl mx-auto"
            style={{ color: "#A8A29E" }}
          >
            A marketplace where holders earn together — every day.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              {
                num: "01",
                title: "Sign & Earn",
                text: "Light stake (sign) with your NFT. 5% of all royalties are shared with signers.",
                gradient: "linear-gradient(135deg, #7AB4FF 0%, #3B7DF0 100%)",
                shadow: "0 28px 56px -28px rgba(59,125,240,0.75)",
                dark: true,
              },
              {
                num: "02",
                title: "Bid or Sell",
                text: "No more listing. Just bid or sell — instantly, on-chain.",
                gradient: "linear-gradient(135deg, #FFD34D 0%, #FFAE00 100%)",
                shadow: "0 28px 56px -28px rgba(255,174,0,0.75)",
                dark: true,
              },
              {
                num: "03",
                title: "Game Theory",
                text: "Built on game theory — designed so the whole group wins together.",
                gradient: "linear-gradient(135deg, #FF7A3D 0%, #E03E00 100%)",
                shadow: "0 28px 56px -28px rgba(224,62,0,0.7)",
                dark: false,
              },
            ].map((card) => (
              <div
                key={card.num}
                className="group relative overflow-hidden rounded-3xl p-8 min-h-52 transition-all duration-300 hover:-translate-y-2"
                style={{ background: card.gradient, boxShadow: card.shadow }}
              >
                {/* Noggles watermark */}
                <svg
                  className="absolute -right-8 -bottom-6 w-44 h-auto transition-transform duration-500 ease-out group-hover:scale-110 group-hover:-rotate-6"
                  viewBox="0 0 160 60"
                  fill={
                    card.dark ? "rgba(20,20,20,0.12)" : "rgba(255,255,255,0.16)"
                  }
                >
                  <path d="M40 5h45v50H40V5zm10 10v30h25V15H50z" />
                  <path d="M100 5h45v50h-45V5zm10 10v30h25V15h-25z" />
                  <path d="M85 25h15v10H85zM0 25h40v10H10v15H0z" />
                </svg>
                {/* Hover shine */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(500px circle at 25% -10%, rgba(255,255,255,0.35), transparent 45%)",
                  }}
                />
                <div className="relative">
                  <span
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-widest mb-4"
                    style={{
                      backgroundColor: card.dark
                        ? "rgba(255,255,255,0.35)"
                        : "rgba(255,255,255,0.2)",
                      color: card.dark ? "#141414" : "#fff",
                      backdropFilter: "blur(4px)",
                    }}
                  >
                    {card.num} · {card.title}
                  </span>
                  <p
                    className="text-xl font-extrabold leading-snug"
                    style={{ color: card.dark ? "#141414" : "#fff" }}
                  >
                    {card.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Sell confirmation modal */}
      {pendingSellTokenId !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{
            backgroundColor: "rgba(20,20,20,0.55)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
          onClick={() => setPendingSellTokenId(null)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6"
            style={{
              backgroundColor: "#fff",
              boxShadow: "0 30px 80px -20px rgba(0,0,0,0.45)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-xl font-extrabold mb-2"
              style={{ color: "#141414" }}
            >
              Confirm sale
            </h3>
            <p
              className="text-sm font-medium leading-relaxed mb-6"
              style={{ color: "#6B6862" }}
            >
              Are you sure you want to sell Noun #
              {pendingSellTokenId.toString()} for Ξ{fmtEth(currentBid)}
              {toUsd(currentBid) ? ` (${toUsd(currentBid)})` : ""}? This action
              cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingSellTokenId(null)}
                className="flex-1 py-3 rounded-2xl font-bold text-base transition-all active:scale-[0.98]"
                style={{ backgroundColor: "#F1EFE9", color: "#141414" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSellNFT}
                className="flex-1 py-3 rounded-2xl font-bold text-base text-white transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: "#16A34A",
                  boxShadow: "0 10px 24px -10px rgba(22,163,74,0.6)",
                }}
              >
                Yes, sell
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ backgroundColor: "#FDFDFB" }}>
        {/* Nouns renklerinde ince gradient şerit */}
        <div
          className="h-1"
          style={{
            background:
              "linear-gradient(90deg, #63A0F9 0%, #FFC110 50%, #FE500C 100%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-auto" />
            <span className="font-bold text-sm" style={{ color: "#A8A29E" }}>
              flooor.fun
            </span>
          </div>
          <div
            className="flex flex-wrap items-center gap-6 text-sm font-semibold"
            style={{ color: "#A8A29E" }}
          >
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
            <a
              href="https://github.com/omgbbqhaxx/flooor"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://x.com/vrnouns"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              X
            </a>
            <a
              href="https://basescan.org/address/0xbb56a9359df63014b3347585565d6f80ac6305fd#readContract"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              VRNouns
            </a>
            <a
              href="https://basescan.org/address/0xf6b2c2411a101db46c8513ddaef10b11184c58ff#readContract"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Flooor
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-black transition-colors"
            >
              Snapshot
            </a>
          </div>
        </div>
        <div
          className="border-t py-4 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 text-center text-xs font-medium px-6"
          style={{ borderColor: "#ECEAE4", color: "#C4BFB8" }}
        >
          <span>
            © 2026 flooor.fun · CC0 Licensed · Front-end v1.1.0 · Contract
            v1.0 · Beta
          </span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold"
            style={{
              background:
                "linear-gradient(90deg, rgba(99,160,249,0.12), rgba(255,193,16,0.12), rgba(254,80,12,0.12))",
              color: "#8A857E",
              border: "1px solid #ECEAE4",
            }}
          >
            ✦ Crafted with Claude Fable 5
          </span>
        </div>
      </footer>
    </div>
  );
}
