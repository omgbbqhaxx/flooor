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
    <div className="bg-[#191919] text-white min-h-screen">
      <header className="px-8 py-4">
        <div className="flex items-center justify-center space-x-6">
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

      <main className="flex flex-col items-center mt-20 space-y-16">
        <h1 className="text-5xl font-extrabold text-center font-oldschool">
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
              Price incrases follow the phi curve<br></br> not people’s choices
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
