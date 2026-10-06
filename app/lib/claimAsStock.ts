// Claim'i ETH yerine AMDc (Coinbase'in Base'deki tokenize AMD hissesi)
// olarak alma yolu. Önceki kampanyalar AMZNc, SPCXc, AAPLc idi; token
// adresi/sembolü/havuzu tek yerde.
//
// Kontrat claim'de ETH'i cüzdana yollar; biz aynı wallet_sendCalls paketinin
// sonuna bir swap call'ı ekliyoruz. Paket atomik cüzdanda tek işlemde koşar:
// claim'ler ETH'i getirir, son call o ETH'i AMDc'ye çevirir.
//
// Base app'in kendi swap'ı CDP Trade API'ye (0x) gidiyor (sunucu anahtarı
// ister, statik siteye konmaz). Onun yerine doğrudan zincirdeki havuzları
// kullanıyoruz. AMDc'nin Uniswap V3 havuzu yok; likidite Aerodrome Slipstream'de
// (CLFactory 0xf8f2…61Ef). Router/quoter o factory'ye bağlı olanlar olmalı,
// Aerodrome'un eski Slipstream router'ları bu havuzları görmez.
// ETH → USDC (tickSpacing 50, derin) → AMDc (tickSpacing 1, 0.01%).
import { simulateContract, readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { encodeFunctionData, encodePacked, parseAbi, type Abi, type Address, type Hex } from "viem";

export const STOCK: { address: Address; symbol: string; name: string; decimals: number; cashtag: string; tickSpacing: number } = {
  address: "0xb2000000000000000000000d8ce462e99ee7a47b",
  symbol: "AMDc",
  // Metinlerde "tokenized AMD stock"
  name: "AMD",
  decimals: 8,
  // X paylaşımında hisse etiketi
  cashtag: "$AMD",
  // USDC/AMDc likit havuzu tickSpacing 1 olan (0x821b…4D13); tickSpacing 10
  // havuzunda aktif likidite yok. Token değişince bunu zincirde kontrol et.
  tickSpacing: 1,
};

const WETH: Address = "0x4200000000000000000000000000000000000006";
const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// WETH/USDC tickSpacing 50 havuzu bu factory'nin en derini
const WETH_USDC_TICK_SPACING = 50;
const SWAP_ROUTER: Address = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F";
const QUOTER_V2: Address = "0x514c8B5f54112481E28028F1166Bd78501089259";

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

const QUOTER_ABI = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const ROUTER_ABI = parseAbi([
  "struct ExactInputParams { bytes path; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; }",
  "function exactInput(ExactInputParams params) payable returns (uint256 amountOut)",
]);

export type StockCall = { to: Address; data: Hex; value: bigint };

// Bu kadar ETH kaç AMDc eder? (8 decimals)
export const quoteStock = async (opts: {
  config: Config;
  chainId: number;
  amountInWei: bigint;
}): Promise<bigint> => {
  const { config, chainId, amountInWei } = opts;
  const { result } = await simulateContract(config, {
    address: QUOTER_V2,
    abi: QUOTER_ABI,
    functionName: "quoteExactInput",
    args: [PATH, amountInWei],
    chainId,
  });
  return result[0];
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
