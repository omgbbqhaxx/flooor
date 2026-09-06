// writeContract, cüzdan işlemi ağa gönderdiği anda (hash ile) döner — işlem
// onaylanmış ya da başarılı olmuş demek değildir. Bazı cüzdanlar iptal
// akışında bile hash döndürebiliyor, kullanıcı gönderdikten sonra da iptal
// edebiliyor. Başarı toast'ı / konfeti / paylaşım modalı ancak receipt
// "success" dönerse gösterilmeli; bu yardımcı onu tek yerden sağlar.
import { waitForTransactionReceipt } from "wagmi/actions";
import type { Config } from "wagmi";
import type { Hash } from "viem";
import { toast } from "sonner";

// true → zincirde başarıyla onaylandı; false → revert/iptal (toast gösterildi)
export const awaitTx = async (
  config: Config,
  hash: Hash,
  chainId: number,
): Promise<boolean> => {
  const pending = toast.loading("Sent — waiting for confirmation…");
  try {
    const receipt = await waitForTransactionReceipt(config, {
      hash,
      // Çoklu zincirde chainId verilmezse wagmi config.chains[0]'a (Base) düşer
      chainId,
    });
    if (receipt.status !== "success") {
      toast.error("Transaction reverted on-chain — nothing was changed.");
      return false;
    }
    return true;
  } catch (error) {
    // Replaced/dropped tx (cüzdanda hızlandırma veya iptal) burada düşer
    const msg = error instanceof Error ? error.message : String(error);
    toast.error(
      msg.toLowerCase().includes("replaced") ||
        msg.toLowerCase().includes("cancel")
        ? "Transaction was cancelled or replaced in your wallet."
        : "Couldn't confirm the transaction — check your wallet activity.",
    );
    return false;
  } finally {
    toast.dismiss(pending);
  }
};
