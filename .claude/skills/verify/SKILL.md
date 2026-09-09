---
name: verify
description: Deploy edilmiş bir Flooor market kontratını Blockscout'ta doğrular (forge verify-contract). Kullanım: /verify --<0xDeployAdresi> --<kaynakAdi> --<rh|base> [--runs=<n>] [--project=<foundryDizini>] [--sourcify] [--json] [--dry-run]. Örn. /verify --0xa14b6A3980C178D8f446F6a33Bad83a9aAa2D09D --rhmachines --rh
---

Kullanıcı `/verify --<adres> --<isim> --<ağ>` yazdığında **soru sormadan** script'i çalıştır. Argümanlar `--` önekli ve sıra bağımsız: `0x` ile başlayan 40 hex → deploy edilmiş market kontratının adresi (koleksiyon adresi DEĞİL), `base`/`rh`/`robinhood` → ağ, geri kalan → `app/contracts/mainnetcontracts/` altındaki dosya adı (`rhmachines`) ya da kontrat adı (`flooordotfunrhmachines`).

## Ne yapar

1. `.sol` dosyasını bulur, `contract X {` satırından kontrat adını okur.
2. Zincirdeki bytecode'un CBOR metadata'sından **gerçek solc sürümünü** okur (pragma'ya güvenmez) ve `WETH()` çağrısıyla kontratın doğru chain WETH'iyle deploy edildiğini kontrol eder. Uyuşmazsa durur.
3. `constructor(address _weth)` argümanını elle ABI-encode eder (`cast` gerekmez).
4. Geçici bir foundry projesi kurar (`$TMPDIR/flooor-verify-<isim>-<chainId>/`, `foundry.toml` + `src/<dosya>.sol`) ve şu komutu çalıştırır:
   ```bash
   forge verify-contract <adres> src/<dosya>.sol:<Kontrat> \
     --chain-id <4663|8453> --verifier blockscout \
     --verifier-url <https://robinhoodchain.blockscout.com/api/ | https://base.blockscout.com/api/> \
     --compiler-version <solc> --constructor-args <0x…weth> --watch
   ```
5. `forge` `~/.foundry/bin` altında kurulu (2026-09-09, v1.8.1); PATH'e `export PATH="$HOME/.foundry/bin:$PATH"` ekle. Yoksa komutu ekrana basar ve çıkış kodu 2 ile biter. Bu durumda komutu kullanıcıya olduğu gibi ver; `forge` kurulu terminalde çalıştırması gerekir (`curl -L https://foundry.paradigm.xyz | bash && foundryup`).

| Chain | chainId | Verifier URL | `_weth` |
|---|---|---|---|
| Base | 8453 | `https://base.blockscout.com/api/` | `0x4200000000000000000000000000000000000006` |
| Robinhood Chain | 4663 | `https://robinhoodchain.blockscout.com/api/` | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` |

## Optimizer eşleşmesi

Blockscout bytecode'u yeniden derleyip karşılaştırır; **derleyici ayarları deploy'dakiyle aynı olmalı**. Script varsayılan olarak optimizer kapalı derler (Foundry 1.x varsayılanı). Deploy optimizer açıkken yapıldıysa `--runs=200` gibi geç. En garantili yol: kontrat hangi foundry projesinden deploy edildiyse `--project=<o dizin>` ver, script `.sol`'u oraya kopyalayıp o projenin `foundry.toml`'uyla doğrular.

## Adımlar

1. Argümanları olduğu gibi script'e geçir:
   ```bash
   .claude/skills/verify/verify.sh --<adres> --<isim> --<base|rh|robinhood>
   ```
2. Çıktıyı kullanıcıya özetle: kontrat adı, solc sürümü, kullanılan `_weth`, sonuç (verified / hata / forge yok).
3. "Bytecode does not match" hatasında optimizer ayarını sor ya da `--project=` öner; kaynağı değiştirme.
4. Doğrulama sonrası `.sol` dosyasının 3. satırındaki `deployed at …` notu yoksa ekle. Frontend/ABI'ye dokunma.

## Bilinen engeller (2026-09-09)

- **Robinhood Blockscout API'si Cloudflare "managed challenge" arkasında.** `forge --verifier blockscout` isteği JS challenge HTML'i alır ve "Failed to deserialize response … Just a moment" ile düşer. Blockscout API key'i bunu **aşmaz**; challenge kimlik doğrulama değil tarayıcı kontrolüdür. `--skip-is-verified-check` de işe yaramaz, submit isteği de engellenir.
- **Sourcify** (`--sourcify`) chain 4663'ü destekliyor ve Blockscout Sourcify'dan otomatik import eder; ama Sourcify'ın kendi Robinhood RPC'si `cannot_fetch_bytecode` döndürüyordu. Ara ara tekrar dene, düzelmiş olabilir.
- Bu iki yol da tıkanınca **manuel yol**: `--json` ile `<isim>-standard-input.json` üret, `https://robinhoodchain.blockscout.com/address/<adres>/contract-verification` sayfasında "Solidity (Standard JSON input)" seçip yükle; kontrat adı, solc sürümü ve constructor args'ı script çıktısından kopyala. Alternatif "Single file": `.sol` içeriğini yapıştır, compiler `v0.8.34`, EVM `default`, optimization **kapalı**.
- Doğrulama gerçekten geçer mi diye önceden bilmek için script bytecode'u yerelde derleyip zincirdekiyle karşılaştırabilir: metadata hariç tek fark üç adet 20 baytlık `WETH` immutable slotu olmalı. Öyleyse derleme ayarları doğrudur, kalan sorun sadece gönderim kanalıdır.

## Yapma

- Koleksiyon (NFT) adresini market adresi sanma; verilen adreste `WETH()` yoksa script zaten uyarır.
- Doğrulama geçsin diye `.sol` içeriğini değiştirme; kaynak deploy edilenle birebir olmalı.
- Blockscout API'sini curl ile sorgulama, Cloudflare engelliyor; durumu forge `--watch` çıktısından oku.
