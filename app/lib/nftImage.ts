// NFT gorselini indirir — X/Farcaster profil fotografi olarak dogrudan
// kullanilabilsin diye cerceve, yazi, filigran yok.
//
// Koleksiyonlar iki farkli sekilde gorsel veriyor:
//  - Zincirde SVG (vrnouns, ok-computers, dinos): 2048x2048 kare PNG'ye
//    rasterize ediyoruz, piksel kenarlari net kalsin diye yumusatma kapali.
//  - Dis dosya (warplets, base-day-one, gnars — IPFS/https): dosyayi oldugu
//    gibi indiriyoruz. base-day-one animasyonlu GIF; PNG'ye cevirmek
//    animasyonu oldururdu.

// PFP icin fazlasiyla yeterli, dosya boyutu da makul kaliyor.
const SIZE = 2048;

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

const loadArt = (src: string, box: number): Promise<HTMLImageElement> => {
  let resolved = src;
  // Firefox intrinsic boyut vermeyen SVG'yi 0x0 cizer; width/height yoksa ekliyoruz.
  if (src.startsWith("data:image/svg+xml;base64,")) {
    try {
      const svg = atob(src.split(",")[1]);
      if (!/<svg[^>]*\swidth=/i.test(svg)) {
        resolved = `data:image/svg+xml;base64,${btoa(
          svg.replace(/<svg\b/i, `<svg width="${box}" height="${box}"`),
        )}`;
      }
    } catch {
      // Kodlama basarisizsa orijinal src ile devam
    }
  }
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("artwork-load-failed"));
    img.src = resolved;
  });
};

const rasterize = async (image: string): Promise<Blob> => {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-unavailable");

  const art = await loadArt(image, SIZE);
  // Piksel sanatinin kenarlari buyutulunce bulanmasin
  ctx.imageSmoothingEnabled = false;

  const ratio = art.width && art.height ? art.width / art.height : 1;
  if (Math.abs(ratio - 1) < 0.01) {
    // Kare eser — tuvali tamamen doldur
    ctx.drawImage(art, 0, 0, SIZE, SIZE);
  } else {
    // Kare olmayan eserde orani koru; PFP kirpmasi zaten merkezden yapiliyor
    const drawW = ratio >= 1 ? SIZE : SIZE * ratio;
    const drawH = ratio >= 1 ? SIZE / ratio : SIZE;
    ctx.drawImage(art, (SIZE - drawW) / 2, (SIZE - drawH) / 2, drawW, drawH);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("encode-failed"));
    }, "image/png");
  });
};

export interface NftDownload {
  blob: Blob;
  ext: string;
}

export const buildNftDownload = async (image: string): Promise<NftDownload> => {
  if (image.startsWith("data:")) {
    return { blob: await rasterize(image), ext: "png" };
  }

  // Dis dosya — orijinali bozmadan indir (GIF animasyonu, tam cozunurluk korunur)
  const response = await fetch(image, { mode: "cors" });
  if (!response.ok) throw new Error("fetch-failed");
  const blob = await response.blob();
  const ext = EXT_BY_TYPE[blob.type.split(";")[0]] ?? "png";
  return { blob, ext };
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // download niteligini desteklemeyen webview'da (mini app) yeni sekmede ac
  if (typeof a.download === "undefined") {
    window.open(url, "_blank");
  } else {
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
