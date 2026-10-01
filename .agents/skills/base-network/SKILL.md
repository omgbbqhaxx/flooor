---
name: base-network
description: Flooor projesi Base ağında (Ethereum mainnet'te DEĞİL) çalışır. Chain, RPC, ENS/basename, contract adresi veya network seçimi içeren her kod değişikliğinde bunu uygula.
---

**Flooor projesi Base ağındadır.** Ethereum mainnet değil. Kontratlar (`CONTRACT_ADDR`, `COLLECTION_ADDR`) Base'de deploy edilmiştir, kullanıcılar cüzdanlarını Base ağına bağlamak zorundadır (`useSwitchChain` ile Base zorunluluğu kodda var).

Bu yüzden:
- Her `createPublicClient` / wagmi config / chain seçimi **`chain: base`** kullanmalı (viem veya wagmi'nin `wagmi/chains` / `viem/chains` paketinden), **`mainnet` kullanma.**
- Basename (reverse) çözümlemesi için viem'in `getEnsName`/CCIP-Read akışını (mainnet'e gidip oradan offchain-lookup ile Base verisini çekme) KULLANMA — bu hem yanlış chain'e bağımlı hem de gateway/public-RPC kesintilerine karşı kırılgan. Onun yerine veri zaten Base'de yaşadığı için **doğrudan Base'deki L2Resolver kontratını oku**: adres `0xC6d566A56A1aFf6508b41f6c90ff131615583BCD`, fonksiyon `name(bytes32 node)`. Node, ENSIP-19 reverse node hesabıyla (`convertReverseNodeToBytes`, ENSIP-11 coinType = `0x80000000 | chainId`) üretilir. Bu yöntem `app/page.tsx` ve `app/beta/page.tsx`'de uygulanmıştır, kontrat adresi kaynağı: github.com/base/basenames.
- `chain: mainnet` ile kurulan bir client üzerinden basename çözümlemeye ÇALIŞMA — bu, 2026-06-23'teki "beta sayfası çalışmıyor / Daily Sign Earn $0 görünüyor" şikayetinin kök nedeniydi.
- RPC URL'leri Base RPC'leri olmalı (örn. `https://mainnet.base.org`, `https://base-rpc.publicnode.com`), Ethereum mainnet RPC'leri (`eth.llamarpc.com`, `ethereum-rpc.publicnode.com` vb.) DEĞİL.
- Yeni bir sayfa/feature eklerken (örn. warplets) Base dışında bir chain varsayma; mainnet importu görürsen şüphelen.
