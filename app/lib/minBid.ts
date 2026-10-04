// ============================================================================
// MINIMUM PRICE CONFIGURATION (in ETH)
//
// VRNouns (/) ve Genesis (/genesis) taban fiyatı TEK yerden gelir — ikisi
// her zaman aynı olmalı. Genesis geride kalırsa daha ucuz bir arka kapı
// açılıyor.
//
// Altai (v2) yükseltmesinden beri tek kaynak zincir: VRNouns v2 market
// kontratının `minbidAM` değeri (owner `setMinBid` ile değiştirir). İki sayfa
// da onu buradan okur. Aşağıdaki sabit yalnızca okuma başarısız olursa / ilk
// render'da kullanılan yedektir — kontrattaki değerle aynı tutulmalı.
// ============================================================================
import { readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { formatEther, parseAbi } from "viem";

export const MINIMUM_BID_FOR_SELL = 0.019;

export const VRNOUNS_V2_MARKET = "0xD53292182A342953f446CD4D10Dc177776044306" as const;
const MIN_BID_ABI = parseAbi(["function minbidAM() view returns (uint256)"]);

// Zincirdeki taban fiyat (ETH). Hata durumunda null — çağıran mevcut değeri korur.
export const readVrnounsMinBid = async (config: Config): Promise<number | null> => {
  try {
    const wei = await readContract(config, {
      address: VRNOUNS_V2_MARKET,
      abi: MIN_BID_ABI,
      functionName: "minbidAM",
      chainId: 8453,
    });
    const eth = parseFloat(formatEther(wei));
    return eth > 0 ? eth : null;
  } catch (error) {
    console.error("Error reading VRNouns min bid:", error);
    return null;
  }
};
