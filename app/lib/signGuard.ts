// signOrClaim icin tek noktadan "kontrollu" on kontrol.
//
// Neden var: writeContract dogrudan cagrildiginda revert cuzdana kadar gidiyor
// ve kullanici "bu islem basarisiz olacak" kirmizi uyarisini goruyor. Burada
// once simule ediyoruz ve SADECE simulasyon temiz gecerse cuzdani aciyoruz.
//
// Onemli: simulasyon dogrulanamazsa (RPC hatasi) akisi BLOKLUYORUZ — eskiden
// sessizce devam edip cuzdanda patliyordu. Gecici ag hatasinda bosuna
// bloklamamak icin once birkac kez tekrar deniyoruz.
import { simulateContract } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Abi, Address } from "viem";
import { describeSignRevert } from "./signRevert";

export type SignGuardResult = { ok: true } | { ok: false; message: string };

// Zincirden gelen bir revert degil, tasima katmani hatasi mi?
const isTransportError = (error: unknown): boolean => {
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    msg.includes("http request failed") ||
    msg.includes("failed to fetch") ||
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("networkerror") ||
    msg.includes("err_connection") ||
    msg.includes("load failed")
  );
};

export const guardSignOrClaim = async (opts: {
  config: Config;
  contract: Address;
  abi: Abi | readonly unknown[];
  tokenId: bigint;
  account: Address;
  chainId?: number;
  attempts?: number;
}): Promise<SignGuardResult> => {
  const { config, contract, abi, tokenId, account, chainId, attempts = 3 } =
    opts;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await simulateContract(config, {
        address: contract,
        abi: abi as Abi,
        functionName: "signOrClaim",
        args: [tokenId],
        account,
        // Coklu zincirde chainId verilmezse wagmi sessizce config.chains[0]'a duser
        ...(chainId !== undefined ? { chainId } : {}),
      });
      return { ok: true };
    } catch (error) {
      // Tanidigimiz bir revert — net mesaj, tekrar denemeye gerek yok
      const reason = describeSignRevert(error);
      if (reason) return { ok: false, message: reason };
      // Tanimadigimiz kalici bir revert — yine de cuzdani acmiyoruz
      if (!isTransportError(error)) break;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
  }

  return {
    ok: false,
    message:
      "Couldn't verify this transaction right now — check your connection and try again.",
  };
};
