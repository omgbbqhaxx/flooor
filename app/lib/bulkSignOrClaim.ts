// Tek onayla çoklu signOrClaim (EIP-5792).
//
// Kontratta signOrClaim(uint256) tek token alıyor ve dizi kabul eden bir
// varyantı yok. Ama Warplets deploy'unda epoch kilidi TOKEN bazlı —
// keccak("T", epochStart, tokenId) — adres bazlı değil. Yani bir cüzdan aynı
// epoch'ta sahip olduğu her token için ayrı ayrı çağırabiliyor. Kullanıcılar
// da bugüne kadar kartlardan tek tek yapıyordu.
//
// Burada yaptığımız şey o N çağrıyı wallet_sendCalls ile tek pakete koymak:
// tek imza, tek işlem. Kontrat değişmiyor, kuralların hiçbiri esnemiyor;
// kazanç tamamen onay sayısında. Gaz düşmez — her call kendi storage
// yazımını ödemeye devam eder.
import {
  getCapabilities,
  sendCalls,
  waitForCallsStatus,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions";
import type { Config } from "wagmi";
import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";

export type BulkOutcome =
  // sequential: cüzdan wallet_sendCalls bilmiyordu, token'lar tek tek
  // imzalatıldı; `done` kaçının zincirde geçtiği (iptalde yarıda kalabilir).
  | { ok: true; sequential?: boolean; done?: number }
  | { ok: false; message: string };

// Cüzdan çağrıları tek işlemde, hepsi-ya-hiç çalıştırabiliyor mu?
// Çalıştıramıyorsa sendCalls yine kabul edilebilir ama call'lar sırayla gider
// ve yarıda kalabilir. Sign/claim'de bu katlanılabilir bir sonuç (fon riski
// yok, kalanlar kartlardan tamamlanır), o yüzden engellemiyoruz — sadece
// kullanıcıya ne olacağını önceden söyleyebilmek için okuyoruz.
export const supportsAtomicBatch = async (opts: {
  config: Config;
  account: Address;
  chainId: number;
}): Promise<boolean> => {
  const { config, account, chainId } = opts;
  try {
    const caps = await getCapabilities(config, { account, chainId });
    const status = (caps as { atomic?: { status?: string } })?.atomic?.status;
    return status === "supported" || status === "ready";
  } catch {
    // Cüzdan wallet_getCapabilities bilmiyorsa atomik varsaymıyoruz
    return false;
  }
};

// Cüzdanın batch'i hiç desteklemediği durum: kullanıcıyı kartlara yönlendirmek
// için ayırt edebilmemiz lazım, genel bir hata mesajına gömülmemeli.
const isUnsupportedError = (error: unknown): boolean => {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    msg.includes("does not support") ||
    msg.includes("unsupported") ||
    msg.includes("not supported") ||
    msg.includes("method not found") ||
    msg.includes("wallet_sendcalls") ||
    msg.includes("unsupportedproviderrmethod") ||
    msg.includes("4200")
  );
};

export const bulkSignOrClaim = async (opts: {
  config: Config;
  contract: Address;
  abi: Abi | readonly unknown[];
  tokenIds: readonly bigint[];
  account: Address;
  chainId: number;
  // writeContract'taki builder attribution'ı batch'te de koruyoruz; sendCalls
  // dataSuffix almadığı için calldata'nın sonuna elle ekliyoruz.
  dataSuffix?: Hex;
  // Sıralı yedek yolda her onaydan sonra çağrılır (kaç bitti / toplam)
  onProgress?: (done: number, total: number) => void;
}): Promise<BulkOutcome> => {
  const { config, contract, abi, tokenIds, account, chainId, dataSuffix, onProgress } = opts;

  if (tokenIds.length === 0) {
    return { ok: false, message: "Nothing to do — no eligible works." };
  }

  const suffix = dataSuffix ? dataSuffix.slice(2) : "";
  const calls = tokenIds.map((tokenId) => ({
    to: contract,
    data: (encodeFunctionData({
      abi: abi as Abi,
      functionName: "signOrClaim",
      args: [tokenId],
    }) + suffix) as Hex,
  }));

  let id: string;
  try {
    const result = await sendCalls(config, { account, chainId, calls });
    id = result.id;
  } catch (error) {
    if (!isUnsupportedError(error)) throw error;

    // Cüzdan EIP-5792 bilmiyor (eski MetaMask, bazı mobil cüzdanlar). Kullanıcıyı
    // kartlara geri yollamak yerine aynı listeyi biz sırayla imzalatıyoruz:
    // N onay ama sıfır tıklama. Her hash'i onaylanana kadar bekliyoruz ki
    // nonce sırası bozulmasın ve iptal edilen bir tanesi geri kalanı
    // sürüklemesin. Kullanıcı ortada iptal ederse o ana kadar geçenler
    // zincirde kalır — çağıran taraf durumu zincirden yeniden okuyor.
    let done = 0;
    for (const tokenId of tokenIds) {
      const hash = await writeContract(config, {
        address: contract,
        abi: abi as Abi,
        functionName: "signOrClaim",
        args: [tokenId],
        account,
        chainId,
        dataSuffix,
      });
      const receipt = await waitForTransactionReceipt(config, { hash, chainId });
      if (receipt.status !== "success") {
        return {
          ok: false,
          message:
            done > 0
              ? `Transaction ${done + 1} of ${tokenIds.length} reverted — the first ${done} went through.`
              : "The transaction reverted on-chain — nothing was changed.",
        };
      }
      done += 1;
      onProgress?.(done, tokenIds.length);
    }
    return { ok: true, sequential: true, done };
  }

  // Paket kabul edildi ≠ zincirde başarılı. Tek tek akışta awaitTx ne yapıyorsa
  // burada da onu yapıyoruz: durum "success" dönmeden başarı saymıyoruz.
  const { status } = await waitForCallsStatus(config, { id });
  if (status !== "success") {
    return {
      ok: false,
      message:
        status === "failure"
          ? "The batch reverted on-chain — nothing was changed."
          : "Couldn't confirm the batch — check your wallet activity.",
    };
  }

  // Kaç token'ın gerçekten geçtiğini receipt sayısından çıkaramayız: atomik
  // cüzdan 10 call için tek receipt döndürür, atomik olmayan cüzdan ise her
  // call için ayrı. Doğru sayı zincirde — çağıran taraf durumu yeniden okusun.
  return { ok: true };
};
