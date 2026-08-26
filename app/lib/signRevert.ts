// vrnouns/genesis kontratinda token kilidi (_signed) private ve disari acik
// bir isTokenSigned view'i yok — sadece adres bazli mySignedToken var. Bu yuzden
// "NFT bu epoch'ta zaten imzaladi" durumu ancak signOrClaim simule edilerek
// (ya da tx revert edilerek) ogrenilebiliyor. Burada revert reason'i kullaniciya
// gosterilebilir bir uyariya ceviriyoruz.
//
// Tanimadigimiz bir hata icin null doner — cagiran taraf o zaman kendi mevcut
// hata akisini surdurur, akisi bloklamaz.
export const describeSignRevert = (error: unknown): string | null => {
  const msg = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  // "token already signed" da "already signed" iceriyor; token varyantlari once.
  if (msg.includes("token used") || msg.includes("token already signed")) {
    return "This NFT has already signed in the current epoch — most likely by its previous owner. It becomes eligible again when the next epoch starts.";
  }
  if (msg.includes("already signed")) {
    return "This wallet has already signed in the current epoch. One signature per wallet per epoch.";
  }
  if (msg.includes("already claimed")) {
    return "You have already claimed your share for this epoch.";
  }
  if (msg.includes("wrong token for claim")) {
    return "Claim must be made with the same NFT you signed with, and it is no longer in this wallet.";
  }
  if (msg.includes("not signed")) {
    return "No signature found for this epoch, so there is nothing to claim.";
  }
  if (msg.includes("no participants") || msg.includes("zero share")) {
    return "There is nothing to claim for this epoch yet.";
  }
  return null;
};
