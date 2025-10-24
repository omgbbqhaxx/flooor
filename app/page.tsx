"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import Logo from "@/app/svg/Logo";
import { useState, useCallback, useEffect } from "react";
import { useConfig, useChainId, useAccount, useConnect } from "wagmi";
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

const retryWithBackoff = async (
  fn: () => Promise<unknown>,
  maxRetries = 3,
  baseDelay = 1000
) => {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const msg = lastError.message || "";
      const retryable =
        /429|Too Many Requests|ERR_CONNECTION_RESET|ERR_TIMED_OUT|timeout/i.test(
          msg
        );
      if (!retryable || attempt === maxRetries) throw lastError;
      await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }
  throw lastError!;
};

import MARKET_ABI from "@/app/abi/market.json";
import NFT_ABI from "@/app/abi/nft.json";

const CONTRACT_ADDR = "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const;
const COLLECTION_ADDR = "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const;

export default function Page() {
  const [bidInput, setBidInput] = useState("");
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [nftApprovalStatus, setNftApprovalStatus] = useState<
    Record<string, boolean>
  >({});
  const [nftLoadingStatus, setNftLoadingStatus] = useState<
    Record<string, boolean>
  >({});
  const [phaseInfo, setPhaseInfo] = useState<{
    currentPhase: string;
    eid: bigint;
    elapsed: bigint;
    remaining: bigint;
  } | null>(null);
  const [dailySigners, setDailySigners] = useState(0);
  const [dailyVault, setDailyVault] = useState("0");
  const [currentBid, setCurrentBid] = useState("0");
  const [activeBidder, setActiveBidder] = useState("");
  const [activeBidderName, setActiveBidderName] = useState("");
  const [yieldPerNFT, setYieldPerNFT] = useState("0");
  const [userHasSigned, setUserHasSigned] = useState(false);
  const [userHasClaimed, setUserHasClaimed] = useState(false);
  const [ownedTokenId, setOwnedTokenId] = useState<bigint | null>(null);
  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [nftImages, setNftImages] = useState<Record<string, string>>({});
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState(0);
  const [showNetworkWarning, setShowNetworkWarning] = useState(false);
  const [isMiniApp, setIsMiniApp] = useState(false);

  const config = useConfig();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();

  const CACHE_DURATION = 10 * 60 * 1000;

  // Mini-app algılama + auto-connect
  useEffect(() => {
    const inside =
      typeof window !== "undefined" &&
      /farcaster|warpcast/i.test(window.location.href);
    setIsMiniApp(inside);
  }, []);

  useEffect(() => {
    if (!isMiniApp || isConnected) return;
    const fc =
      connectors.find((c) =>
        (c.name || "").toLowerCase().includes("farcaster")
      ) ||
      connectors.find((c) =>
        (c.name || "").toLowerCase().includes("embedded")
      ) ||
      connectors[0];
    if (fc) {
      try {
        connect({ connector: fc });
      } catch {
        // Ignore connection errors
      }
    }
  }, [isMiniApp, isConnected, connectors, connect]);

  // Mini-app'te switchChain deneme
  const ensureBase = useCallback(async () => {
    if (isMiniApp) return; // mini-app içinde no-op
    if (chainId !== base.id) {
      setShowNetworkWarning(true);
      await switchChain(config, { chainId: base.id }).catch((e) => {
        console.error("Failed to switch network:", e);
        throw new Error("Please switch to Base network to continue");
      });
      setShowNetworkWarning(false);
    }
  }, [chainId, config, isMiniApp]);

  useEffect(() => {
    if (address && chainId !== base.id) setShowNetworkWarning(true);
    else setShowNetworkWarning(false);
  }, [chainId, address]);

  // -------- Helpers --------
  const checkApprovalStatus = useCallback(async () => {
    if (!address) return;
    setIsCheckingApproval(true);
    try {
      await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
          chainId: base.id,
        })
      );
    } finally {
      setIsCheckingApproval(false);
    }
  }, [config, address]);

  const checkIndividualNFTApprovals = useCallback(async () => {
    if (!address || userNFTs.length === 0) {
      setNftApprovalStatus({});
      return;
    }
    const highestTokenId = userNFTs.reduce((a, b) => (a > b ? a : b));
    const tokenIdStr = highestTokenId.toString();

    let isAllApproved = false;
    try {
      isAllApproved = (await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
          chainId: base.id,
        })
      )) as boolean;
    } catch {}

    if (isAllApproved) {
      setNftApprovalStatus({ [tokenIdStr]: true });
      return;
    }

    try {
      const approvedAddress = (await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getApproved",
          args: [highestTokenId],
          chainId: base.id,
        })
      )) as string;
      setNftApprovalStatus({
        [tokenIdStr]:
          approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase(),
      });
    } catch {
      setNftApprovalStatus({ [tokenIdStr]: false });
    }
  }, [config, address, userNFTs]);

  const fetchOwnedTokenId = useCallback(async () => {
    if (!address) {
      setOwnedTokenId(null);
      return;
    }
    try {
      const owned = (await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
          chainId: base.id,
        })
      )) as unknown as bigint[];
      setOwnedTokenId(
        owned?.length ? owned.reduce((a, b) => (a > b ? a : b)) : null
      );
    } catch {
      setOwnedTokenId(null);
    }
  }, [config, address]);

  // Fetch owned token ID when address changes
  useEffect(() => {
    fetchOwnedTokenId();
  }, [fetchOwnedTokenId]);

  const getPhaseInfo = useCallback(async () => {
    try {
      const [currentPhase, eid, elapsed, remaining] = (await retryWithBackoff(
        () =>
          readContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "getPhaseInfo",
            args: [],
            chainId: base.id,
          })
      )) as [string, bigint, bigint, bigint];
      setPhaseInfo({ currentPhase, eid, elapsed, remaining });
      setRemainingTimeDisplay(Number(remaining));
    } catch {}
  }, [config]);

  const getDailySigners = useCallback(async () => {
    try {
      const currentEpochStart = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
          chainId: base.id,
        })
      )) as bigint;

      const signersCount = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "partCount",
          args: [currentEpochStart],
          chainId: base.id,
        })
      )) as bigint;

      setDailySigners(Number(signersCount));
    } catch {}
  }, [config]);

  const getDailyVault = useCallback(async () => {
    try {
      const poolAccrued = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "poolAccrued",
          args: [],
          chainId: base.id,
        })
      )) as bigint;
      setDailyVault(parseFloat(formatEther(poolAccrued)).toFixed(8));
    } catch {}
  }, [config]);

  const getCurrentBid = useCallback(async () => {
    try {
      const activeBidAmount = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "activebidAM",
          args: [],
          chainId: base.id,
        })
      )) as bigint;
      setCurrentBid(parseFloat(formatEther(activeBidAmount)).toFixed(8));
    } catch {}
  }, [config]);

  const getActiveBidder = useCallback(async () => {
    try {
      const bidderAddress = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "activeBidder",
          args: [],
          chainId: base.id,
        })
      )) as string;

      setActiveBidder(bidderAddress);
      if (!bidderAddress || /^0x0{40}$/.test(bidderAddress)) {
        setActiveBidderName("");
        return;
      }

      // Basit kısaltma (ad çözümleme opsiyonel)
      setActiveBidderName(
        `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`
      );
    } catch {
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
      const currentEpochStart = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
          chainId: base.id,
        })
      )) as bigint;

      const signedTokenId = (await retryWithBackoff(() =>
        readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "mySignedToken",
          args: [currentEpochStart, address],
          chainId: base.id,
        })
      )) as bigint;

      const hasSigned = signedTokenId > BigInt(0);
      setUserHasSigned(hasSigned);

      const isSignPhase =
        phaseInfo.currentPhase.toLowerCase().includes("sign") ||
        ["signing", "sign_phase"].includes(
          phaseInfo.currentPhase.toLowerCase()
        );

      let claimedStatus = false;
      if (hasSigned && !isSignPhase) {
        try {
          await simulateContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "signOrClaim",
            args: [ownedTokenId],
            account: address,
            chainId: base.id,
          });
          claimedStatus = false;
        } catch (e: unknown) {
          const msg = ((e as Error)?.message || "").toLowerCase();
          if (msg.includes("already claimed") || msg.includes("claimed"))
            claimedStatus = true;
        }
      }
      setUserHasClaimed(claimedStatus);
    } catch {
      setUserHasSigned(false);
      setUserHasClaimed(false);
    }
  }, [config, address, phaseInfo, ownedTokenId]);

  const calculateYieldPerNFT = useCallback(() => {
    const v = parseFloat(dailyVault),
      s = dailySigners;
    setYieldPerNFT(s > 0 && v > 0 ? (v / s).toFixed(8) : "0.00000000");
  }, [dailyVault, dailySigners]);

  const getUserNFTs = useCallback(async () => {
    if (!address) {
      setUserNFTs([]);
      return;
    }
    try {
      const nfts: bigint[] = [];
      for (let i = 0; i < 5; i++) {
        try {
          const tokenId = (await retryWithBackoff(() =>
            readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [address, BigInt(i)],
              chainId: base.id,
            })
          )) as bigint;
          nfts.push(tokenId);
        } catch {
          break;
        }
      }
      setUserNFTs(nfts);
    } catch {
      setUserNFTs([]);
    }
  }, [address, config]);

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length) {
      setNftImages({});
      return;
    }
    const highestTokenId = userNFTs.reduce((a, b) => (a > b ? a : b));
    const tokenIdStr = highestTokenId.toString();
    try {
      const tokenURI = (await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenURI",
          args: [highestTokenId],
          chainId: base.id,
        })
      )) as string;

      if (tokenURI.startsWith("data:application/json;base64,")) {
        const jsonData = JSON.parse(atob(tokenURI.split(",")[1]));
        if (jsonData.image_data) {
          const svgDataUrl = `data:image/svg+xml;base64,${btoa(
            jsonData.image_data
          )}`;
          setNftImages({ [tokenIdStr]: svgDataUrl });
        }
      }
    } catch {}
  }, [userNFTs, config]);

  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);
  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);
  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) checkUserSignedStatus();
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  useEffect(() => {
    const fetchAll = async () => {
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
      } catch (e) {
        console.error(e);
        setRpcError("Failed to load some data. Retrying...");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
    const id = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [
    getPhaseInfo,
    getDailySigners,
    getDailyVault,
    getCurrentBid,
    getActiveBidder,
    checkUserSignedStatus,
    getUserNFTs,
    checkApprovalStatus,
    lastFetchTime,
    CACHE_DURATION,
  ]);

  useEffect(() => {
    const id = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) {
          setLastFetchTime(0);
          return 0;
        }
        if (prev <= 120) setLastFetchTime(0);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const formatTimeRemaining = useCallback((sec: number) => {
    const h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60),
      s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(
      2,
      "0"
    )}:${String(s).padStart(2, "0")}`;
  }, []);

  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return "Daily Sign";
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      ["signing", "sign_phase"].includes(phaseInfo.currentPhase.toLowerCase());
    if (isSignPhase) {
      if (userHasSigned)
        return remainingTimeDisplay < 60
          ? "Refreshing..."
          : `Claim: ${formatTimeRemaining(remainingTimeDisplay)}`;
      return "Daily Sign";
    }
    if (userHasClaimed)
      return `Next sign: ${formatTimeRemaining(remainingTimeDisplay)}`;
    if (userHasSigned) return "Claim";
    return `Sign ended: ${formatTimeRemaining(remainingTimeDisplay)}`;
  }, [
    phaseInfo,
    userHasSigned,
    userHasClaimed,
    remainingTimeDisplay,
    formatTimeRemaining,
  ]);

  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo || !address) return true;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      ["signing", "sign_phase"].includes(phaseInfo.currentPhase.toLowerCase());
    if (remainingTimeDisplay < 30 && isSignPhase && userHasSigned) return true;
    return isSignPhase ? userHasSigned : !userHasSigned || userHasClaimed;
  }, [phaseInfo, userHasSigned, userHasClaimed, address, remainingTimeDisplay]);

  const handleBidInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const i = v.indexOf(".");
      if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
      if (v.startsWith(".")) v = `0${v}`;
      setBidInput(v);
    },
    []
  );

  const handleBid = useCallback(async () => {
    if (!address) return toast.warning("Please connect your wallet first");
    try {
      await ensureBase();
      const value = parseEther((bidInput || "0") as `${string}`);
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "placeBid",
        args: [],
        value,
        chainId: base.id,
      });
      toast.success("Bid placed successfully! 🎉");
    } catch (error: unknown) {
      const msg = String((error as Error)?.message || error);
      if (/network/i.test(msg))
        toast.error(
          "Transaction cancelled: Wrong network. Please switch to Base."
        );
      else if (/rate limited/i.test(msg)) {
        toast.error(
          `Rate limited: ${msg}. Please wait a moment and try again.`,
          {
            duration: 5000,
            action: { label: "Retry", onClick: () => handleBid() },
          }
        );
      } else {
        toast.error(`Transaction failed: ${msg}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleBid() },
        });
      }
    }
  }, [config, ensureBase, bidInput, address]);

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!address) return toast.warning("Please connect your wallet first");
      try {
        await ensureBase();
        if (userNFTs.length > 1)
          return toast.error(
            "You must hold only 1 NFT to sell. Please transfer other NFTs first."
          );
        const tokenIdStr = tokenId.toString();
        const isApproved = nftApprovalStatus[tokenIdStr] === true;

        if (!isApproved) {
          setNftLoadingStatus((p) => ({ ...p, [tokenIdStr]: true }));
          toast.info(
            `Approval required for Noun #${tokenIdStr}. Approving automatically...`
          );
          try {
            await retryWithBackoff(
              () =>
                writeContract(config, {
                  address: COLLECTION_ADDR,
                  abi: NFT_ABI,
                  functionName: "setApprovalForAll",
                  args: [CONTRACT_ADDR, true],
                  chainId: base.id,
                }),
              5,
              2000
            );
            await new Promise((r) => setTimeout(r, 5000));
            const actually = await retryWithBackoff(() =>
              readContract(config, {
                address: COLLECTION_ADDR,
                abi: NFT_ABI,
                functionName: "isApprovedForAll",
                args: [address, CONTRACT_ADDR],
                chainId: base.id,
              })
            );
            if (actually) {
              toast.success("Approval confirmed! ✅");
              setNftApprovalStatus((p) => ({ ...p, [tokenIdStr]: true }));
              await checkIndividualNFTApprovals();
            } else {
              throw new Error("Approval not confirmed on blockchain");
            }
          } finally {
            setNftLoadingStatus((p) => ({ ...p, [tokenIdStr]: false }));
          }
        }

        toast.info(`Selling Noun #${tokenIdStr}...`);
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          chainId: base.id,
        });
        toast.success(`Noun #${tokenIdStr} sold successfully! 🎉`);
      } catch (error: unknown) {
        const msg = String((error as Error)?.message || error);
        if (/network/i.test(msg))
          toast.error(
            "Transaction cancelled: Wrong network. Please switch to Base."
          );
        else if (/rate limited/i.test(msg)) {
          toast.error(`Rate limited: ${msg}`, {
            duration: 5000,
            action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
          });
        } else {
          toast.error(`Sell failed: ${msg}`, {
            duration: 5000,
            action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
          });
        }
      }
    },
    [
      config,
      ensureBase,
      address,
      userNFTs,
      nftApprovalStatus,
      checkIndividualNFTApprovals,
    ]
  );

  const handleSign = useCallback(async () => {
    if (!address) return toast.warning("Please connect your wallet first");
    try {
      await ensureBase();
      const owned = (await retryWithBackoff(() =>
        readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
          chainId: base.id,
        })
      )) as unknown as bigint[];
      if (!owned?.length) return toast.error("No NFTs owned");
      if (owned.length > 1)
        return toast.warning("You must hodl only 1 vrnouns in your wallet");
      const tokenId = owned.reduce((a, b) => (a > b ? a : b));
      const isSignPhase =
        phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
        ["signing", "sign_phase"].includes(
          phaseInfo?.currentPhase.toLowerCase() || ""
        );

      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "signOrClaim",
        args: [tokenId],
        chainId: base.id,
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
    } catch (error: unknown) {
      const msg = String((error as Error)?.message || error);
      if (/network/i.test(msg))
        toast.error(
          "Transaction cancelled: Wrong network. Please switch to Base."
        );
      else if (/rate limited/i.test(msg)) {
        toast.error(`Rate limited: ${msg}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSign() },
        });
      } else {
        toast.error(`Sign/Claim failed: ${msg}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSign() },
        });
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
              {isMiniApp ? (
                isConnected ? (
                  <div
                    className="px-6 py-2 border-2 border-gray-400 rounded-full text-sm"
                    style={{
                      color: "rgb(9,9,11)",
                      fontSize: 15,
                      fontWeight: 500,
                    }}
                  >
                    Connected via Farcaster
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const fc =
                        connectors.find((c) =>
                          (c.name || "").toLowerCase().includes("farcaster")
                        ) ||
                        connectors.find((c) =>
                          (c.name || "").toLowerCase().includes("embedded")
                        ) ||
                        connectors[0];
                      if (fc) connect({ connector: fc });
                    }}
                    className="px-6 py-2 border-2 border-gray-400 rounded-full text-sm !bg-transparent"
                    style={{
                      color: "rgb(9,9,11)",
                      fontSize: 15,
                      fontWeight: 500,
                    }}
                  >
                    Connect (Farcaster)
                  </button>
                )
              ) : (
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
                            className="px-6 py-2 border-2 border-gray-400 rounded-full text-sm !bg-transparent"
                            style={{
                              color: "rgb(9,9,11)",
                              fontSize: 15,
                              fontWeight: 500,
                            }}
                          >
                            Connect Wallet
                          </button>
                        ) : chain.unsupported ? (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="px-4 py-2 border-2 border-red-400 rounded-full text-sm bg-red-100 text-red-600 font-bold"
                          >
                            Wrong Network
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={openAccountModal}
                              type="button"
                              className="px-6 py-2 border-2 border-gray-400 rounded-full text-sm !bg-transparent flex items-center gap-2"
                              style={{
                                color: "rgb(9,9,11)",
                                fontSize: 15,
                                fontWeight: 500,
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
                        )}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              )}
            </div>
          </div>
        </header>

        <main className="flex flex-col mt-20 space-y-16">
          {/* Hero Section - Resim ve İçerik */}
          <div className="flex flex-col lg:flex-row items-center lg:items-start space-y-8 lg:space-y-0 lg:space-x-12 w-full">
            {/* Resim - Mobilde ortalanmış */}
            <div className="w-64 h-64 bg-gray-300 rounded-lg flex items-center justify-center flex-shrink-0">
              <a
                href="https://opensea.io/collection/vrnouns"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                title="View VRNouns on OpenSea"
              >
                <Image
                  src="/bg.png"
                  alt="VRNouns Collection - Click to view on OpenSea"
                  width={256}
                  height={256}
                  priority
                  className="w-full h-full object-cover rounded-lg"
                />
              </a>
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
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 font-oldschool uppercase tracking-wide mb-1">
                      Current Bid
                    </div>
                    <div className="flex items-center justify-center text-xl font-oldschool font-bold text-black mb-2">
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
                        <div className="flex items-center justify-center text-xs text-gray-500 font-oldschool">
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

                {/* NFT Collection Card */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 font-oldschool uppercase tracking-wide mb-3">
                      Your NFTs - Click to Sell
                    </div>

                    {isCheckingApproval && (
                      <div className="inline-flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md font-oldschool text-xs mb-3">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 mr-1.5"></div>
                        Checking approval...
                      </div>
                    )}

                    {address && userNFTs.length > 0 && (
                      <div className="flex flex-col items-center space-y-3">
                        {/* Show only the highest token ID NFT */}
                        {(() => {
                          const highestTokenId = userNFTs.reduce((a, b) =>
                            a > b ? a : b
                          );
                          const tokenIdStr = highestTokenId.toString();
                          const moreCount = userNFTs.length - 1;

                          console.log(
                            "Displaying NFT - userNFTs:",
                            userNFTs.map((id) => id.toString())
                          );
                          console.log(
                            "Displaying NFT - highestTokenId:",
                            tokenIdStr
                          );

                          return (
                            <div className="flex flex-col items-center space-y-2">
                              <div
                                className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-300 hover:border-green-400 hover:shadow-lg transition-all cursor-pointer group"
                                onClick={() => handleSellNFT(highestTokenId)}
                                title={`Click to sell Noun #${tokenIdStr}`}
                              >
                                {/* Multiple NFT Warning Overlay */}
                                {userNFTs.length > 1 && (
                                  <div className="absolute top-0 left-0 right-0 bg-red-500 text-white text-xs px-1 py-0.5 text-center font-oldschool font-bold">
                                    Must hold only 1 NFT
                                  </div>
                                )}
                                {nftImages[tokenIdStr] ? (
                                  <Image
                                    src={nftImages[tokenIdStr]}
                                    alt={`Noun ${tokenIdStr}`}
                                    width={80}
                                    height={80}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                    <span className="text-sm font-bold text-gray-600">
                                      #{tokenIdStr}
                                    </span>
                                  </div>
                                )}

                                {/* Loading overlay */}
                                {nftLoadingStatus[tokenIdStr] && (
                                  <div className="absolute inset-0 bg-blue-500 bg-opacity-80 flex items-center justify-center">
                                    <div className="text-white text-xs font-oldschool font-bold text-center">
                                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
                                      <div>Approving...</div>
                                    </div>
                                  </div>
                                )}

                                {/* Approve overlay for unapproved NFTs */}
                                {!nftApprovalStatus[tokenIdStr] &&
                                  !nftLoadingStatus[tokenIdStr] && (
                                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
                                      <div className="text-white text-xs font-oldschool font-bold text-center">
                                        <div className="animate-pulse">
                                          Approve
                                        </div>
                                        <div className="text-xs opacity-75">
                                          Required
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                {/* Hover effect for approved NFTs */}
                                {nftApprovalStatus[tokenIdStr] &&
                                  !nftLoadingStatus[tokenIdStr] && (
                                    <div className="absolute inset-0 bg-green-500 bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                                      <div className="text-white text-sm font-oldschool font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                        Sell
                                      </div>
                                    </div>
                                  )}

                                {/* Token ID badge */}
                                <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-xs px-1.5 py-0.5 rounded font-oldschool font-bold">
                                  #{tokenIdStr}
                                </div>
                              </div>

                              {/* Show count of additional NFTs */}
                              {moreCount > 0 && (
                                <div className="text-xs text-gray-500 font-oldschool font-bold">
                                  +{moreCount} more NFT
                                  {moreCount > 1 ? "s" : ""}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {address && userNFTs.length === 0 && (
                      <div className="text-xs text-gray-500 font-oldschool">
                        No NFTs found
                      </div>
                    )}

                    {!address && (
                      <div className="text-xs text-gray-500 font-oldschool">
                        Connect wallet to view NFTs
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
                  className={`flex-1 px-6 py-3 rounded font-oldschool font-bold transition-colors whitespace-nowrap ${
                    isSignButtonDisabled()
                      ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                      : "bg-black text-white hover:bg-gray-800"
                  }`}
                >
                  {getSignButtonText()}
                </button>
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
                    An NFT platform built on game theory<br></br> , designed so
                    the whole group wins together.
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
                  X
                </a>

                <a
                  href="https://basescan.org/address/0xbb56a9359df63014b3347585565d6f80ac6305fd#readContract"
                  target="_blank"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  VRNouns
                </a>

                <a
                  href="https://basescan.org/address/0xf6b2c2411a101db46c8513ddaef10b11184c58ff#readContract"
                  target="_blank"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Flooor
                </a>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white-800 text-center">
              <p className="text-xs text-gray-500 font-oldschool font-bold">
                © 2025 flooor.fun . CC0 - Licensed. Front-end v1.0.18 & Contract
                version 1.0
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
