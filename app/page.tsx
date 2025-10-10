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
import { useState, useCallback } from "react";
import { useConfig, useChainId } from "wagmi";
import { writeContract, switchChain } from "wagmi/actions";
import { base } from "wagmi/chains";
import { parseEther } from "viem";

import MARKET_ABI from "@/app/abi/market.json";
import NFT_ABI from "@/app/abi/nft.json";

// Addresses
const CONTRACT_ADDR = "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const;
const COLLECTION_ADDR = "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const;

export default function Page() {
  //const calls = []; // to be populated with buyFloor call later
  const [bidInput, setBidInput] = useState("");
  const config = useConfig();
  const chainId = useChainId();

  const ensureBase = useCallback(async () => {
    if (chainId !== base.id) {
      try {
        await switchChain(config, { chainId: base.id });
      } catch {}
    }
  }, [chainId, config]);

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

  const handleApprove = useCallback(async () => {
    await ensureBase();
    await writeContract(config, {
      address: COLLECTION_ADDR,
      abi: NFT_ABI,
      functionName: "setApprovalForAll",
      args: [CONTRACT_ADDR, true],
    });
    alert("Approval set for marketplace contract.");
  }, [config, ensureBase]);

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
    const input = prompt("Enter your NFT tokenId to sell to highest bidder");
    if (!input) return;
    const tokenId = BigInt(input);
    await ensureBase();
    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "sellToHighest",
      args: [tokenId],
    });
    alert("Sell executed");
  }, [config, ensureBase]);

  const handleSign = useCallback(async () => {
    const input = prompt("Enter your NFT tokenId to sign/claim");
    if (!input) return;
    const tokenId = BigInt(input);
    await ensureBase();
    await writeContract(config, {
      address: CONTRACT_ADDR,
      abi: MARKET_ABI,
      functionName: "signOrClaim",
      args: [tokenId],
    });
    alert("Sign/Claim sent");
  }, [config, ensureBase]);

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
              <img
                src="/bg.png"
                alt="Açıklamaa"
                className="w-full h-full object-cover rounded-lg"
              />
            </div>

            {/* İçerik - Sağ tarafta */}
            <div className="flex flex-col space-y-6 lg:max-w-md">
              <p className="text-lg text-gray-400 text-sm font-oldschool leading-relaxed">
                Daily signers: &nbsp;
                <span className="font-oldschool font-bold text-black text-sm">
                  14 &nbsp;
                </span>{" "}
                |
                <span className="font-oldschool text-gray-400 text-sm">
                  &nbsp;Daily vault &nbsp;
                  <span className="font-oldschool font-bold text-black text-sm">
                    Ξ 0,621&nbsp;
                  </span>
                </span>
                |
                <span className="font-oldschool text-gray-400 text-sm">
                  &nbsp; <b style={{ color: "#353533" }}>Yield per nft</b>{" "}
                  &nbsp;
                  <span className="font-oldschool font-bold text-black text-sm">
                    Ξ 0,044
                  </span>
                </span>
              </p>

              {/* 3x2 Grid Layout */}
              <div className="grid grid-cols-3 gap-4 w-full">
                {/* Üst satır - Başlıklar */}
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-oldschool">
                    Current Bid
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-oldschool">
                    Approve
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 font-oldschool">Sell</p>
                </div>

                {/* Alt satır - İçerikler */}
                <div className="text-center flex items-center justify-center">
                  <p className="text-2xl font-oldschool text-black font-bold">
                    Ξ 0.0060
                  </p>
                </div>
                <div className="text-center flex items-center justify-center">
                  <button className="w-full max-w-24 px-3 py-2 bg-gray-200 text-black rounded-lg font-oldschool font-bold hover:bg-gray-300 transition-colors text-xs">
                    Approve
                  </button>
                </div>
                <div className="text-center flex items-center justify-center">
                  <button className="w-full max-w-28 px-3 py-2 bg-black text-white rounded-lg font-oldschool font-bold hover:bg-gray-800 transition-colors text-xs">
                    Sell
                  </button>
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

                  <button className="px-6 py-3 bg-black text-white rounded-lg font-oldschool font-bold hover:bg-gray-800 transition-colors whitespace-nowrap">
                    Bid
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                <button
                  onClick={handleSign}
                  className="px-8 py-3 bg-black text-white rounded-full font-oldschool font-bold hover:bg-gray-800 transition-colors"
                >
                  Daily sign
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
