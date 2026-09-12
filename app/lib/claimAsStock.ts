// Claim'i ETH yerine AMZNc (Coinbase'in Base'deki tokenize Amazon hissesi)
// olarak alma yolu.
//
// Kontrat claim'de ETH'i cüzdana yollar; biz aynı wallet_sendCalls paketinin
// sonuna bir Uniswap V3 swap call'ı ekliyoruz. Paket atomik cüzdanda tek
// işlemde koşar: claim'ler ETH'i getirir, son call o ETH'i AMZNc'ye çevirir.
//
// Base app'in kendi swap'ı CDP Trade API'ye gidiyor (sunucu anahtarı ister,
// statik siteye konmaz). Onun yerine doğrudan zincirdeki havuzları kullanıyoruz:
// ETH → USDC (0.05%, derin) → AMZNc (1%, Coinbase hisse havuzu). Claim
// boyutlarında (birkaç dolar – birkaç yüz dolar) kayma ihmal edilebilir.
import { simulateContract, readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { encodeFunctionData, encodePacked, parseAbi, type Abi, type Address, type Hex } from "viem";

export const AMZNC: { address: Address; symbol: string; decimals: number } = {
  address: "0xb200000000000000000000d9192b6B456483C2E8",
  symbol: "AMZNc",
  decimals: 8,
};

const WETH: Address = "0x4200000000000000000000000000000000000006";
const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const SWAP_ROUTER_02: Address = "0x2626664c2603336E57B271c5C0b26F421741e481";
const QUOTER_V2: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

// Kaymaya tolerans — %1'lik havuz ücreti quote'un içinde, bu sadece quote ile
// gerçekleşme arasındaki fiyat hareketi için.
const SLIPPAGE_BPS = BigInt(300);

const PATH: Hex = encodePacked(
  ["address", "uint24", "address", "uint24", "address"],
  [WETH, 500, USDC, 10000, AMZNC.address],
);

const QUOTER_ABI = parseAbi([
  "function quoteExactInput(bytes path, uint256 amountIn) returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
]);

const ROUTER_ABI = parseAbi([
  "struct ExactInputParams { bytes path; address recipient; uint256 amountIn; uint256 amountOutMinimum; }",
  "function exactInput(ExactInputParams params) payable returns (uint256 amountOut)",
]);

export type StockCall = { to: Address; data: Hex; value: bigint };

// Bu kadar ETH kaç AMZNc eder? (8 decimals)
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
  const n = Number(units) / 10 ** AMZNC.decimals;
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
  return {
    to: SWAP_ROUTER_02,
    value: amountInWei,
    data: encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInput",
      args: [{ path: PATH, recipient, amountIn: amountInWei, amountOutMinimum: minOut }],
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
