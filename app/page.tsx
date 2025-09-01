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

export default function Page() {
  //const calls = []; // to be populated with buyFloor call later

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
                Today's signers :{" "}
                <span className="font-oldschool font-bold text-black text-sm">
                  {" "}
                  543{" "}
                </span>{" "}
                | &nbsp;
                <span className="font-oldschool text-gray-400 text-sm">
                  Today’s loot{" "}
                  <span className="font-oldschool font-bold text-black text-sm">
                    {" "}
                    &nbsp;&nbsp;Ξ 0,621{" "}
                  </span>
                </span>
              </p>

              <h1 className="text-4xl lg:text-5xl font-extrabold text-black font-oldschool leading-tight">
                Block 1117
              </h1>

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
                    Ξ 0.80
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
                <p className="text-sm text-gray-600 font-oldschool mb-2">
                  Send ETH directly to contract for offer.
                </p>
                <p
                  className="text-xs font-mono break-all"
                  style={{ color: "#000" }}
                >
                  0x08e07Bb838149CA3CEfae752238aE89621d3771f
                </p>
              </div>

              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                <button className="px-8 py-3 bg-black text-white rounded-full font-oldschool font-bold hover:bg-gray-800 transition-colors">
                  Daily sign
                </button>
                <button className="px-8 py-3 border-2 border-black text-black rounded-full font-oldschool font-bold hover:bg-black hover:text-white transition-colors">
                  Docs
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
                <div className="bg-blue-500 rounded-lg w-48 h-48 flex items-center justify-center px-2">
                  <span className="text-xl font-bold font-oldschool text-center">
                    Stake your nft. <br></br> Earn royalties.<br></br> From
                    sales.
                  </span>
                </div>

                <div className="bg-yellow-500 rounded-full w-48 h-48 flex items-center justify-center">
                  <span className="text-xl font-bold font-oldschool text-center">
                    No Listing.<br></br> Just offer or sell.
                  </span>
                </div>
                <div className="bg-green-600 rounded-lg w-48 h-48 flex items-center justify-center px-2">
                  <span className="text-xl font-bold font-oldschool text-center">
                    Price incrases follow the phi curve<br></br> not people’s
                    choices
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
                  href="#"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Docs
                </a>
                <a
                  href="#"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  GitHub
                </a>
                <a
                  href="#"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Discord
                </a>
                <a
                  href="#"
                  className="hover:text-white transition-colors font-oldschool font-bold"
                >
                  Twitter
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
