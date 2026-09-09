---
name: contract
description: Yeni bir koleksiyon için v2 (token bazlı çoklu imza) Flooor market kontratı üretir. Kullanım: /contract --<0xKoleksiyonAdresi> --<kontratAdi> --<rh|base> (sıra serbest). Örn. /contract --0x8c71d170fbd94bcba93bb08fc2cfd0e8620cd9ce --flooorrhmachines --rh
---

Kullanıcı `/contract --<adres> --<isim> --<ağ>` yazdığında **soru sormadan** hemen yeni .sol dosyasını üret. Üç argüman da `--` önekli, sıra önemsiz: `0x` ile başlayan 40 hex → adres, `base`/`rh`/`robinhood` → ağ, geri kalan → kontrat adı.

## Ne yapar

- Şablon: `app/contracts/mainnetcontracts/ronks.sol` (v2 ailesi: token bazlı çoklu imza, `transferFrom`, `setMinBid`, `transferOwnership`, borç korumalı `sweepETH`). VRNouns'un `contract.sol`'u (v1) şablon DEĞİLDİR.
- Sadece iki şey değişir: `contract flooordotfunronks {` → `contract <isim> {` ve `collectionId` sabiti → verilen adres. Başka hiçbir satıra dokunulmaz.
- Dosya adı: kontrat adının başındaki `flooordotfun` / `flooor` öneki atılıp küçük harfe çevrilmiş hali. `flooorrhmachines` → `rhmachines.sol`. Kontrat adı ise verildiği gibi kalır.
- Var olan bir dosyanın üzerine yazmaz, hata verir.
- Chain (varsayılan `base`): kaynak koddaki WETH satırını değiştirir ve deploy'da verilecek `_weth` constructor argümanını yazdırır. Kullanıcı sona `rh` (veya `robinhood`) yazarsa Robinhood, `base` yazarsa Base. Chain yazılmadıysa `base` varsayılır; koleksiyonun Robinhood'da olduğu belliyse `rh` geç.

## WETH neden önemli

`_weth` constructor argümanıdır, kaynakta sabit değildir. Yanlış chain'in WETH'i verilirse refund fallback'i (`_safeTransferETHWithFallback`) patlar ve teklif/satış kilitlenir.

| Chain | chainId | WETH (`_weth`) |
|---|---|---|
| Base | 8453 | `0x4200000000000000000000000000000000000006` |
| Robinhood Chain | 4663 | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

Robinhood adresi docs.robinhood.com/chain/contracts'tan ve canlı Ronks kontratının (`0xe439…2cbc`) `WETH()` çağrısından doğrulandı (2026-09-09). Base'in `0x4200…0006` adresinde Robinhood'da kod YOK.

## Adımlar

1. Argümanları olduğu gibi script'e geçir, ayrıştırmayı script yapar.
2. Çalıştır:
   ```bash
   .claude/skills/contract/generate.sh --<adres> --<isim> --<base|rh|robinhood>
   ```
3. Script çıktısındaki dosya yolunu, kontrat adını, adresi ve deploy'da verilecek `_weth` değerini kullanıcıya bildir.
4. Kullanıcıya hatırlat: bu sadece kaynak dosyadır, deploy değildir. Frontend sayfası ve `app/abi/<isim>.json` ancak kontrat deploy edilip adresi alındıktan sonra eklenir (bkz. `contract-vs-frontend-sync` skill'i). Bunları kendiliğinden yapma.

## Yapma

- Şablona ek özellik, fee değişikliği veya "iyileştirme" ekleme. Kullanıcı istemedikçe birebir kopya.
- Adresi checksum'suz bırakma. Solidity adres sabitlerinde EIP-55 zorunludur, küçük harfli adres derleme hatası verir; script adresi otomatik checksum'lı forma çevirir (repo'daki viem ile), çıktıdaki adresi kullan.
- ABI/frontend üretme.
