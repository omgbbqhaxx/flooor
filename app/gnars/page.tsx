"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import WorkCard from "@/app/components/WorkCard";

import { useState, useCallback, useEffect, useRef } from "react";
import { useConfig, useAccount, useSwitchChain } from "wagmi";
import { writeContract, readContract, getBalance, getPublicClient } from "wagmi/actions";
import { base } from "wagmi/chains";
import {
  parseEther,
  formatEther,
  keccak256,
  encodePacked,
  namehash,
  toHex,
  isAddress,
  type Address,
} from "viem";
import { Attribution } from "ox/erc8021";
import { sdk } from "@farcaster/miniapp-sdk";
import { Playfair_Display, Inter } from "next/font/google";
import confetti from "canvas-confetti";

import GNARS_ABI from "@/app/abi/gnars.json";
import NFT_ABI from "@/app/abi/nft.json";
import { scanOwnedTokenIds } from "@/app/lib/scanOwnedTokenIds";
import { HoloFrame } from "@/app/components/HoloFrame";

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-serif",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

const BUILDER_CODE = "bc_uzb9vqpt";
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

const retryWithBackoff = async (
  fn: () => Promise<unknown>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<unknown> => {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxRetries) throw lastError;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isRetryableError =
        errorMessage.includes("429") ||
        errorMessage.includes("Too Many Requests") ||
        errorMessage.includes("ERR_CONNECTION_RESET") ||
        errorMessage.includes("ERR_TIMED_OUT") ||
        errorMessage.includes("timeout");
      if (!isRetryableError) throw lastError;
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError!;
};

const isUserRejectedError = (error: unknown): boolean => {
  const message =
    (error instanceof Error ? error.message : String(error)).toLowerCase();
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

// "1234567" -> "1.2M", "42000" -> "42K" — market cap rozetinde kısa gösterim
const formatCompactUsd = (n: number): string => {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1)}K`;
  }
  return n.toFixed(0);
};

// --- Bildirim sesi: Web Audio API ---
// Birincil yol <audio> elementi: iOS'ta "medya" sayıldığı için telefonun
// sessiz anahtarından ETKİLENMEZ (Web Audio sessiz modda tamamen susar).
// Yedek yol Web Audio buffer'ı. İkisinin de kilidi ilk kullanıcı
// dokunuşunda açılır ve oturum boyunca açık kalır.
let chimeMuted = true; // varsayılan kapalı — header'daki zil düğmesiyle senkron
let chimeEl: HTMLAudioElement | null = null;
let chimeElUnlocked = false;
let audioCtx: AudioContext | null = null;
let chimeBuffer: AudioBuffer | null = null;
let chimeBufferPromise: Promise<void> | null = null;

const ensureChimeEl = (): HTMLAudioElement | null => {
  if (typeof window === "undefined") return null;
  if (!chimeEl) {
    chimeEl = new Audio("/chime.mp3");
    chimeEl.preload = "auto";
    (chimeEl as unknown as { playsInline?: boolean }).playsInline = true;
  }
  return chimeEl;
};

const ensureAudioCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
};

const loadChimeBuffer = (ctx: AudioContext) => {
  if (!chimeBufferPromise) {
    chimeBufferPromise = fetch("/chime.mp3")
      .then((r) => r.arrayBuffer())
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        chimeBuffer = decoded;
      })
      .catch(() => {
        chimeBufferPromise = null; // sonraki denemede tekrar indirilsin
      });
  }
  return chimeBufferPromise;
};

// Her kullanıcı etkileşiminde çağrılır; iki yolun da kilidini açar.
// Açıldıktan sonra no-op.
const unlockChime = () => {
  // Ses kapalıyken audio elementini hiç çalmaya gerek yok — özellikle iOS
  // volume=0'ı yok saydığı için bu "sessiz" unlock denemesi orada kısa ama
  // GERÇEKTEN duyulabilir bir sese dönüşüyordu. Sadece ses açıkken kilit aç.
  if (chimeMuted) return;
  const el = ensureChimeEl();
  if (el && !chimeElUnlocked) {
    // Gesture içinde sessiz (volume=0) çal-durdur: elementi kilitten çıkarır.
    // iOS volume'u yok sayar — orada ilk dokunuşta kısa bir ses duyulabilir,
    // zararsız.
    try {
      el.volume = 0;
      const p = el.play();
      if (p) {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.volume = 1;
          chimeElUnlocked = true;
        }).catch(() => {
          el.volume = 1;
        });
      }
    } catch {
      // element kilidi açılamadı — Web Audio yolu hâlâ denenecek
    }
  }
  const ctx = ensureAudioCtx();
  if (ctx) {
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    void loadChimeBuffer(ctx);
  }
};

const playViaWebAudio = (): boolean => {
  const ctx = ensureAudioCtx();
  if (ctx && ctx.state === "running" && chimeBuffer) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = chimeBuffer;
      src.connect(ctx.destination);
      src.start();
      return true;
    } catch {
      // Web Audio çalamadı
    }
  }
  return false;
};

let pendingChime = false;

const playChime = () => {
  if (chimeMuted) return;
  if (typeof document !== "undefined" && document.hidden) {
    // Sayfa arka plandayken (örn. bid onayı için cüzdan uygulamasına
    // geçilmişken) tarayıcı sesi düşürür — öne dönüşte çalmak üzere beklet
    pendingChime = true;
    return;
  }
  // Önce <audio> elementi (iOS sessiz anahtarına takılmaz), olmazsa Web Audio
  const el = ensureChimeEl();
  if (el && chimeElUnlocked) {
    try {
      el.currentTime = 0;
      el.volume = 1;
      const p = el.play();
      if (p)
        p.catch(() => {
          playViaWebAudio();
        });
      return;
    } catch {
      // element yolu çalışmadı — Web Audio'ya düş
    }
  }
  if (!playViaWebAudio() && el) {
    // Son çare: kilit açılmamış olsa da dene; tarayıcı izin veriyorsa çalar
    try {
      el.currentTime = 0;
      void el.play().catch(() => {});
    } catch {
      // ses çalınamadı — kritik değil
    }
  }
};

// Sayfa öne dönünce bekleyen sesi çal
const flushPendingChime = () => {
  if (pendingChime && typeof document !== "undefined" && !document.hidden) {
    pendingChime = false;
    playChime();
  }
};

const CONTRACT_ADDR = "0x0DA60a9965e1059F2258d5e74c3839844FEF1Cf9" as const;
const COLLECTION_ADDR = "0x880Fb3Cf5c6Cc2d7DFC13a993E839a9411200C17" as const;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const IS_DEPLOYED = CONTRACT_ADDR.toLowerCase() !== ZERO_ADDRESS;

// Claim/sell başarılı olduğunda "Realistic Look" konfeti: farklı hız/yayılımda
// beş ardışık patlama, site paletiyle (mürekkep/yeşil/altın/fildişi).
// prefers-reduced-motion'da hiç tetiklenmez.
const fireConfetti = () => {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const palette = [INK, GREEN, GOLD, IVORY];
  const count = 200;
  const defaults = { origin: { y: 0.7 }, colors: palette };
  const fire = (particleRatio: number, opts: confetti.Options) => {
    void confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  };
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1, { spread: 120, startVelocity: 45 });
};

const BASENAME_L2_RESOLVER_ADDRESS = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const L2_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const convertChainIdToCoinType = (chainId: number): string => {
  const coinType = (0x80000000 | chainId) >>> 0;
  return coinType.toString(16).toUpperCase();
};

const convertReverseNodeToBytes = (address: Address, chainId: number) => {
  const addressFormatted = address.toLowerCase().substring(2);
  const addressNode = keccak256(toHex(addressFormatted));
  const baseReverseNode = namehash(`${convertChainIdToCoinType(chainId)}.reverse`);
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]),
  );
};

const INK = "#1A1A1A";
const MUTED = "#75716A";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";
const GREEN = "#1E7B4F";
const GOLD = "#A4863D";
const FAINT = "#A8A39B";

const GNARS_IMG =
  "https://i2c.seadn.io/base/0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17/000d4dde43f1a377b3203d06a1a1ab/bf000d4dde43f1a377b3203d06a1a1ab.webp?w=1000";

const SERIF = { fontFamily: "var(--font-serif)" } as const;
const SANS = { fontFamily: "var(--font-sans)" } as const;
const smallCaps = {
  ...SANS,
  fontSize: "11px",
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MUTED,
} as const;

type PhaseInfo = {
  currentPhase: string;
  eid: bigint;
  elapsed: bigint;
  remaining: bigint;
};

export default function GnarsPage() {
  const config = useConfig();

  useEffect(() => {
    document.title = "Gnars · flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase";
  }, []);
  const { address, chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState(false);
  const [phaseInfo, setPhaseInfo] = useState<PhaseInfo | null>(null);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const [dailySigners, setDailySigners] = useState<number>(0);
  const [dailyVault, setDailyVault] = useState<string>("0");
  const [currentBid, setCurrentBid] = useState<string>("0");
  const [activeBidder, setActiveBidder] = useState<string>("");
  const [activeBidderName, setActiveBidderName] = useState<string>("");
  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [collectionSupply, setCollectionSupply] = useState<number | null>(null);
  const [nftImages, setNftImages] = useState<{ [key: string]: string }>({});
  const [nftApprovalStatus, setNftApprovalStatus] = useState<{ [key: string]: boolean }>({});
  const [nftSignedStatus, setNftSignedStatus] = useState<{ [key: string]: boolean }>({});
  const [nftClaimedStatus, setNftClaimedStatus] = useState<{ [key: string]: boolean }>({});
  const [nftBusy, setNftBusy] = useState<{ [key: string]: boolean }>({});
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [pendingSendTokenId, setPendingSendTokenId] = useState<bigint | null>(null);
  const [sendAddressInput, setSendAddressInput] = useState("");
  const [sendAddressError, setSendAddressError] = useState(false);
  const [expandedCards, setExpandedCards] = useState<{ [key: string]: boolean }>({});
  const [armedSell, setArmedSell] = useState<{ [key: string]: boolean }>({});
  const armedSellTimers = useRef<{ [key: string]: ReturnType<typeof setTimeout> }>({});
  const [ethPrice, setEthPrice] = useState<number | null>(null);
  const [yieldPerSigner, setYieldPerSigner] = useState<string>("0");
  const [chainMinBid, setChainMinBid] = useState<string>("0");
  const [chainNextMinBid, setChainNextMinBid] = useState<string>("0");
  const [sharePrompt, setSharePrompt] = useState<{
    type: "sign" | "claim" | "bid" | "sell";
    text: string;
  } | null>(null);
  // Token görselleri zincirde değişmediği için oturum boyunca cache'lenir
  const nftImageCache = useRef<{ [key: string]: string }>({});
  // fetchAllData turları üst üste binmesin — önceki tur bitmeden yenisi başlamaz
  const fetchInFlight = useRef(false);
  const [soundOn, setSoundOn] = useState(false);

  // Kaydedilmiş ses tercihini yükle — varsayılan kapalı, kullanıcı açtıysa hatırla
  useEffect(() => {
    try {
      if (localStorage.getItem("flooor-sound") === "on") {
        chimeMuted = false;
        setSoundOn(true);
      }
    } catch {
      // localStorage erişilemedi — varsayılan kapalı kalır
    }
  }, []);

  // Zil düğmesi: sesi aç/kapat. Açarken örneği hemen çalar — hem ses
  // kilidini garantili açar hem kullanıcı sistemin kurulduğunu duyar.
  const toggleSound = useCallback(() => {
    const next = chimeMuted; // kapalıysa açıyoruz
    chimeMuted = !next;
    setSoundOn(next);
    try {
      localStorage.setItem("flooor-sound", next ? "on" : "off");
    } catch {
      // tercih kaydedilemedi — oturum içinde yine geçerli
    }
    if (next) {
      // Gesture içindeyiz: elementi doğrudan çal (örnek + kilit tek adımda)
      const el = ensureChimeEl();
      if (el) {
        try {
          el.currentTime = 0;
          el.volume = 1;
          const p = el.play();
          if (p)
            p.then(() => {
              chimeElUnlocked = true;
            }).catch(() => {
              playViaWebAudio();
            });
        } catch {
          playViaWebAudio();
        }
      }
      const ctx = ensureAudioCtx();
      if (ctx) {
        if (ctx.state === "suspended") void ctx.resume().catch(() => {});
        void loadChimeBuffer(ctx);
      }
      toast.success("Bid sound on — you'll hear this chime on new bids.");
    } else {
      toast.info("Bid sound off.");
    }
  }, []);

  const fmtEth = useCallback((eth: string) => {
    const n = parseFloat(eth);
    if (!n || isNaN(n)) return "0";
    if (n >= 1) return n.toFixed(3);
    if (n >= 0.001) return n.toFixed(4);
    return n.toFixed(6);
  }, []);

  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      );
      const data = await res.json();
      setEthPrice(parseFloat(data.price));
    } catch {
      // sessizce geç, fiyat null kalır
    }
  }, []);

  useEffect(() => {
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchEthPrice]);

  const toUsd = useCallback(
    (eth: string) => {
      if (!ethPrice) return null;
      const val = parseFloat(eth) * ethPrice;
      if (isNaN(val) || val === 0) return null;
      return val < 0.01 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
    },
    [ethPrice],
  );

  const ensureBase = useCallback(async () => {
    if (connectedChain?.id !== base.id) {
      try {
        await switchChainAsync({ chainId: base.id });
      } catch (error) {
        console.error("Failed to switch network:", error);
        toast.error("Couldn't switch to Base — please switch manually in your wallet.");
        throw new Error("Please switch to Base network to continue");
      }
    }
  }, [connectedChain, switchChainAsync]);

  const getPhaseInfo = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const info = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "getPhaseInfo",
          args: [],
        })) as [string, bigint, bigint, bigint];
      })) as [string, bigint, bigint, bigint];
      const [currentPhase, eid, elapsed, remaining] = info;
      setPhaseInfo({ currentPhase, eid, elapsed, remaining });
      setRemainingTimeDisplay(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  const getDailySigners = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const currentEpochStart = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      })) as bigint;
      const signersCount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "partCount",
          args: [currentEpochStart],
        })) as bigint;
      })) as bigint;
      setDailySigners(Number(signersCount));
    } catch (error) {
      console.error("Error getting daily signers:", error);
    }
  }, [config]);

  const getDailyVault = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      // Claim fazında ilk claim, havuzu poolSnap[epoch]'a kilitleyip
      // poolAccrued'u sıfırlar. Vault olarak hep poolAccrued'u göstermek,
      // ilk claim'den sonra herkese 0 gösterir (ve paylaşım metnine $0
      // yazar). Doğrusu: snapshot alındıysa poolSnap, alınmadıysa poolAccrued.
      const [poolAccrued, epochStart] = (await Promise.all([
        retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: GNARS_ABI,
            functionName: "poolAccrued",
            args: [],
          })) as bigint;
        }),
        retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: GNARS_ABI,
            functionName: "currentEpochStart",
            args: [],
          })) as bigint;
        }),
      ])) as [bigint, bigint];
      const poolSnap = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "poolSnap",
          args: [epochStart],
        })) as bigint;
      })) as bigint;
      const effectivePool = poolSnap > BigInt(0) ? poolSnap : poolAccrued;
      setDailyVault(parseFloat(formatEther(effectivePool)).toFixed(8));
    } catch (error) {
      console.error("Error getting daily vault:", error);
    }
  }, [config]);

  const getChainMinBid = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const minBid = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "minbidAM",
          args: [],
        })) as bigint;
      })) as bigint;
      const nextMin = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "nextMinBid",
          args: [],
        })) as bigint;
      })) as bigint;
      setChainMinBid(formatEther(minBid));
      setChainNextMinBid(formatEther(nextMin));
    } catch (error) {
      console.error("Error getting chain min bid:", error);
    }
  }, [config]);

  const getCurrentBid = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const activeBidAmount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "activebidAM",
          args: [],
        })) as bigint;
      })) as bigint;
      setCurrentBid(parseFloat(formatEther(activeBidAmount)).toFixed(8));
    } catch (error) {
      console.error("Error getting current bid:", error);
    }
  }, [config]);

  const getActiveBidder = useCallback(async () => {
    if (!IS_DEPLOYED) return;
    try {
      const bidderAddress = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "activeBidder",
          args: [],
        })) as string;
      })) as string;
      setActiveBidder(bidderAddress);
      if (bidderAddress && bidderAddress !== ZERO_ADDRESS) {
        try {
          const baseName = (await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: BASENAME_L2_RESOLVER_ADDRESS,
              abi: L2_RESOLVER_ABI,
              functionName: "name",
              args: [convertReverseNodeToBytes(bidderAddress as Address, base.id)],
              chainId: base.id,
            })) as string;
          })) as string;
          setActiveBidderName(
            baseName && baseName !== ""
              ? baseName
              : `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
          );
        } catch {
          setActiveBidderName(
            `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
          );
        }
      } else {
        setActiveBidderName("");
      }
    } catch (error) {
      // Geçici RPC hatasında mevcut bidder bilgisini koru — sıfırlamak flicker yaratıyor
      console.error("Error getting active bidder:", error);
    }
  }, [config]);

  // Gnars koleksiyonu ERC721Enumerable değil (tokenOfOwnerByIndex yok —
  // bkz. supportsInterface(0x780e9d63) === false) ve tokenId'ler ardışık da
  // değil (1..totalSupply aralığının çok dışında ID'ler mevcut — bkz.
  // scanOwnedTokenIds.ts). Bu yüzden sahiplik Alchemy'nin transfer
  // indeksinden (alchemy_getAssetTransfers) tespit ediliyor.
  const getCollectionSupply = useCallback(async () => {
    if (!config) return;
    try {
      const supply = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "totalSupply",
          args: [],
        })) as bigint;
      })) as bigint;
      setCollectionSupply(Number(supply));
    } catch (error) {
      console.error("Error getting collection supply:", error);
    }
  }, [config]);

  const getUserNFTs = useCallback(async () => {
    if (!address || !config) {
      setUserNFTs((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    try {
      const ids = await scanOwnedTokenIds({
        config,
        collectionAddress: COLLECTION_ADDR,
        abi: NFT_ABI,
        owner: address,
        retryWithBackoff,
      });

      // Liste değişmediyse referansı koru — downstream effect zincirini tetiklemez
      setUserNFTs((prev) =>
        prev.length === ids.length && prev.every((v, i) => v === ids[i])
          ? prev
          : ids,
      );
    } catch (error) {
      // Geçici RPC hatasında mevcut listeyi koru; sıfırlamak grid'i boşaltıp flicker yaratıyor
      console.error("Error getting user NFTs:", error);
    }
  }, [address, config]);

  const decodeTokenImage = (tokenURI: string): string | null => {
    try {
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const jsonData = JSON.parse(atob(tokenURI.split(",")[1]));
        if (jsonData.image_data) {
          return `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
        }
        if (jsonData.image) return resolveUri(jsonData.image);
        return null;
      }
      return resolveUri(tokenURI);
    } catch {
      return null;
    }
  };

  const resolveUri = (uri: string): string => {
    if (uri.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${uri.replace("ipfs://", "")}`;
    }
    return uri;
  };

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) {
      setNftImages((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const images: { [key: string]: string } = {};
    for (const id of userNFTs) {
      const idStr = id.toString();
      // Görseller zincirde değişmez — daha önce çekildiyse tekrar RPC'ye gitme
      const cached = nftImageCache.current[idStr];
      if (cached) {
        images[idStr] = cached;
        continue;
      }
      try {
        const tokenURI = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: COLLECTION_ADDR,
            abi: NFT_ABI,
            functionName: "tokenURI",
            args: [id],
          })) as string;
        })) as string;
        if (tokenURI.startsWith("http") || tokenURI.startsWith("ipfs://")) {
          try {
            const res = await fetch(resolveUri(tokenURI));
            const meta = await res.json();
            if (meta.image) images[idStr] = resolveUri(meta.image);
          } catch {
            // metadata çekilemedi, görsel atlanır
          }
        } else {
          const image = decodeTokenImage(tokenURI);
          if (image) images[idStr] = image;
        }
        if (images[idStr]) nftImageCache.current[idStr] = images[idStr];
      } catch (error) {
        console.error(`Error getting image for token ${idStr}:`, error);
      }
    }
    // Yeni görselleri mevcutların üzerine ekle — hata alan token'ın eski görseli silinmesin
    setNftImages((prev) => ({ ...prev, ...images }));
  }, [userNFTs, config]);

  const checkApprovalStatus = useCallback(async () => {
    if (!address || userNFTs.length === 0) {
      setNftApprovalStatus({});
      return;
    }
    const approvalStatus: { [key: string]: boolean } = {};
    let isAllApproved = false;
    try {
      isAllApproved = (await retryWithBackoff(async () => {
        return await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
        });
      })) as boolean;
    } catch (error) {
      console.error("Error checking isApprovedForAll:", error);
    }
    if (isAllApproved) {
      for (const id of userNFTs) approvalStatus[id.toString()] = true;
    } else {
      for (const id of userNFTs) {
        const idStr = id.toString();
        try {
          const approvedAddress = (await retryWithBackoff(async () => {
            return await readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "getApproved",
              args: [id],
            });
          })) as string;
          approvalStatus[idStr] = approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase();
        } catch (error) {
          console.error(`Error checking approval for token ${idStr}:`, error);
          approvalStatus[idStr] = false;
        }
      }
    }
    setNftApprovalStatus(approvalStatus);
  }, [config, address, userNFTs]);

  const checkSignClaimStatus = useCallback(async () => {
    if (!IS_DEPLOYED || !userNFTs.length) {
      setNftSignedStatus({});
      setNftClaimedStatus({});
      return;
    }
    try {
      const currentEpochStart = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      })) as bigint;
      const signed: { [key: string]: boolean } = {};
      const claimed: { [key: string]: boolean } = {};
      for (const id of userNFTs) {
        const idStr = id.toString();
        signed[idStr] = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: GNARS_ABI,
            functionName: "isTokenSigned",
            args: [currentEpochStart, id],
          })) as boolean;
        })) as boolean;
        claimed[idStr] = (await retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: GNARS_ABI,
            functionName: "isTokenClaimed",
            args: [currentEpochStart, id],
          })) as boolean;
        })) as boolean;
      }
      setNftSignedStatus(signed);
      setNftClaimedStatus(claimed);
    } catch (error) {
      console.error("Error checking sign/claim status:", error);
    }
  }, [config, userNFTs]);

  useEffect(() => {
    const vaultAmount = parseFloat(dailyVault);
    if (dailySigners > 0 && vaultAmount > 0) {
      setYieldPerSigner((vaultAmount / dailySigners).toFixed(8));
    } else {
      setYieldPerSigner("0.00000000");
    }
  }, [dailyVault, dailySigners]);

  useEffect(() => {
    getUserNFTs();
  }, [getUserNFTs]);

  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);

  useEffect(() => {
    checkApprovalStatus();
    checkSignClaimStatus();
  }, [checkApprovalStatus, checkSignClaimStatus]);

  const fetchAllData = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    try {
      await Promise.allSettled([
        getPhaseInfo(),
        getDailySigners(),
        getDailyVault(),
        getCurrentBid(),
        getActiveBidder(),
        getUserNFTs(),
        getChainMinBid(),
      ]);
    } finally {
      fetchInFlight.current = false;
    }
  }, [getPhaseInfo, getDailySigners, getDailyVault, getCurrentBid, getActiveBidder, getUserNFTs, getChainMinBid]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Toplam arz zincirde neredeyse hiç değişmez — bir kez çekmek yeterli
  useEffect(() => {
    getCollectionSupply();
  }, [getCollectionSupply]);

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      setRemainingTimeDisplay((prev) => {
        if (prev <= 0) return 0;
        if (prev === 1) getPhaseInfo();
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdownInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kontrat event'lerini canlı izle — bid/satış/sign 2 dk'lık polling'i
  // beklemeden saniyeler içinde UI'a yansır. Mevcut RPC transport'u üzerinden
  // filtre polling'i kullanır; 15 sn aralık CU tüketimini düşük tutar.
  useEffect(() => {
    if (!IS_DEPLOYED) return;
    let cancelled = false;
    let lastBlock: bigint | null = null;
    let polling = false;
    const pollEvents = async () => {
      if (polling) return;
      polling = true;
      try {
        const client = getPublicClient(config);
        if (!client) return;
        const latest = await client.getBlockNumber();
        if (lastBlock === null) {
          // İlk tur: sadece başlangıç noktasını al, geçmişi tarama
          lastBlock = latest;
          return;
        }
        if (latest <= lastBlock) return;
        const logs = await client.getContractEvents({
          address: CONTRACT_ADDR,
          abi: GNARS_ABI as never,
          fromBlock: lastBlock + BigInt(1),
          toBlock: latest,
        });
        lastBlock = latest;
        if (cancelled) return;
        if (logs.length) {
          // Teşhis: konsolda event akışını görünür kıl
          console.log(
            "[flooor] events:",
            logs.map((l) => (l as { eventName?: string }).eventName).join(", "),
          );
        }
        // Batch'i önce bütün olarak değerlendir, sonra TEK tutarlı güncelleme
        // yap. Aynı aralıkta hem satış hem yeni bid varsa, event arg'larıyla
        // anlık patch + asenkron zincir okuması yarışıp fiyatı karıştırabilir.
        let sawSale = false;
        let sawStake = false;
        let sawClaim = false;
        let sawMinBidUpdate = false;
        let shouldChime = false;
        let lastBid: { bidder?: string; amount?: bigint } | null = null;
        for (const log of logs) {
          const { eventName, args } = log as unknown as {
            eventName: string;
            args: {
              bidder?: string;
              amount?: bigint;
              refunded?: string;
              refundAmount?: bigint;
            };
          };
          if (eventName === "BidPlaced") {
            lastBid = { bidder: args.bidder, amount: args.amount };
            // Kendi bid'imiz handleBid'de anında çalıyor — çift çalmasın.
            // (Bilinçli tercih: aynı cüzdan başka cihazda bağlıysa orada da
            // kendi bid'in için ses çalmaz.)
            if (
              !address ||
              !args.bidder ||
              args.bidder.toLowerCase() !== address.toLowerCase()
            ) {
              shouldChime = true;
            }
            if (
              address &&
              args.refunded &&
              args.refunded.toLowerCase() === address.toLowerCase()
            ) {
              toast.warning(
                typeof args.refundAmount === "bigint"
                  ? `You've been outbid — Ξ${fmtEth(formatEther(args.refundAmount))} returned to your wallet.`
                  : "You've been outbid — your ETH has been returned.",
                { duration: 8000 },
              );
            }
          } else if (eventName === "SaleSettled") {
            sawSale = true;
          } else if (eventName === "Staked") {
            sawStake = true;
          } else if (eventName === "Claimed") {
            sawClaim = true;
          } else if (eventName === "MinBidUpdated") {
            sawMinBidUpdate = true;
          }
        }
        if (sawSale) {
          // Satış bid'i sıfırlar — event arg'larıyla patch'lemek yerine
          // zincirin son halini tek otorite olarak oku (yeni bid geldiyse
          // onu da bu okuma getirir)
          getCurrentBid();
          getActiveBidder();
          getDailyVault();
          getUserNFTs();
          getChainMinBid();
        } else if (lastBid) {
          // Yalnızca bid varsa son bid'in arg'ları anında yansıtılabilir
          if (typeof lastBid.amount === "bigint") {
            setCurrentBid(parseFloat(formatEther(lastBid.amount)).toFixed(8));
          }
          if (lastBid.bidder) {
            setActiveBidder(lastBid.bidder);
            setActiveBidderName(
              `${lastBid.bidder.slice(0, 6)}...${lastBid.bidder.slice(-4)}`,
            );
          }
          getActiveBidder(); // basename çözümü için
          getChainMinBid(); // nextMinBid yeni bid'le değişir
        }
        if (sawStake) getDailySigners();
        if (sawClaim) getDailyVault();
        if (sawMinBidUpdate) getChainMinBid();
        if (shouldChime) playChime();
      } catch (error) {
        console.error("Event poll error:", error);
      } finally {
        polling = false;
      }
    };
    pollEvents();
    const intervalId = setInterval(pollEvents, 15_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    config,
    address,
    getActiveBidder,
    getCurrentBid,
    getDailyVault,
    getDailySigners,
    getUserNFTs,
    getChainMinBid,
    fmtEth,
  ]);

  // Kullanıcı etkileşimlerinde ses iznini aç — arka planda gelen bid
  // event'lerinin sesi tarayıcı autoplay engeline takılmasın. Kalıcı
  // dinleyici: ilk deneme başarısız olursa sonraki dokunuşta tekrar dener,
  // kilit açıldıktan sonra no-op.
  useEffect(() => {
    window.addEventListener("pointerdown", unlockChime);
    window.addEventListener("keydown", unlockChime);
    window.addEventListener("touchstart", unlockChime);
    // Cüzdan uygulamasından dönüşte bekleyen sesi çal
    document.addEventListener("visibilitychange", flushPendingChime);
    return () => {
      window.removeEventListener("pointerdown", unlockChime);
      window.removeEventListener("keydown", unlockChime);
      window.removeEventListener("touchstart", unlockChime);
      document.removeEventListener("visibilitychange", flushPendingChime);
    };
  }, []);

  const formatTimeRemaining = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }, []);

  const isSignPhase = phaseInfo?.currentPhase.toLowerCase().includes("sign") ?? false;

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value.replace(/,/g, ".").replace(/[^0-9.]/g, "");
      const firstDotIndex = nextValue.indexOf(".");
      if (firstDotIndex !== -1) {
        nextValue =
          nextValue.slice(0, firstDotIndex + 1) +
          nextValue.slice(firstDotIndex + 1).replace(/\./g, "");
      }
      if (nextValue.startsWith(".")) nextValue = `0${nextValue}`;
      setBidInput(nextValue);
      setBidError(false);
    },
    [],
  );

  const handleBid = useCallback(async () => {
    if (isBidding) return;
    if (!IS_DEPLOYED) {
      toast.info("Gnars contract is not live yet — stay tuned.");
      return;
    }
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    if (connectedChain?.id !== base.id) {
      toast.error("Please switch to Base network first.");
      return;
    }
    const trimmedInput = (bidInput || "").trim();
    const minRequired = parseFloat(chainNextMinBid) || 0;
    let effectiveBidInput = trimmedInput;
    if (!trimmedInput) {
      // No amount typed — auto-fill with the minimum required bid.
      effectiveBidInput = minRequired.toFixed(6);
      setBidInput(effectiveBidInput);
    } else if (parseFloat(trimmedInput) < minRequired) {
      setBidInput("");
      setBidError(true);
      return;
    }
    setIsBidding(true);
    try {
      await ensureBase();
      const value = parseEther(effectiveBidInput as `${string}`);
      const balance = await getBalance(config, { address });
      if (balance.value < value) {
        toast.error("Insufficient balance to place this bid.", {
          action: {
            label: "Check wallet",
            onClick: () =>
              window.open(`https://basescan.org/address/${address}`, "_blank"),
          },
          actionButtonStyle: {
            background: "#ec4899",
            color: "#fff",
          },
        });
        return;
      }
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: GNARS_ABI,
        functionName: "placeBid",
        args: [],
        value,
        dataSuffix: DATA_SUFFIX,
      });
      toast.success("Bid placed successfully!");
      playChime();
      fireConfetti();
      setSharePrompt({
        type: "bid",
        text: `Just placed a bid of Ξ${fmtEth(effectiveBidInput)} on a Gnar at flooor.fun 🔨\n\nIf someone outbids me, my ETH comes right back — no risk, no lockup.\n\nRoyalties to the community.`,
      });
      setBidInput("");
      setTimeout(() => {
        getCurrentBid();
        getActiveBidder();
        getChainMinBid();
      }, 2000);
    } catch (error) {
      if (isUserRejectedError(error)) {
        toast.info("Transaction cancelled.");
        return;
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleBid() },
      });
    } finally {
      setIsBidding(false);
    }
  }, [config, ensureBase, bidInput, address, connectedChain, getCurrentBid, getActiveBidder, getChainMinBid, chainNextMinBid, fmtEth, isBidding]);

  const handleSignOrClaim = useCallback(
    async (tokenId: bigint) => {
      if (!IS_DEPLOYED) {
        toast.info("Gnars contract is not live yet — stay tuned.");
        return;
      }
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const idStr = tokenId.toString();
      setNftBusy((prev) => ({ ...prev, [idStr]: true }));
      try {
        await ensureBase();
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "signOrClaim",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(isSignPhase ? `Token #${idStr} signed!` : `Token #${idStr} claimed!`);
        playChime();
        fireConfetti();
        if (isSignPhase) {
          setNftSignedStatus((prev) => ({ ...prev, [idStr]: true }));
          setSharePrompt({
            type: "sign",
            text: `Just signed my Gnar on flooor.fun 🖊️\n\n${dailySigners + 1} signers sharing today's vault of Ξ${fmtEth(dailyVault)}.\n\nSign daily, earn daily. Royalties to the community.`,
          });
        } else {
          setNftClaimedStatus((prev) => ({ ...prev, [idStr]: true }));
          const claimedUsd = toUsd(yieldPerSigner);
          setSharePrompt({
            type: "claim",
            text: `Claimed Ξ${fmtEth(yieldPerSigner)}${claimedUsd ? ` (${claimedUsd})` : ""} from today's vault on flooor.fun 💰\n\nMy Gnar earns yield every single day — no lockup, no transfer.`,
          });
        }
        setTimeout(() => {
          checkSignClaimStatus();
          getPhaseInfo();
          getDailyVault();
        }, 2000);
      } catch (error) {
        if (isUserRejectedError(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Sign/Claim failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSignOrClaim(tokenId) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [idStr]: false }));
      }
    },
    [config, ensureBase, address, isSignPhase, checkSignClaimStatus, getPhaseInfo, getDailyVault, dailySigners, dailyVault, yieldPerSigner, fmtEth, toUsd],
  );

  const handleShare = useCallback(
    async (platform: "x" | "farcaster") => {
      if (!sharePrompt) return;
      // Mention biçimleri platforma göre farklı: Farcaster'da @farcaster
      // hesabı + /flooor kanalı (ayrı token'lar), X'te flooor/Base
      // handle'larına ek olarak Gnars'ın kendi hesabı da etiketleniyor
      const mentions =
        platform === "farcaster"
          ? "@farcaster /flooor"
          : "@vrnouns @base @baseapp @gnars_dao";
      const text = `${sharePrompt.text}\n\n${mentions}`;
      const url = "https://flooor.fun/gnars";
      setSharePrompt(null);
      if (platform === "farcaster") {
        // Mini app içinde native compose, web'de intent URL
        try {
          if (await sdk.isInMiniApp()) {
            await sdk.actions.composeCast({ text, embeds: [url] });
            return;
          }
        } catch {
          // fall through to web intent
        }
        window.open(
          `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`,
          "_blank",
        );
      } else {
        window.open(
          `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
          "_blank",
        );
      }
    },
    [sharePrompt],
  );

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!IS_DEPLOYED) {
        toast.info("Gnars contract is not live yet — stay tuned.");
        return;
      }
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const idStr = tokenId.toString();
      try {
        await ensureBase();
        if (parseFloat(currentBid) < parseFloat(chainMinBid)) {
          toast.error(`Current bid (${currentBid} ETH) is below minimum selling price of ${fmtEth(chainMinBid)} ETH.`);
          return;
        }
        setNftBusy((prev) => ({ ...prev, [idStr]: true }));
        const isApproved = nftApprovalStatus[idStr] === true;
        if (!isApproved) {
          toast.info(`Approving token #${idStr}...`);
          await retryWithBackoff(async () => {
            return await writeContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "setApprovalForAll",
              args: [CONTRACT_ADDR, true],
              dataSuffix: DATA_SUFFIX,
            });
          }, 5, 2000);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          await checkApprovalStatus();
        }
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: GNARS_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Token #${idStr} sold successfully!`);
        fireConfetti();
        const soldUsd = toUsd(currentBid);
        setSharePrompt({
          type: "sell",
          text: `Just sold my Gnar for Ξ${fmtEth(currentBid)}${soldUsd ? ` (${soldUsd})` : ""} on flooor.fun 🤝\n\nInstant liquidity, any time. Every sale feeds the vault — distributed to holders daily.`,
        });
        setTimeout(() => {
          getCurrentBid();
          getActiveBidder();
          getDailyVault();
          getUserNFTs();
        }, 2000);
      } catch (error) {
        if (isUserRejectedError(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Sell failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [idStr]: false }));
      }
    },
    [config, ensureBase, address, nftApprovalStatus, checkApprovalStatus, currentBid, getCurrentBid, getActiveBidder, getDailyVault, getUserNFTs, chainMinBid, fmtEth, toUsd],
  );

  // Sell button uses a two-tap "arm/confirm" gesture — first tap arms it
  // (auto-disarms after 5s), second tap while armed triggers the sale.
  const armSell = useCallback(
    (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      if (parseFloat(currentBid) < parseFloat(chainMinBid)) {
        toast.error(`Current bid (${currentBid} ETH) is below minimum selling price of ${fmtEth(chainMinBid)} ETH.`);
        return;
      }
      const tokenIdStr = tokenId.toString();
      setArmedSell((prev) => ({ ...prev, [tokenIdStr]: true }));
      clearTimeout(armedSellTimers.current[tokenIdStr]);
      armedSellTimers.current[tokenIdStr] = setTimeout(() => {
        setArmedSell((prev) => ({ ...prev, [tokenIdStr]: false }));
      }, 5000);
    },
    [address, currentBid, chainMinBid, fmtEth],
  );

  const confirmSellNFT = useCallback(
    (tokenId: bigint) => {
      const tokenIdStr = tokenId.toString();
      clearTimeout(armedSellTimers.current[tokenIdStr]);
      setArmedSell((prev) => ({ ...prev, [tokenIdStr]: false }));
      handleSellNFT(tokenId);
    },
    [handleSellNFT],
  );

  const handleSellButtonClick = useCallback(
    (tokenId: bigint) => {
      const tokenIdStr = tokenId.toString();
      if (armedSell[tokenIdStr]) {
        confirmSellNFT(tokenId);
      } else {
        armSell(tokenId);
      }
    },
    [armedSell, armSell, confirmSellNFT],
  );

  const toggleCardExpanded = useCallback((tokenId: bigint) => {
    const tokenIdStr = tokenId.toString();
    setExpandedCards((prev) => ({ ...prev, [tokenIdStr]: !prev[tokenIdStr] }));
  }, []);

  const handleSendNFT = useCallback(
    async (tokenId: bigint, to: Address) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const idStr = tokenId.toString();
      setNftBusy((prev) => ({ ...prev, [idStr]: true }));
      try {
        await ensureBase();
        await writeContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "transferFrom",
          args: [address, to, tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Token #${idStr} sent successfully!`);
        setTimeout(() => {
          getUserNFTs();
        }, 2000);
      } catch (error) {
        if (isUserRejectedError(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        toast.error(`Send failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSendNFT(tokenId, to) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [idStr]: false }));
      }
    },
    [config, ensureBase, address, getUserNFTs],
  );

  const requestSendNFT = useCallback(
    (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      setSendAddressInput("");
      setSendAddressError(false);
      setPendingSendTokenId(tokenId);
    },
    [address],
  );

  const confirmSendNFT = useCallback(() => {
    const tokenId = pendingSendTokenId;
    const to = sendAddressInput.trim();
    if (!isAddress(to)) {
      setSendAddressError(true);
      return;
    }
    setPendingSendTokenId(null);
    if (tokenId !== null) handleSendNFT(tokenId, to as Address);
  }, [pendingSendTokenId, sendAddressInput, handleSendNFT]);

  const hasBid = activeBidder && activeBidder !== ZERO_ADDRESS && parseFloat(currentBid) > 0;
  const minOutbidAmount = parseFloat(chainNextMinBid) || 0;

  // Yıllık projeksiyon: günlük yield × 365. APR, giriş maliyeti olarak
  // zincirdeki bir sonraki minimum bid'i (şu anki alım fiyatı) baz alır.
  // Aktif bid yokken nextMinBid ~sıfır olduğundan (minbidAM = 10^8 wei)
  // anlamsız devasa APR üretmemek için makul bir taban şartı aranır.
  const annualYieldEth = (parseFloat(yieldPerSigner) || 0) * 365;
  const projectedApr =
    annualYieldEth > 0 && minOutbidAmount >= 0.000001
      ? (annualYieldEth / minOutbidAmount) * 100
      : 0;

  // Market cap = koleksiyondaki toplam adet × taban fiyat (min bid)
  const marketCapEth =
    collectionSupply !== null ? collectionSupply * (parseFloat(chainMinBid) || 0) : null;
  const marketCapUsd =
    marketCapEth !== null && ethPrice ? marketCapEth * ethPrice : null;
  const marketCapDisplay =
    marketCapUsd !== null ? `$${formatCompactUsd(marketCapUsd)}` : "—";
  const marketCapEthDisplay =
    marketCapEth !== null ? `Ξ${fmtEth(marketCapEth.toString())}` : "—";

  return (
    <div
      className={`${playfair.variable} ${inter.variable}`}
      style={{ backgroundColor: IVORY, minHeight: "100vh", color: INK }}
    >
      {/* Header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backgroundColor: "rgba(247,245,241,0.92)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <Link
            href="/"
            style={{ ...SERIF, fontWeight: 500, fontSize: "26px", letterSpacing: "0.02em", color: INK }}
          >
            Flooor
          </Link>
          <nav className="hidden md:flex items-center gap-10">
            <a
              href="https://vrnouns.gitbook.io/flooor/documentation/documentation-en"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Docs
            </a>
            <a
              href="https://snapshot.org/#/s:vrnouns.eth"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              DAO
            </a>
            <a
              href="https://opensea.io/assets/base/0x880Fb3Cf5c6Cc2d7DFC13a993E839a9411200C17"
              target="_blank"
              rel="noopener noreferrer"
              style={smallCaps}
              className="hover:text-black transition-colors"
            >
              Collection
            </a>
          </nav>
          <div className="flex items-center gap-3">
          <button
            onClick={toggleSound}
            type="button"
            title={soundOn ? "Bid sound on — click to mute" : "Bid sound off — click to enable"}
            aria-label={soundOn ? "Mute bid sound" : "Enable bid sound"}
            className="p-3 transition-colors hover:text-black"
            style={{
              color: soundOn ? INK : MUTED,
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: "transparent",
            }}
          >
            {soundOn ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 01-3.4 0" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13.7 21a2 2 0 01-3.4 0" />
                <path d="M18.6 13A17.9 17.9 0 0118 8a6 6 0 00-9.3-5" />
                <path d="M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const ready = mounted;
              const connected = ready && account && chain;
              return (
                <div
                  {...(!ready && {
                    "aria-hidden": true,
                    style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
                  })}
                >
                  {!connected ? (
                    <button
                      onClick={openConnectModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: INK,
                        color: IVORY,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Connect
                    </button>
                  ) : chain.unsupported ? (
                    <button
                      onClick={openChainModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "#9B1C1C",
                        color: "#fff",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Wrong Network
                    </button>
                  ) : (
                    <button
                      onClick={openAccountModal}
                      style={{
                        ...SANS,
                        fontSize: "11px",
                        fontWeight: 500,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        padding: "10px 20px",
                        backgroundColor: "transparent",
                        color: INK,
                        border: `1px solid ${HAIRLINE}`,
                        cursor: "pointer",
                      }}
                    >
                      {account.displayName}
                    </button>
                  )}
                </div>
              );
            }}
          </ConnectButton.Custom>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 sm:px-8">
        {/* Lot hero */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 pt-12 lg:pt-16 items-start">
          {/* Artwork */}
          <div className="lg:sticky lg:top-28">
            <div className="flex items-center justify-center py-4">
              {/* Lot plate — matches the "Your Collection" card design below */}
              <article
                className="w-full max-w-[420px] fade-in-soft"
                style={{ border: `1px solid ${HAIRLINE}`, backgroundColor: "#fff" }}
              >
                {/* Lot line */}
                <div
                  className="flex items-center justify-between px-3.5 py-2.5"
                  style={{ borderBottom: `1px solid ${HAIRLINE}` }}
                >
                  <span className="flex items-center gap-1.5">
                    <svg width="15" height="15" viewBox="0 0 22 22" aria-hidden="true">
                      <path
                        fill={GOLD}
                        d="M11 0l2.2 1.6 2.6-.7 1.4 2.3 2.6.7.1 2.7 2.1 1.6-1.2 2.4 1.2 2.4-2.1 1.6-.1 2.7-2.6.7-1.4 2.3-2.6-.7L11 22l-2.2-1.6-2.6.7-1.4-2.3-2.6-.7-.1-2.7L0 13.8l1.2-2.4L0 9l2.1-1.6.1-2.7 2.6-.7L6.2.9 8.8 1.6 11 0z"
                      />
                      <path fill="#fff" d="M9.6 14.9L6.3 11.6l1.1-1.1 2.2 2.2 5-5 1.1 1.1z" />
                    </svg>
                    <span style={{ ...SERIF, fontWeight: 500, fontSize: 19, color: INK }}>
                      Gnars
                    </span>
                  </span>
                  <span style={{ ...smallCaps, fontSize: 9 }}>
                    {collectionSupply !== null ? `${collectionSupply.toLocaleString()} Editions` : "—"}
                  </span>
                </div>

                {/* Art plate */}
                <div
                  className="p-4"
                  style={{ backgroundColor: IVORY, borderBottom: `1px solid ${HAIRLINE}` }}
                >
                  <HoloFrame
                    className="w-full"
                    overlay={
                      <div
                        style={{
                          position: "absolute",
                          left: 10,
                          right: 10,
                          bottom: 10,
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <span
                          style={{
                            ...smallCaps,
                            color: "#fff",
                            fontSize: 9,
                            padding: "4px 9px",
                            backgroundColor: "rgba(5,12,28,0.42)",
                            backdropFilter: "blur(6px)",
                            border: "1px solid rgba(255,255,255,0.22)",
                          }}
                        >
                          Market Cap {marketCapDisplay} · {marketCapEthDisplay}
                        </span>
                      </div>
                    }
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={GNARS_IMG}
                      alt="Gnars"
                      className="w-full h-auto"
                    />
                  </HoloFrame>
                </div>

                {/* Meta strip */}
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <span style={{ ...smallCaps, fontSize: 9 }}>No. 001 · Base</span>
                  <a
                    href="https://opensea.io/assets/base/0x880Fb3Cf5c6Cc2d7DFC13a993E839a9411200C17"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...smallCaps, fontSize: 9 }}
                    className="hover:text-black transition-colors"
                  >
                    View Collection
                  </a>
                </div>
              </article>
            </div>
          </div>

          {/* Lot details */}
          <div>
            <p style={{ ...smallCaps, color: GOLD }}>
              {IS_DEPLOYED && <span className="live-dot mr-2" aria-hidden />}
              {!IS_DEPLOYED
                ? "Coming Soon"
                : `${isSignPhase ? "Live on Base — Sign Phase" : "Live on Base — Claim Phase"} · Epoch ${phaseInfo ? phaseInfo.eid.toString() : "—"}`}
            </p>
            {!IS_DEPLOYED ? (
              <div
                className="mt-6 px-8 py-6"
                style={{ backgroundColor: PLINTH, border: `1px solid ${HAIRLINE}` }}
              >
                <p style={{ ...smallCaps, marginBottom: "8px" }}>Royalties to the community</p>
                <p style={{ ...SANS, fontSize: "14px", color: MUTED, lineHeight: 1.6 }}>
                  The Gnars contract is being finalized and isn&apos;t live yet. Connect your wallet to be ready when it ships.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                  <div>
                    <p style={smallCaps}>Current Bid</p>
                    <p
                      className="mt-2 tabular-nums"
                      style={{
                        ...SERIF,
                        fontWeight: 500,
                        fontSize: "clamp(28px, 3.4vw, 44px)",
                        lineHeight: 1.1,
                      }}
                    >
                      Ξ {fmtEth(currentBid)}
                    </p>
                    <p className="mt-1.5 text-sm" style={{ color: MUTED }}>
                      {hasBid ? (
                        <>
                          {toUsd(currentBid) ? `${toUsd(currentBid)} · ` : ""}
                          <a
                            href={`https://basescan.org/address/${activeBidder}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-black transition-colors underline underline-offset-4"
                            style={{ textDecorationColor: HAIRLINE }}
                          >
                            {activeBidderName ||
                              `${activeBidder.slice(0, 6)}…${activeBidder.slice(-4)}`}
                          </a>
                        </>
                      ) : (
                        "No bids yet — place the first."
                      )}
                    </p>
                  </div>
                  <div>
                    <p style={smallCaps}>
                      {isSignPhase ? "Sign Closes In" : "Claim Closes In"}
                    </p>
                    <p
                      className="mt-2 tabular-nums"
                      style={{
                        ...SERIF,
                        fontWeight: 500,
                        fontSize: "clamp(28px, 3.4vw, 44px)",
                        lineHeight: 1.1,
                      }}
                    >
                      {formatTimeRemaining(remainingTimeDisplay)}
                    </p>
                  </div>
                </div>

                {/* Bid box */}
                <div
                  className={hasBid ? "mt-3 flex items-stretch" : "mt-8 flex items-stretch"}
                  style={{ border: `1px solid ${bidError ? "#9B1C1C" : INK}` }}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={
                      bidError
                        ? `Minimum Ξ ${minOutbidAmount.toFixed(6)}`
                        : `Ξ ${minOutbidAmount.toFixed(6)} or more`
                    }
                    className="flex-1 px-4 py-3.5 focus:outline-none min-w-0 text-lg tabular-nums"
                    style={{ ...SANS, color: INK, backgroundColor: "#fff", border: "none" }}
                    value={bidInput}
                    onChange={handleBidInputChange}
                  />
                  <button
                    onClick={handleBid}
                    disabled={isBidding}
                    className="px-5 sm:px-10 whitespace-nowrap transition-opacity hover:opacity-80 disabled:hover:opacity-100"
                    style={{
                      ...smallCaps,
                      color: "#fff",
                      backgroundColor: INK,
                      opacity: isBidding ? 0.6 : 1,
                      cursor: isBidding ? "not-allowed" : "pointer",
                    }}
                  >
                    {isBidding ? "Placing…" : "Place Bid"}
                  </button>
                </div>
                <p className="mt-3 text-xs" style={{ color: FAINT }}>
                  {hasBid ? (
                    <>
                      Minimum outbid Ξ{" "}
                      <button
                        type="button"
                        onClick={() => setBidInput(minOutbidAmount.toFixed(6))}
                        className="underline decoration-dotted underline-offset-2 hover:brightness-110 transition-[filter]"
                        style={{ color: GOLD, fontWeight: 600 }}
                      >
                        {minOutbidAmount.toFixed(6)}
                      </button>{" "}
                      — if someone outbids you, your ETH is returned
                      automatically.
                    </>
                  ) : (
                    <>
                      Minimum bid Ξ{" "}
                      <button
                        type="button"
                        onClick={() => setBidInput(minOutbidAmount.toFixed(6))}
                        className="underline decoration-dotted underline-offset-2 hover:brightness-110 transition-[filter]"
                        style={{ color: GOLD, fontWeight: 600 }}
                      >
                        {minOutbidAmount.toFixed(6)}
                      </button>{" "}
                      — if someone outbids you, your ETH is returned
                      automatically. Every sale feeds the vault.
                    </>
                  )}
                </p>

                {/* Signers, vault, yield, epoch */}
                <div className="mt-10">
                  {[
                    { label: "Signers", value: `${dailySigners}`, sub: "this epoch", green: false, rainbow: false },
                    { label: "Vault", value: `Ξ ${fmtEth(dailyVault)}`, sub: toUsd(dailyVault), green: false, rainbow: false },
                    { label: "Yield per Signer", value: `Ξ ${fmtEth(yieldPerSigner)}`, sub: toUsd(yieldPerSigner), green: true, rainbow: false },
                    {
                      label: "Projected APR",
                      value:
                        projectedApr > 0
                          ? `${projectedApr >= 10 ? projectedApr.toFixed(0) : projectedApr.toFixed(1)}%${
                              toUsd(String(annualYieldEth))
                                ? ` ~ ${toUsd(String(annualYieldEth))}`
                                : ""
                            }`
                          : "—",
                      sub: null,
                      green: false,
                      rainbow: true,
                    },
                    { label: "Epoch", value: phaseInfo ? phaseInfo.eid.toString() : "—", sub: "24-hour cycle", green: false, rainbow: false },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between py-3.5"
                      style={{ borderTop: `1px solid ${HAIRLINE}` }}
                    >
                      <span style={smallCaps}>{row.label}</span>
                      <span
                        className="tabular-nums text-base"
                        style={{ ...SANS, fontWeight: 500, color: row.green ? GREEN : INK }}
                      >
                        {/* Tayf yalnızca değerin kendisine uygulanır; alt bilgi soluk kalır */}
                        {row.rainbow ? (
                          <span className="apr-rainbow">{row.value}</span>
                        ) : (
                          row.value
                        )}
                        {row.sub ? (
                          <span style={{ color: FAINT, fontWeight: 400 }}> · {row.sub}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                  <div className="pt-3.5 text-right">
                    <button
                      onClick={fetchAllData}
                      className="text-xs hover:text-black transition-colors"
                      style={{ ...smallCaps, color: MUTED }}
                    >
                      Refresh Data
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {IS_DEPLOYED && (
          <div className="mt-20 w-full" style={{ maxWidth: "1100px" }}>
            <div className="flex items-baseline justify-between gap-4">
              <p style={smallCaps}>Your Collection</p>
              <button
                onClick={fetchAllData}
                className="text-xs hover:text-black transition-colors shrink-0"
                style={{ ...smallCaps, color: MUTED }}
              >
                Refresh Data
              </button>
            </div>
            <h2
              className="mt-3"
              style={{ ...SERIF, fontWeight: 500, fontSize: "clamp(26px, 3vw, 36px)" }}
            >
              Works in your wallet
            </h2>
            <p className="mt-2 text-sm" style={{ color: MUTED }}>
              Sign daily from each card below, or tap More to send or sell.
            </p>

            {!address ? (
              <div className="mt-8 py-14 text-center" style={{ border: `1px solid ${HAIRLINE}` }}>
                <p style={{ ...SERIF, fontStyle: "italic", color: MUTED }} className="text-lg">
                  Connect your wallet to view your collection.
                </p>
              </div>
            ) : userNFTs.length === 0 ? (
              <div className="mt-8 py-14 text-center" style={{ border: `1px solid ${HAIRLINE}` }}>
                <p style={{ ...SERIF, fontStyle: "italic", color: MUTED }} className="text-lg">
                  No works in your collection — acquire today&apos;s lot above.
                </p>
              </div>
            ) : (
              <div className="mt-8 works-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {userNFTs.map((tokenId) => {
                  const idStr = tokenId.toString();
                  const signed = nftSignedStatus[idStr] === true;
                  const claimed = nftClaimedStatus[idStr] === true;
                  const busy = nftBusy[idStr] === true;
                  const image = nftImages[idStr];
                  const approved = nftApprovalStatus[idStr] === true;
                  const isExpanded = expandedCards[idStr] === true;
                  const isArmed = armedSell[idStr] === true;
                  const signClaimLabel = isSignPhase
                    ? signed ? "Signed" : "Sign In"
                    : signed && !claimed ? "Claim" : claimed ? "Claimed" : "Wait for Sign";
                  const signClaimDisabled =
                    busy || (isSignPhase ? signed : !signed || claimed);
                  const isClaimReady = !isSignPhase && signed && !claimed;
                  return (
                    <WorkCard
                      key={idStr}
                      tokenIdStr={idStr}
                      itemName="Gnar"
                      image={image}
                      approved={approved}
                      primaryLabel={busy ? "..." : signClaimLabel}
                      primaryDisabled={signClaimDisabled}
                      primaryTone={isClaimReady ? "ready" : "default"}
                      onPrimaryClick={() => handleSignOrClaim(tokenId)}
                      isExpanded={isExpanded}
                      onToggleExpand={() => toggleCardExpanded(tokenId)}
                      busy={busy}
                      onSend={() => requestSendNFT(tokenId)}
                      hasBid={!!hasBid}
                      isArmed={isArmed}
                      currentBidDisplay={fmtEth(currentBid)}
                      onSellClick={() => handleSellButtonClick(tokenId)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>


      {/* Send confirmation modal */}
      {pendingSendTokenId !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(26,26,26,0.5)" }}
        >
          <div className="w-full" style={{ maxWidth: "360px", backgroundColor: IVORY, border: `1px solid ${HAIRLINE}` }}>
            <div className="px-6 py-6">
              <p style={{ ...SERIF, fontSize: "20px", marginBottom: "12px" }}>
                Send #{pendingSendTokenId.toString()}?
              </p>
              <p style={{ ...SANS, fontSize: "13px", color: MUTED, lineHeight: 1.6, marginBottom: "16px" }}>
                Enter the recipient&apos;s wallet address. This transfers the token directly — there is no way to undo it.
              </p>
              <input
                type="text"
                placeholder="0x..."
                value={sendAddressInput}
                onChange={(e) => {
                  setSendAddressInput(e.target.value);
                  setSendAddressError(false);
                }}
                style={{
                  ...SANS,
                  fontSize: "13px",
                  padding: "10px 12px",
                  border: `1px solid ${sendAddressError ? "#9B1C1C" : HAIRLINE}`,
                  backgroundColor: "#fff",
                  width: "100%",
                  outline: "none",
                }}
              />
              {sendAddressError && (
                <p style={{ ...SANS, fontSize: "12px", color: "#9B1C1C", marginTop: "6px" }}>
                  Enter a valid wallet address.
                </p>
              )}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setPendingSendTokenId(null)}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: "transparent",
                    color: INK,
                    border: `1px solid ${HAIRLINE}`,
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSendNFT}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: INK,
                    color: IVORY,
                    border: "none",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Confirm Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share prompt modal — sign/claim sonrası */}
      {sharePrompt !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(26,26,26,0.5)" }}
        >
          <div className="w-full" style={{ maxWidth: "400px", backgroundColor: IVORY, border: `1px solid ${HAIRLINE}` }}>
            <div className="px-6 py-6">
              <p style={{ ...SERIF, fontSize: "20px", marginBottom: "12px" }}>
                {sharePrompt.type === "sign"
                  ? "Signed — spread the word?"
                  : sharePrompt.type === "claim"
                    ? "Claimed — spread the word?"
                    : sharePrompt.type === "bid"
                      ? "Bid placed — spread the word?"
                      : "Sold — spread the word?"}
              </p>
              <p
                style={{
                  ...SANS,
                  fontSize: "13px",
                  color: MUTED,
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                  padding: "12px",
                  backgroundColor: "#fff",
                  border: `1px solid ${HAIRLINE}`,
                }}
              >
                {sharePrompt.text}
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => handleShare("farcaster")}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: INK,
                    color: IVORY,
                    border: "none",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Farcaster
                </button>
                <button
                  onClick={() => handleShare("x")}
                  style={{
                    ...SANS,
                    fontSize: "12px",
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    padding: "10px 16px",
                    backgroundColor: INK,
                    color: IVORY,
                    border: "none",
                    cursor: "pointer",
                    flex: 1,
                  }}
                >
                  Share on X
                </button>
              </div>
              <button
                onClick={() => setSharePrompt(null)}
                className="mt-3 w-full"
                style={{
                  ...SANS,
                  fontSize: "12px",
                  fontWeight: 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "10px 16px",
                  backgroundColor: "transparent",
                  color: MUTED,
                  border: `1px solid ${HAIRLINE}`,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer contractAddr={CONTRACT_ADDR} />
    </div>
  );
}
