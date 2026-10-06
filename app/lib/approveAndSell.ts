// Tek onayla approve + sellToHighest (EIP-5792).
//
// Onaysız bir token'ı satmak normalde iki işlem: önce koleksiyonda onay,
// sonra market'te sellToHighest. Market kontratlarının hepsi (v1 genesis,
// v2 vrnouns ve token bazlı aile) onayı iki yoldan kabul ediyor:
// getApproved(tokenId) == market || isApprovedForAll(sahip, market). Burada
// ikisini wallet_sendCalls ile tek atomik pakete koyuyoruz: aynı hesap,
// aynı msg.sender, tek imza.
//
// Pakette setApprovalForAll yerine sadece o token için approve kullanıyoruz:
// satış zaten aynı pakette gerçekleşiyor, koleksiyonun tamamına açık onay
// bırakmaya gerek yok. Satış revert ederse atomik paket onayı da geri alır.
//
// Dönüş: true → satıldı, false → paket zincirde başarısız (toast gösterildi),
// null → cüzdan atomik batch desteklemiyor; çağıran klasik iki adımlı akışa
// geçmeli. Kullanıcı reddederse hata fırlatılır (sayfanın "cancelled" akışı).
import { sendCalls, waitForCallsStatus } from "wagmi/actions";
import type { Config } from "wagmi";
import { encodeFunctionData, parseAbi, type Address, type Hex } from "viem";
import { toast } from "sonner";

const APPROVE_ABI = parseAbi(["function approve(address to, uint256 tokenId)"]);
const SELL_ABI = parseAbi(["function sellToHighest(uint256 tokenId)"]);

const isUserRejected = (error: unknown): boolean => {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return (
    code === 4001 ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request") ||
    message.includes("action_rejected")
  );
};

export const batchApproveAndSell = async (opts: {
  config: Config;
  account: Address;
  chainId: number;
  collection: Address;
  market: Address;
  tokenId: bigint;
  // writeContract'taki builder attribution'ı batch'te de koruyoruz; sendCalls
  // dataSuffix almadığı için calldata'nın sonuna elle ekliyoruz.
  dataSuffix?: Hex;
}): Promise<boolean | null> => {
  const { config, account, chainId, collection, market, tokenId, dataSuffix } = opts;
  const suffix = dataSuffix ? dataSuffix.slice(2) : "";

  let id: string;
  try {
    const result = await sendCalls(config, {
      account,
      chainId,
      // Atomik değilse approve ile satış ayrı işlemlere bölünebilir; o
      // durumda klasik akış daha öngörülebilir
      forceAtomic: true,
      calls: [
        {
          to: collection,
          data: (encodeFunctionData({ abi: APPROVE_ABI, functionName: "approve", args: [market, tokenId] }) + suffix) as Hex,
        },
        {
          to: market,
          data: (encodeFunctionData({ abi: SELL_ABI, functionName: "sellToHighest", args: [tokenId] }) + suffix) as Hex,
        },
      ],
    });
    id = result.id;
  } catch (error) {
    if (isUserRejected(error)) throw error;
    // wallet_sendCalls yok ya da atomik değil → klasik akış
    return null;
  }

  // Paket kabul edildi ≠ zincirde başarılı (bkz. awaitTx)
  const pending = toast.loading("Sent — waiting for confirmation…");
  try {
    const { status } = await waitForCallsStatus(config, { id, timeout: 180_000 });
    if (status !== "success") {
      toast.error(
        status === "failure"
          ? "Transaction reverted on-chain — nothing was changed."
          : "Couldn't confirm the transaction — check your wallet activity.",
      );
      return false;
    }
    return true;
  } catch {
    toast.error("Couldn't confirm the transaction — check your wallet activity.");
    return false;
  } finally {
    toast.dismiss(pending);
  }
};
