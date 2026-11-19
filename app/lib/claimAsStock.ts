// Claim'i ETH yerine ANTc (Coinbase'in Base'deki tokenize Anthropic hissesi)
// olarak alma yolu. Önceki kampanyalar AMZNc, SPCXc, AAPLc, AMDc, TSLAc idi
// (AMDc havuzu boşalınca swap revert etti); token adresi/sembolü/havuzu tek yerde.
//
// Kontrat claim'de ETH'i cüzdana yollar; biz aynı wallet_sendCalls paketinin
// sonuna bir swap call'ı ekliyoruz. Paket atomik cüzdanda tek işlemde koşar:
// claim'ler ETH'i getirir, son call o ETH'i ANTc'ye çevirir.
//
// Base app'in kendi swap'ı CDP Trade API'ye (0x) gidiyor (sunucu anahtarı
// ister, statik siteye konmaz). Onun yerine doğrudan zincirdeki havuzları
// kullanıyoruz. ANTc'nin en derin havuzu Aerodrome Slipstream'in YENİ
// CLFactory'sinde (0x9CB2…7a76; USDC/ANTc ts10 0x599C…ED15, ~557k$ likidite).
// SPCXc'nin durduğu eski factory (0xf8f2…61Ef) ve onun router/quoter'ı bu
// havuzu görmez. Router o factory'ye bağlı olan (factory() = 0x9CB2…).
// ETH → USDC (tickSpacing 50, ~1.35M$) → ANTc (tickSpacing 10).
// 2026-11-19 simülasyon: 0.5 ETH → 9.17 ANTc, kayma ~%0.2.
import { simulateContract, readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { encodeFunctionData, encodePacked, parseAbi, type Abi, type Address, type Hex } from "viem";

export const STOCK: {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  cashtag: string;
  xHandle: string;
  tickSpacing: number;
} = {
  address: "0xb20000000000000000000016e38fd364d271ba28",
  symbol: "ANTc",
  // Metinlerde "tokenized Anthropic stock"
  name: "Anthropic",
  decimals: 8,
  // Paylaşım metninde hep $ANT yazılır
  cashtag: "$ANT",
  // X paylaşımında stock claim'inde ek olarak etiketlenir (Farcaster'da değil)
  xHandle: "@AnthropicAI",
  tickSpacing: 10,
};

const WETH: Address = "0x4200000000000000000000000000000000000006";
const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// Yeni factory'nin WETH/USDC tickSpacing 50 havuzu (0x4A7a…366c) en derini
const WETH_USDC_TICK_SPACING = 50;
// Yeni CLFactory'ye (0x9CB2…7a76) bağlı Slipstream SwapRouter
const SWAP_ROUTER: Address = "0x9Ee35Bf1bd69a03c6F0393582030fCe8Bb93D418";
// Quote için router'ın swap'ını eth_call ile simüle ediyoruz (bu factory'nin
// quoter'ı yok elimizde). Simülasyonun "from"u bol ETH'li bir adres olmalı —
// kullanıcının ETH'i claim'den sonra geleceği için onun cüzdanı yetmeyebilir.
// WETH kontratı her zaman yüklü ETH tutar; sadece okuma, işlem atılmaz.
const QUOTE_FROM: Address = WETH;
const QUOTE_SINK: Address = "0x000000000000000000000000000000000000dEaD";

// Kaymaya tolerans — havuz ücreti quote'un içinde, bu sadece quote ile
// gerçekleşme arasındaki fiyat hareketi için.
const SLIPPAGE_BPS = BigInt(300);

// Slipstream router'ı deadline ister; imza ekranında beklemeye pay.
const DEADLINE_SECONDS = 60 * 60;

// Slipstream path'i fee yerine int24 tickSpacing taşır.
const PATH: Hex = encodePacked(
  ["address", "int24", "address", "int24", "address"],
  [WETH, WETH_USDC_TICK_SPACING, USDC, STOCK.tickSpacing, STOCK.address],
);

const ROUTER_ABI = parseAbi([
  "struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }",
  "function exactInput(ExactInputParams params) payable returns (uint256 amountOut)",
]);

export type StockCall = { to: Address; data: Hex; value: bigint };

// Bu kadar ETH kaç ANTc eder? (8 decimals)
export const quoteStock = async (opts: {
  config: Config;
  chainId: number;
  amountInWei: bigint;
}): Promise<bigint> => {
  const { config, chainId, amountInWei } = opts;
  const { result } = await simulateContract(config, {
    account: QUOTE_FROM,
    address: SWAP_ROUTER,
    abi: ROUTER_ABI,
    functionName: "exactInput",
    value: amountInWei,
    args: [{
      path: PATH,
      recipient: QUOTE_SINK,
      deadline: BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS),
      amountIn: amountInWei,
      amountOutMinimum: BigInt(0),
    }],
    chainId,
  });
  return result;
};

export const formatStock = (units: bigint): string => {
  const n = Number(units) / 10 ** STOCK.decimals;
  if (n === 0) return "0";
  if (n < 0.0001) return n.toFixed(8);
  if (n < 1) return n.toFixed(5);
  return n.toFixed(3);
};

// Paketin sonuna eklenecek swap call'ı. Router ETH'i kendisi sarar; tam
// miktar gönderdiğimiz için refundETH'e gerek yok. Çıktı doğrudan cüzdana.
export const buildStockSwapCall = (opts: {
  recipient: Address;
  amountInWei: bigint;
  quotedOut: bigint;
}): StockCall => {
  const { recipient, amountInWei, quotedOut } = opts;
  const minOut = (quotedOut * (BigInt(10_000) - SLIPPAGE_BPS)) / BigInt(10_000);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  return {
    to: SWAP_ROUTER,
    value: amountInWei,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInput",
      args: [{ path: PATH, recipient, deadline, amountIn: amountInWei, amountOutMinimum: minOut }],
    }),
  };
};

// Bir token'ın claim'de alacağı tam ETH. Frontend'in "vault / signers"
// yuvarlaması swap için yetmez: bir wei fazla istersek paket revert eder.
// Kontrat mantığının aynısı: snapshot alınmışsa poolSnap, alınmamışsa (ilk
// claimer biziz) poolAccrued; bölü partCount, tam sayı bölmesi.
export const exactClaimShare = async (opts: {
  config: Config;
  contract: Address;
  abi: Abi | readonly unknown[];
  chainId: number;
}): Promise<bigint> => {
  const { config, contract, abi, chainId } = opts;
  const read = <T,>(functionName: string, args: readonly unknown[] = []) =>
    readContract(config, { address: contract, abi: abi as Abi, functionName, args, chainId }) as Promise<T>;
  const epochStart = await read<bigint>("currentEpochStart");
  const [snap, accrued, count] = await Promise.all([
    read<bigint>("poolSnap", [epochStart]),
    read<bigint>("poolAccrued"),
    read<bigint>("partCount", [epochStart]),
  ]);
  if (count === BigInt(0)) return BigInt(0);
  const pool = snap > BigInt(0) ? snap : accrued;
  return pool / count;
};

// X paylaşımında stock claim'i ise hissenin şirketini de etiketle
// (@AnthropicAI). Stock metni her zaman cashtag'i ($ANT) içerir; ETH claim
// metni içermez. Farcaster'da X handle'ı başka birini etiketleyebilir → eklenmez.
export const stockXMention = (platform: "x" | "farcaster", text: string): string =>
  platform === "x" && text.includes(STOCK.cashtag) ? ` ${STOCK.xHandle}` : "";
