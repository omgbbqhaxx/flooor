---
name: contract-vs-frontend-sync
description: Flooor'da kontrat dosyaları (app/contracts/*.sol) ile canlı frontend (app/page.tsx, app/beta/page.tsx, app/genesis/page.tsx, app/abi/*.json) ayrı yaşam döngülerine sahiptir. Solidity dosyasını değiştirirken veya ABI/frontend güncellerken her zaman uygula.
---

**Bir `.sol` dosyasını değiştirmek, zincirdeki kontratı değiştirmez.** `app/contracts/warplets.sol` gibi dosyalar repo'da kod olarak durur; canlıdaki kontrat sadece `npx hardhat deploy` / manuel deploy ile güncellenir. Dosyayı editlemek tek başlı hiçbir şeyi "patlatmaz" ama bu yüzden de **dosyadaki değişiklik otomatik olarak frontend'i bozmaz** — ta ki birisi (sen) frontend'i de değiştirip canlı kontratla uyumsuz hale getirene kadar.

**Kontrol etmen gereken şey:** Bir sayfanın hangi kontrata bağlı olduğunu `CONTRACT_ADDR` sabitinden oku:
```
grep -n "CONTRACT_ADDR\s*=" app/page.tsx app/beta/page.tsx app/genesis/page.tsx
```
2026-06-28 itibarıyla üçü de **aynı canlı adrese** (`0xF6B2C2411a101Db46c8513dDAef10b11184c58fF`) bağlıydı ve bu adresteki deploy edilmiş kontrat ESKİ ABI'yi (örn. `mySignedToken`, adres-bazlı sign/claim, `balanceOf==1` kısıtı) bekliyordu.

**Kural:**
- `.sol` dosyasında yeni bir fonksiyon/imza/davranış değişikliği yaptıysan, bu değişiklik **henüz deploy edilmemiş** demektir — aksini doğrulamadan (kullanıcıya sorarak veya deploy script/tx hash görerek) varsayma.
- Deploy edilmemiş bir kontrat değişikliği için `app/abi/*.json` veya `app/page.tsx` / `app/beta/page.tsx` / `app/genesis/page.tsx` içindeki `readContract`/`writeContract` çağrılarını **GÜNCELLEME**. Bu dosyalar o anda zincirde yaşayan kontratla konuşuyor; ABI'yi kontrata uymayan bir fonksiyon adıyla değiştirmek canlıyı kırar (örn. `mySignedToken` kaldırılıp `isTokenSigned` ile değiştirilince üç sayfa da runtime'da revert/hata alır).
- "Şunu beta için geliştiriyoruz" / "gelecek için hazırlıyoruz" dendiğinde, bu genelde **henüz deploy edilmemiş** anlamına gelir — kontrat dosyasını değiştirmek serbesttir, ama hangi sayfanın/ABI'nin ne zaman güncelleneceği konusunda kullanıcıya sor; varsayılan olarak canlı sayfaları dokunulmamış bırak.
- Yeni kontrat deploy edildiğinde: yeni adres net biçimde verilmeli (kullanıcıdan), ABI o noktada güncellenmeli, ve hangi sayfanın (`page.tsx` mi, yeni bir route mu) yeni kontrata bağlanacağı kullanıcıyla teyit edilmeli — kendiliğinden tüm sayfaları yeni adrese taşıma.

**Geçmiş olay (2026-06-28):** Kontrat token-bazlı sign/claim'e geçirilirken (bkz. `warplets.sol`), henüz deploy edilmemiş bu değişikliğe göre `page.tsx`/`beta/page.tsx`/`genesis/page.tsx`/`abi/market.json` güncellendi ve canlı kontratla uyumsuz hale getirildi. Kullanıcı fark edip durdurdu, değişiklikler `git checkout` ile geri alındı.
