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
        <header className="py-4">
          <div className="flex items-center justify-between">
            {/* Sadece logo ve navbar'ı saran kutu */}
            <div className="flex items-center space-x-6 bg-gray-800/80 border-2  border-gray-400 rounded-2xl shadow-lg px-6 py-0.1 backdrop-blur">
              <Logo className="mt-2 h-12 w-auto" />
              <nav className="space-x-4 text-sm">
                <a href="#" className="hover:underline">
                  Ξ{" "}
                  <span className="font-oldschool tabular-nums font-bold">
                    3,621
                  </span>
                </a>
              </nav>
            </div>
            {/* Sağdaki cüzdan/buton kısmı çerçevenin dışında */}
            <div>
              <Wallet>
                <ConnectWallet className="px-6 py-3 border-2 border-gray-400 rounded-full  hover:bg-sky-400 hover:text-black transition" />
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
          {/* Resim örneği */}
          <div className="w-64 h-64 bg-gray-300 rounded-lg flex items-center justify-center">
            <img
              src="/bg.png"
              alt="Açıklamaa"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>

          <h1 className="text-5xl font-extrabold text-center text-black font-oldschool w-full">
            Royalties to the community.
          </h1>

          <div className="flex flex-col md:flex-row items-center md:space-x-8 space-y-8 md:space-y-0">
            <div className="bg-blue-500 rounded-lg w-48 h-48 flex items-center justify-center px-2">
              <span className="text-xl font-bold font-oldschool text-center">
                Stake your nft. <br></br> Earn royalties.<br></br> From sales.
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
