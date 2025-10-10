"use client";

import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownLink,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
  Avatar,
  Name,
  Address,
  EthBalance,
  Identity,
} from "@coinbase/onchainkit/identity";
//import { Transaction } from "@coinbase/onchainkit/transaction";

import Logo from "@/app/svg/Logo";
import { useState, useCallback, useEffect } from "react";
import { useConfig, useChainId, useAccount } from "wagmi";
import { writeContract, readContract, switchChain } from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther } from "viem";
import Image from "next/image";

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
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [dailySigners, setDailySigners] = useState<number>(0);
  const [dailyVault, setDailyVault] = useState<string>("0");
  const [currentBid, setCurrentBid] = useState<string>("0");
  const [yieldPerNFT, setYieldPerNFT] = useState<string>("0");
  const [userHasSigned, setUserHasSigned] = useState<boolean>(false);
  const [userHasClaimed, setUserHasClaimed] = useState<boolean>(false);
  const config = useConfig();
  const chainId = useChainId();
  const { address } = useAccount();

  const ensureBase = useCallback(async () => {
    if (chainId !== base.id) {
      try {
        await switchChain(config, { chainId: base.id });
      } catch {}
    }
  }, [chainId, config]);

  // Check approval status
  const checkApprovalStatus = useCallback(async () => {
    if (!address) {
      setIsApproved(false);
      return;
    }

    setIsCheckingApproval(true);
    try {
      const approved = await readContract(config, {
        address: COLLECTION_ADDR,
        abi: NFT_ABI,
        functionName: "isApprovedForAll",
        args: [address, CONTRACT_ADDR],
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
      const info = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "getPhaseInfo",
        args: [],
      })) as [string, bigint, bigint, bigint];

      const [currentPhase, eid, elapsed, remaining] = info;

      // Debug: Log the phase string to see what contract returns
      console.log("Contract phase string:", currentPhase);

      setPhaseInfo({
        currentPhase,
        eid,
        elapsed,
        remaining,
      });

      // Convert remaining seconds to number
      setTimeRemaining(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  // Get daily signers count
  const getDailySigners = useCallback(async () => {
    try {
      // Get currentEpochStart and use it directly for partCount
      const currentEpochStart = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "currentEpochStart",
        args: [],
      })) as bigint;

      const signersCount = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "partCount",
        args: [currentEpochStart],
      })) as bigint;

      setDailySigners(Number(signersCount));
    } catch (error) {
      console.error("Error getting daily signers:", error);
    }
  }, [config]);

  // Get daily vault amount
  const getDailyVault = useCallback(async () => {
    try {
      const poolAccrued = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "poolAccrued",
        args: [],
      })) as bigint;

      // Convert wei to ether and format
      const etherAmount = Number(poolAccrued) / 1e18;
      setDailyVault(etherAmount.toFixed(3));
    } catch (error) {
      console.error("Error getting daily vault:", error);
    }
  }, [config]);

  // Get current bid amount
  const getCurrentBid = useCallback(async () => {
    try {
      const activeBidAmount = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "activebidAM",
        args: [],
      })) as bigint;

      // Convert wei to ether and format
      const etherAmount = Number(activeBidAmount) / 1e18;
      setCurrentBid(etherAmount.toFixed(4));
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
      const currentEpochStart = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "currentEpochStart",
        args: [],
      })) as bigint;

      const signedTokenId = (await readContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "mySignedToken",
        args: [currentEpochStart, address],
      })) as bigint;

      // If signedTokenId is 0, user hasn't signed
      setUserHasSigned(signedTokenId > BigInt(0));
    } catch (error) {
      console.error("Error checking user signed status:", error);
      setUserHasSigned(false);
    }
  }, [config, address, phaseInfo]);

  // Calculate yield per NFT
  const calculateYieldPerNFT = useCallback(() => {
    const vaultAmount = parseFloat(dailyVault);
    const signersCount = dailySigners;

    if (signersCount > 0 && vaultAmount > 0) {
      const yieldPerNFTAmount = vaultAmount / signersCount;
      setYieldPerNFT(yieldPerNFTAmount.toFixed(3));
    } else {
      setYieldPerNFT("0");
    }
  }, [dailyVault, dailySigners]);

  // Update yield per NFT when vault or signers change
  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);

  // Check user signed status when address or phase changes
  useEffect(() => {
    checkUserSignedStatus();
  }, [checkUserSignedStatus]);

  // Load claimed status from localStorage when address changes
  useEffect(() => {
    if (address && phaseInfo) {
      const claimedKey = `claimed_${address}_${phaseInfo.eid}`;
      const hasClaimed = localStorage.getItem(claimedKey) === "true";
      setUserHasClaimed(hasClaimed);
    } else {
      setUserHasClaimed(false);
    }
  }, [address, phaseInfo]);

  // Update phase info when component mounts and periodically
  useEffect(() => {
    getPhaseInfo();
    getDailySigners();
    getDailyVault();
    getCurrentBid();

    // Update every second
    const interval = setInterval(() => {
      getPhaseInfo();
    }, 1000);

    // Update daily signers, vault and current bid every 10 seconds
    const signersInterval = setInterval(() => {
      getDailySigners();
      getDailyVault();
      getCurrentBid();
      checkUserSignedStatus();
    }, 10000);

    return () => {
      clearInterval(interval);
      clearInterval(signersInterval);
    };
  }, [getPhaseInfo, getDailySigners, getDailyVault, getCurrentBid]);

  // Update time remaining every second
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setTimeout(() => {
        setTimeRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [timeRemaining]);

  // Format time remaining
  const formatTime = useCallback((seconds: number) => {
    if (seconds <= 0) return "0s";

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }, []);

  // Get button text based on phase and user's sign status
  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return "Daily Sign";

    // Check if it's sign phase - contract might return different string values
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    if (isSignPhase) {
      // If it's sign phase, check if user has already signed
      if (userHasSigned) {
        return `Claim (${formatTime(timeRemaining)})`;
      } else {
        return `Daily Sign (${formatTime(timeRemaining)})`;
      }
    } else {
      // If it's claim phase, check if user has signed
      if (userHasSigned) {
        if (userHasClaimed) {
          return `Claimed`;
        } else {
          return `Claim (${formatTime(timeRemaining)})`;
        }
      } else {
        return `Sign period ended`;
      }
    }
  }, [phaseInfo, timeRemaining, formatTime, userHasSigned, userHasClaimed]);

  // Check if button should be disabled
  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo) return false;

    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";

    // If it's claim phase and user hasn't signed, disable button
    if (!isSignPhase && !userHasSigned) {
      return true;
    }

    // If user has already claimed, disable button
    if (userHasClaimed) {
      return true;
    }

    return false;
  }, [phaseInfo, userHasSigned, userHasClaimed]);

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
    await ensureBase();
    const value = parseEther((bidInput || "0") as `${string}`);
    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "placeBid",
      args: [],
      value,
    });
    alert("Bid placed");
  }, [config, ensureBase, bidInput]);

  const handleSell = useCallback(async () => {
    // Auto-pick: fetch user's NFTs and use the largest tokenId
    if (!address) {
      alert("Connect wallet first");
      return;
    }
    await ensureBase();
    const owned: bigint[] = (await readContract(config, {
      address: COLLECTION_ADDR,
      abi: NFT_ABI,
      functionName: "getNFTzBelongingToOwner",
      args: [address],
    })) as unknown as bigint[];
    if (!owned || owned.length === 0) {
      alert("No NFTs owned");
      return;
    }
    const tokenId = owned.reduce((a, b) => (a > b ? a : b));
    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "sellToHighest",
      args: [tokenId],
    });
    alert("Sell executed");
  }, [config, ensureBase, address]);

  // Combined approve and sell handler
  const handleApproveAndSell = useCallback(async () => {
    if (!address) {
      alert("Connect wallet first");
      return;
    }

    await ensureBase();

    // First approve if not already approved
    if (!isApproved) {
      await writeContract(config, {
        address: COLLECTION_ADDR,
        abi: NFT_ABI,
        functionName: "setApprovalForAll",
        args: [CONTRACT_ADDR, true],
      });
      alert("Approval set for marketplace contract.");
      // Refresh approval status
      await checkApprovalStatus();
    }

    // Then sell
    const owned: bigint[] = (await readContract(config, {
      address: COLLECTION_ADDR,
      abi: NFT_ABI,
      functionName: "getNFTzBelongingToOwner",
      args: [address],
    })) as unknown as bigint[];
    if (!owned || owned.length === 0) {
      alert("No NFTs owned");
      return;
    }
    const tokenId = owned.reduce((a, b) => (a > b ? a : b));
    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "sellToHighest",
      args: [tokenId],
    });
    alert("Sell executed");
  }, [config, ensureBase, address, isApproved, checkApprovalStatus]);

  const handleSign = useCallback(async () => {
    const input = prompt("Enter your NFT tokenId to sign/claim");
    if (!input) return;
    const tokenId = BigInt(input);
    await ensureBase();

    // Check if it's claim phase and user has signed
    const isSignPhase =
      phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo?.currentPhase.toLowerCase() === "signing" ||
      phaseInfo?.currentPhase.toLowerCase() === "sign_phase";

    const isClaimOperation = !isSignPhase && userHasSigned;

    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "signOrClaim",
      args: [tokenId],
    });

    if (isClaimOperation) {
      setUserHasClaimed(true);
      // Save to localStorage with epoch ID
      if (phaseInfo) {
        const claimedKey = `claimed_${address}_${phaseInfo.eid}`;
        localStorage.setItem(claimedKey, "true");
      }
      alert("Claim successful!");
    } else {
      alert("Sign/Claim sent");
    }
  }, [config, ensureBase, phaseInfo, userHasSigned]);

  return (
    <div className="text-white min-h-screen">
      <div className="max-w-3xl mx-auto px-3">
        <header className="py-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Logo className="h-24 w-auto mt-1" />
            </div>

            {/* Sağdaki cüzdan/buton kısmı çerçevenin dışında */}
            <div>
              <Wallet>
                <ConnectWallet className="px-4 py-2 border-2 border-gray-400 rounded-full hover:bg-transparent transition text-sm !bg-transparent" />
                <WalletDropdown>
                  <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                    <Avatar />
                    <Name />
                    <Address />
                    <EthBalance />
                  </Identity>
                  <WalletDropdownLink
                    icon="wallet"
                    href="https://keys.coinbase.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Wallet
                  </WalletDropdownLink>
                  <WalletDropdownDisconnect />
                </WalletDropdown>
              </Wallet>
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
                |
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
                  href="https://sepolia.etherscan.io/address/0x11d7e2520244D65Be6935e8BAfd87152De93c6FF#readContract"
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
