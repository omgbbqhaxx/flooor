"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { toast } from "sonner";

import { useState, useCallback, useEffect, useRef } from "react";
import { useConfig, useAccount, useSwitchChain } from "wagmi";
import {
  writeContract,
  readContract,
  simulateContract,
  getBalance,
  getPublicClient,
} from "wagmi/actions";
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
import Image from "next/image";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import WorkCard from "@/app/components/WorkCard";
import { Playfair_Display, Inter } from "next/font/google";
import confetti from "canvas-confetti";
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
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
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

import MARKET_ABI from "@/app/abi/market.json";
import NFT_ABI from "@/app/abi/nft.json";
import { MINIMUM_BID_FOR_SELL } from "@/app/lib/minBid";

const CONTRACT_ADDR = "0xF6B2C2411a101Db46c8513dDAef10b11184c58fF" as const;
const COLLECTION_ADDR = "0xbB56a9359DF63014B3347585565d6F80Ac6305fd" as const;

// --- Bildirim sesi: hibrit (HTMLAudio + Web Audio) ---
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

// Basename çözümleme — L1 üzerinden CCIP-Read yerine, veri zaten Base'de yaşadığı için
// Base'in resmi L2Resolver kontratından doğrudan okuyoruz (bkz. github.com/base/basenames)
const BASENAME_L2_RESOLVER_ADDRESS =
  "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const L2_RESOLVER_ABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ENSIP-11: L2 coinType = 0x80000000 | chainId
const convertChainIdToCoinType = (chainId: number): string => {
  const coinType = (0x80000000 | chainId) >>> 0;
  return coinType.toString(16).toUpperCase();
};

// ENSIP-19 reverse node — adresin Base üzerindeki reverse kaydının node hash'i
const convertReverseNodeToBytes = (address: Address, chainId: number) => {
  const addressFormatted = address.toLowerCase().substring(2);
  const addressNode = keccak256(toHex(addressFormatted));
  const baseReverseNode = namehash(
    `${convertChainIdToCoinType(chainId)}.reverse`,
  );
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode]),
  );
};

// Sotheby's-inspired palette — restrained, gallery-like
const INK = "#1A1A1A";
const MUTED = "#75716A";
const FAINT = "#A8A39B";
const HAIRLINE = "#E6E2DA";
const IVORY = "#F7F5F1";
const PLINTH = "#F1EEE8";
const GREEN = "#1E7B4F";
const GOLD = "#A4863D";
const RED = "#9A2D2D";

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

export default function BetaPage() {
  const [bidInput, setBidInput] = useState("");
  const [bidError, setBidError] = useState(false);
  const [isCheckingApproval, setIsCheckingApproval] = useState(false);
  const [nftApprovalStatus, setNftApprovalStatus] = useState<{
    [key: string]: boolean;
  }>({});
  const [nftLoadingStatus, setNftLoadingStatus] = useState<{
    [key: string]: boolean;
  }>({});
  const [phaseInfo, setPhaseInfo] = useState<{
    currentPhase: string;
    eid: bigint;
    elapsed: bigint;
    remaining: bigint;
  } | null>(null);
  const [dailySigners, setDailySigners] = useState<number>(0);
  const [dailyVault, setDailyVault] = useState<string>("0");
  const [currentBid, setCurrentBid] = useState<string>("0");
  const [activeBidder, setActiveBidder] = useState<string>("");
  const [activeBidderName, setActiveBidderName] = useState<string>("");
  const [yieldPerNFT, setYieldPerNFT] = useState<string>("0");
  const [userHasSigned, setUserHasSigned] = useState<boolean>(false);
  const [userHasClaimed, setUserHasClaimed] = useState<boolean>(false);
  const [ownedTokenId, setOwnedTokenId] = useState<bigint | null>(null);
  const [userNFTs, setUserNFTs] = useState<bigint[]>([]);
  const [nftImages, setNftImages] = useState<{ [key: string]: string }>({});
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Token görselleri zincirde değişmediği için oturum boyunca cache'lenir
  const nftImageCache = useRef<{ [key: string]: string }>({});
  // fetchAllData turları üst üste binmesin — önceki tur bitmeden yenisi başlamaz
  const fetchInFlight = useRef(false);
  const [remainingTimeDisplay, setRemainingTimeDisplay] = useState<number>(0);
  const [pendingSendTokenId, setPendingSendTokenId] = useState<bigint | null>(
    null,
  );
  // "MORE" ile açılan Send/Sell satırı — kart başına ayrı durum
  const [expandedCards, setExpandedCards] = useState<{
    [key: string]: boolean;
  }>({});
  // Sell iki dokunuşlu: ilk tık silahlandırır (kırmızı + "CONFIRM"), ikinci
  // tık satışı yapar. 5sn içinde ikinci tık gelmezse otomatik geri alınır.
  const [armedSell, setArmedSell] = useState<{ [key: string]: boolean }>({});
  const armedSellTimers = useRef<{
    [key: string]: ReturnType<typeof setTimeout>;
  }>({});
  const [sendAddressInput, setSendAddressInput] = useState("");
  const [sendAddressError, setSendAddressError] = useState(false);
  const [nftBusy, setNftBusy] = useState<{ [key: string]: boolean }>({});
  const [isBidding, setIsBidding] = useState<boolean>(false);
  const [sharePrompt, setSharePrompt] = useState<{
    type: "sign" | "claim" | "bid" | "sell";
    text: string;
  } | null>(null);
  const [heroToken, setHeroToken] = useState<{
    id: string;
    image: string;
  } | null>(null);
  const [collectionSupply, setCollectionSupply] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const config = useConfig();

  useEffect(() => {
    document.title = "VRNouns · flooor.fun — 5% royalty accumulates in the daily vault — 16-hour sign phase, 8-hour claim phase";
  }, []);

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
  // Kapatırken toast göster ki yanlışlıkla kapatan bunu fark etsin.
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
  const { address, chain: connectedChain } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const fetchEthPrice = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT",
      );
      const data = await res.json();
      setEthPrice(parseFloat(data.price));
    } catch {
      // silently fail, price stays null
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

  const fmtEth = useCallback((eth: string) => {
    const n = parseFloat(eth);
    if (!n || isNaN(n)) return "0";
    if (n >= 1) return n.toFixed(3);
    if (n >= 0.001) return n.toFixed(4);
    return n.toFixed(6);
  }, []);

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

  const checkApprovalStatus = useCallback(async () => {
    if (!address) return;
    setIsCheckingApproval(true);
    try {
      await retryWithBackoff(async () => {
        return await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "isApprovedForAll",
          args: [address, CONTRACT_ADDR],
        });
      });
    } catch (error) {
      console.error("Error checking approval status:", error);
    } finally {
      setIsCheckingApproval(false);
    }
  }, [config, address]);

  const checkIndividualNFTApprovals = useCallback(async () => {
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
      isAllApproved = false;
    }
    if (isAllApproved) {
      // setApprovalForAll koleksiyon genelinde geçerli — tüm NFT'ler onaylı
      for (const id of userNFTs) {
        approvalStatus[id.toString()] = true;
      }
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
          approvalStatus[idStr] =
            approvedAddress.toLowerCase() === CONTRACT_ADDR.toLowerCase();
        } catch (error) {
          console.error(`Error checking approval for token ${id}:`, error);
          approvalStatus[idStr] = false;
        }
      }
    }
    setNftApprovalStatus(approvalStatus);
  }, [config, address, userNFTs]);

  useEffect(() => {
    checkApprovalStatus();
  }, [checkApprovalStatus]);

  useEffect(() => {
    if (userNFTs.length > 0) {
      const timeoutId = setTimeout(() => {
        checkApprovalStatus();
        checkIndividualNFTApprovals();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [userNFTs, checkApprovalStatus, checkIndividualNFTApprovals]);

  const fetchOwnedTokenId = useCallback(async () => {
    if (!address) {
      setOwnedTokenId(null);
      return;
    }
    try {
      const owned: bigint[] = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
        })) as unknown as bigint[];
      })) as bigint[];
      if (owned && owned.length > 0) {
        const tokenId = owned.reduce((a, b) => (a > b ? a : b));
        setOwnedTokenId(tokenId);
      } else {
        setOwnedTokenId(null);
      }
    } catch (error) {
      // Geçici RPC hatasında mevcut token ID'yi koru
      console.error("Error fetching owned token ID:", error);
    }
  }, [config, address]);

  useEffect(() => {
    fetchOwnedTokenId();
  }, [fetchOwnedTokenId]);

  const getPhaseInfo = useCallback(async () => {
    try {
      const info = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "getPhaseInfo",
          args: [],
        })) as [string, bigint, bigint, bigint];
      });
      const [currentPhase, eid, elapsed, remaining] = info as [
        string,
        bigint,
        bigint,
        bigint,
      ];
      setPhaseInfo({ currentPhase, eid, elapsed, remaining });
      setRemainingTimeDisplay(Number(remaining));
    } catch (error) {
      console.error("Error getting phase info:", error);
    }
  }, [config]);

  const getDailySigners = useCallback(async () => {
    try {
      const currentEpochStart = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      });
      const signersCount = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "partCount",
          args: [currentEpochStart],
        })) as bigint;
      });
      setDailySigners(Number(signersCount));
    } catch (error) {
      console.error("Error getting daily signers:", error);
    }
  }, [config]);

  const getDailyVault = useCallback(async () => {
    try {
      // Claim fazında ilk claim, havuzu poolSnap[epoch]'a kilitleyip
      // poolAccrued'u sıfırlar. Vault olarak hep poolAccrued'u göstermek,
      // ilk claim'den sonra herkese 0 gösterir (ve paylaşım metnine $0
      // yazar). Doğrusu: snapshot alındıysa poolSnap, alınmadıysa poolAccrued.
      const [poolAccrued, epochStart] = (await Promise.all([
        retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "poolAccrued",
            args: [],
          })) as bigint;
        }),
        retryWithBackoff(async () => {
          return (await readContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "currentEpochStart",
            args: [],
          })) as bigint;
        }),
      ])) as [bigint, bigint];
      const poolSnap = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
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

  const getCurrentBid = useCallback(async () => {
    try {
      const activeBidAmount = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
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
    try {
      const bidderAddress = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "activeBidder",
          args: [],
        })) as string;
      })) as string;
      setActiveBidder(bidderAddress);
      if (
        bidderAddress &&
        bidderAddress !== "0x0000000000000000000000000000000000000000"
      ) {
        try {
          const baseName = await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: BASENAME_L2_RESOLVER_ADDRESS,
              abi: L2_RESOLVER_ABI,
              functionName: "name",
              args: [
                convertReverseNodeToBytes(bidderAddress as Address, base.id),
              ],
              chainId: base.id,
            })) as string;
          });
          if (baseName && typeof baseName === "string" && baseName !== "") {
            setActiveBidderName(baseName);
          } else {
            setActiveBidderName(
              `${bidderAddress.slice(0, 6)}...${bidderAddress.slice(-4)}`,
            );
          }
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

  const checkUserSignedStatus = useCallback(async () => {
    if (!address || !phaseInfo || !ownedTokenId) {
      setUserHasSigned(false);
      setUserHasClaimed(false);
      return;
    }
    try {
      const currentEpochStart = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "currentEpochStart",
          args: [],
        })) as bigint;
      });
      const signedTokenId = await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "mySignedToken",
          args: [currentEpochStart, address],
        })) as bigint;
      });
      const hasSigned = (signedTokenId as bigint) > BigInt(0);
      setUserHasSigned(hasSigned);
      const isSignPhase =
        phaseInfo.currentPhase.toLowerCase().includes("sign") ||
        phaseInfo.currentPhase.toLowerCase() === "signing" ||
        phaseInfo.currentPhase.toLowerCase() === "sign_phase";
      let claimedStatus = false;
      if (hasSigned && !isSignPhase) {
        try {
          await simulateContract(config, {
            address: CONTRACT_ADDR,
            abi: MARKET_ABI,
            functionName: "signOrClaim",
            args: [BigInt(ownedTokenId)],
            account: address,
          });
          claimedStatus = false;
        } catch {
          claimedStatus = true;
        }
      }
      setUserHasClaimed(claimedStatus);
    } catch (error) {
      console.error("Error checking user signed status:", error);
    }
  }, [config, address, phaseInfo, ownedTokenId]);

  const calculateYieldPerNFT = useCallback(() => {
    const vaultAmount = parseFloat(dailyVault);
    const signersCount = dailySigners;
    if (signersCount > 0 && vaultAmount > 0) {
      setYieldPerNFT((vaultAmount / signersCount).toFixed(8));
    } else {
      setYieldPerNFT("0.00000000");
    }
  }, [dailyVault, dailySigners]);

  const getUserNFTs = useCallback(async () => {
    if (!address || !config) {
      setUserNFTs((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    try {
      const balance = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;
      })) as bigint;
      const nfts: bigint[] = [];
      for (let i = 0; i < Number(balance); i++) {
        try {
          const tokenId = (await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "tokenOfOwnerByIndex",
              args: [address, BigInt(i)],
            })) as bigint;
          })) as bigint;
          nfts.push(tokenId);
        } catch {
          break;
        }
      }
      // Liste değişmediyse referansı koru — downstream effect zincirini tetiklemez
      setUserNFTs((prev) =>
        prev.length === nfts.length && prev.every((v, i) => v === nfts[i])
          ? prev
          : nfts,
      );
    } catch (error) {
      // Geçici RPC hatasında mevcut listeyi koru; sıfırlamak grid'i boşaltıp flicker yaratıyor
      console.error("Error getting user NFTs:", error);
    }
  }, [address, config]);

  const decodeTokenImage = (tokenURI: string): string | null => {
    if (tokenURI.startsWith("data:application/json;base64,")) {
      const jsonData = JSON.parse(atob(tokenURI.split(",")[1]));
      if (jsonData.image_data) {
        return `data:image/svg+xml;base64,${btoa(jsonData.image_data)}`;
      }
    }
    return null;
  };

  const getNFTImages = useCallback(async () => {
    if (!userNFTs.length || !config) {
      setNftImages((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const images: { [key: string]: string } = {};
    await Promise.all(
      userNFTs.map(async (tokenId) => {
        const tokenIdStr = tokenId.toString();
        // Görseller zincirde değişmez — daha önce çekildiyse tekrar RPC'ye gitme
        const cached = nftImageCache.current[tokenIdStr];
        if (cached) {
          images[tokenIdStr] = cached;
          return;
        }
        try {
          const tokenURI = (await retryWithBackoff(async () => {
            return (await readContract(config, {
              address: COLLECTION_ADDR,
              abi: NFT_ABI,
              functionName: "tokenURI",
              args: [tokenId],
            })) as string;
          })) as string;
          const image = decodeTokenImage(tokenURI);
          if (image) {
            images[tokenIdStr] = image;
            nftImageCache.current[tokenIdStr] = image;
          }
        } catch (error) {
          console.error(`Error getting image for token ${tokenId}:`, error);
        }
      }),
    );
    setNftImages(images);
  }, [userNFTs, config]);

  // Günün eseri: zincirdeki en son mint edilmiş VRNoun
  const getHeroNFT = useCallback(async () => {
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
      if (supply === BigInt(0)) return;
      const tokenId = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenByIndex",
          args: [supply - BigInt(1)],
        })) as bigint;
      })) as bigint;
      const tokenURI = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "tokenURI",
          args: [tokenId],
        })) as string;
      })) as string;
      const image = decodeTokenImage(tokenURI);
      if (image) setHeroToken({ id: tokenId.toString(), image });
    } catch (error) {
      console.error("Error fetching hero NFT:", error);
    }
  }, [config]);

  useEffect(() => {
    calculateYieldPerNFT();
  }, [calculateYieldPerNFT]);
  useEffect(() => {
    getNFTImages();
  }, [getNFTImages]);
  useEffect(() => {
    getHeroNFT();
  }, [getHeroNFT]);

  // Cüzdan bağlandığı anda NFT'leri otomatik yükle — refresh gerekmez
  useEffect(() => {
    getUserNFTs();
  }, [getUserNFTs]);

  useEffect(() => {
    if (address && phaseInfo && ownedTokenId) {
      checkUserSignedStatus();
    }
  }, [address, phaseInfo, ownedTokenId, checkUserSignedStatus]);

  const fetchAllData = useCallback(async () => {
    if (fetchInFlight.current) return;
    fetchInFlight.current = true;
    setIsLoading(true);
    try {
      await Promise.allSettled([
        getPhaseInfo(),
        getDailySigners(),
        getDailyVault(),
        getCurrentBid(),
        getActiveBidder(),
        checkUserSignedStatus(),
        getUserNFTs(),
        checkApprovalStatus(),
      ]);
    } finally {
      fetchInFlight.current = false;
      setIsLoading(false);
    }
  }, [
    getPhaseInfo,
    getDailySigners,
    getDailyVault,
    getCurrentBid,
    getActiveBidder,
    checkUserSignedStatus,
    getUserNFTs,
    checkApprovalStatus,
  ]);

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 2 * 60 * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // beklemeden saniyeler içinde UI'a yansır. RPC filtreleri (eth_newFilter)
  // fallback geçişlerinde/expiry'de sessizce ölebildiği için durumsuz
  // getLogs polling'i kullanıyoruz: her turda taze sorgu, kaçırma yok.
  useEffect(() => {
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
          abi: MARKET_ABI as never,
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
        }
        if (sawStake) getDailySigners();
        if (sawClaim) getDailyVault();
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

  // Yield per NFT'nin USD karşılığı — buton metinlerinde kullanılır
  const yieldUsd = toUsd(yieldPerNFT) ?? "$0.00";

  // Yıllık projeksiyon: günlük yield × 365. APR, giriş maliyeti olarak
  // minimum bid fiyatını (flooor'dan alım fiyatı) baz alır.
  const annualYieldEth = (parseFloat(yieldPerNFT) || 0) * 365;
  const projectedApr =
    annualYieldEth > 0 ? (annualYieldEth / MINIMUM_BID_FOR_SELL) * 100 : 0;

  const getSignButtonText = useCallback(() => {
    if (!phaseInfo) return `Daily Sign · Earn ${yieldUsd}`;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (isSignPhase) {
      if (userHasSigned) {
        if (remainingTimeDisplay < 60) return "Refreshing...";
        return `Claim opens ${formatTimeRemaining(remainingTimeDisplay)}`;
      } else {
        return `Daily Sign · Earn ${yieldUsd}`;
      }
    } else {
      if (userHasClaimed)
        return `Next sign ${formatTimeRemaining(remainingTimeDisplay)}`;
      else if (userHasSigned) return `Claim ${yieldUsd}`;
      else return `Sign ended ${formatTimeRemaining(remainingTimeDisplay)}`;
    }
  }, [
    phaseInfo,
    userHasSigned,
    userHasClaimed,
    remainingTimeDisplay,
    formatTimeRemaining,
    yieldUsd,
  ]);

  const isSignButtonDisabled = useCallback(() => {
    if (!phaseInfo || !address) return true;
    const isSignPhase =
      phaseInfo.currentPhase.toLowerCase().includes("sign") ||
      phaseInfo.currentPhase.toLowerCase() === "signing" ||
      phaseInfo.currentPhase.toLowerCase() === "sign_phase";
    if (remainingTimeDisplay < 30 && isSignPhase && userHasSigned) return true;
    if (isSignPhase) return userHasSigned;
    else return !userHasSigned || userHasClaimed;
  }, [phaseInfo, userHasSigned, userHasClaimed, address, remainingTimeDisplay]);

  const handleBidInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      let nextValue = event.target.value
        .replace(/,/g, ".")
        .replace(/[^0-9.]/g, "");
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
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    if (connectedChain?.id !== base.id) {
      toast.error("Please switch to Base network first.");
      return;
    }
    const trimmedInput = (bidInput || "").trim();
    const currentBidNum = parseFloat(currentBid);
    const hasActiveBid =
      activeBidder &&
      activeBidder !== "0x0000000000000000000000000000000000000000" &&
      currentBidNum > 0;
    const minRequired = hasActiveBid
      ? Math.max(currentBidNum * 1.05, MINIMUM_BID_FOR_SELL)
      : MINIMUM_BID_FOR_SELL;
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
        abi: MARKET_ABI,
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
        text: `Just placed a bid of Ξ${fmtEth(effectiveBidInput)} on a VRNoun at flooor.fun 🔨\n\nIf someone outbids me, my ETH comes right back — no risk, no lockup.\n\nRoyalties to the community.`,
      });
      setBidInput("");
      setTimeout(() => {
        getCurrentBid();
        getActiveBidder();
      }, 2000);
    } catch (error) {
      if (isUserRejectedError(error)) {
        toast.info("Transaction cancelled.");
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Transaction failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleBid() },
      });
    } finally {
      setIsBidding(false);
    }
  }, [
    config,
    ensureBase,
    bidInput,
    address,
    connectedChain,
    currentBid,
    activeBidder,
    getCurrentBid,
    getActiveBidder,
    fmtEth,
    isBidding,
  ]);

  const handleSellNFT = useCallback(
    async (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      const tokenIdStr = tokenId.toString();
      if (nftBusy[tokenIdStr]) return;
      setNftBusy((prev) => ({ ...prev, [tokenIdStr]: true }));
      try {
        await ensureBase();
        const currentBidNumber = parseFloat(currentBid);
        if (currentBidNumber < MINIMUM_BID_FOR_SELL) {
          toast.error(
            `Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`,
          );
          return;
        }
        if (userNFTs.length > 1) {
          toast.error("You must hold only 1 NFT to sell.");
          return;
        }
        const isThisNFTApproved = nftApprovalStatus[tokenIdStr] === true;
        if (!isThisNFTApproved) {
          setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: true }));
          toast.info(`Approving Noun #${tokenIdStr}...`);
          try {
            await retryWithBackoff(
              async () => {
                return await writeContract(config, {
                  address: COLLECTION_ADDR,
                  abi: NFT_ABI,
                  functionName: "setApprovalForAll",
                  args: [CONTRACT_ADDR, true],
                  dataSuffix: DATA_SUFFIX,
                });
              },
              5,
              2000,
            );
            await new Promise((resolve) => setTimeout(resolve, 5000));
            const isActuallyApproved = await retryWithBackoff(async () => {
              return await readContract(config, {
                address: COLLECTION_ADDR,
                abi: NFT_ABI,
                functionName: "isApprovedForAll",
                args: [address, CONTRACT_ADDR],
              });
            });
            if (isActuallyApproved) {
              toast.success("Approval confirmed!");
              setNftApprovalStatus((prev) => ({ ...prev, [tokenIdStr]: true }));
              await checkIndividualNFTApprovals();
            } else {
              throw new Error("Approval not confirmed on blockchain");
            }
          } catch (error) {
            if (!isUserRejectedError(error)) {
              toast.error("Approval failed. Please try again.");
            }
            throw error;
          } finally {
            setNftLoadingStatus((prev) => ({ ...prev, [tokenIdStr]: false }));
          }
        }
        await writeContract(config, {
          address: CONTRACT_ADDR,
          abi: MARKET_ABI,
          functionName: "sellToHighest",
          args: [tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Noun #${tokenIdStr} sold successfully!`);
        fireConfetti();
        const soldUsd = toUsd(currentBid);
        setSharePrompt({
          type: "sell",
          text: `Just sold my VRNoun for Ξ${fmtEth(currentBid)}${soldUsd ? ` (${soldUsd})` : ""} on flooor.fun 🤝\n\nInstant liquidity, any time. Every sale feeds the vault — distributed to holders daily.`,
        });
        // Satış sonrası anında güncelle
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toast.error(`Sell failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSellNFT(tokenId) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [tokenIdStr]: false }));
      }
    },
    [
      config,
      ensureBase,
      address,
      nftApprovalStatus,
      checkIndividualNFTApprovals,
      currentBid,
      userNFTs,
      getCurrentBid,
      getActiveBidder,
      getDailyVault,
      getUserNFTs,
      fmtEth,
      toUsd,
      nftBusy,
    ],
  );

  // Sell butonu iki dokunuşlu bir "arm/confirm" davranışı kullanır — kaza
  // eseri satışları önlemek için. İlk tık silahlandırır (5sn sonra otomatik
  // geri alınır), silahlıyken ikinci tık asıl satışı tetikler.
  const armSell = useCallback(
    (tokenId: bigint) => {
      if (!address) {
        toast.warning("Please connect your wallet first");
        return;
      }
      if (parseFloat(currentBid) < MINIMUM_BID_FOR_SELL) {
        toast.error(
          `Current bid (${currentBid} ETH) is below minimum selling price of ${MINIMUM_BID_FOR_SELL} ETH.`,
        );
        return;
      }
      const tokenIdStr = tokenId.toString();
      setArmedSell((prev) => ({ ...prev, [tokenIdStr]: true }));
      clearTimeout(armedSellTimers.current[tokenIdStr]);
      armedSellTimers.current[tokenIdStr] = setTimeout(() => {
        setArmedSell((prev) => ({ ...prev, [tokenIdStr]: false }));
      }, 5000);
    },
    [address, currentBid],
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
      const tokenIdStr = tokenId.toString();
      setNftBusy((prev) => ({ ...prev, [tokenIdStr]: true }));
      try {
        await ensureBase();
        await writeContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "transferFrom",
          args: [address, to, tokenId],
          dataSuffix: DATA_SUFFIX,
        });
        toast.success(`Noun #${tokenIdStr} sent successfully!`);
        setTimeout(() => {
          getUserNFTs();
        }, 2000);
      } catch (error) {
        if (isUserRejectedError(error)) {
          toast.info("Transaction cancelled.");
          return;
        }
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        toast.error(`Send failed: ${errorMessage}`, {
          duration: 5000,
          action: { label: "Retry", onClick: () => handleSendNFT(tokenId, to) },
        });
      } finally {
        setNftBusy((prev) => ({ ...prev, [tokenIdStr]: false }));
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

  const handleSign = useCallback(async () => {
    if (!address) {
      toast.warning("Please connect your wallet first");
      return;
    }
    try {
      await ensureBase();
      const owned: bigint[] = (await retryWithBackoff(async () => {
        return (await readContract(config, {
          address: COLLECTION_ADDR,
          abi: NFT_ABI,
          functionName: "getNFTzBelongingToOwner",
          args: [address],
        })) as unknown as bigint[];
      })) as bigint[];
      if (!owned || owned.length === 0) {
        toast.error("No NFTs owned");
        return;
      }
      if (owned.length > 1) {
        toast.warning("You must hodl only 1 vrnouns in your wallet");
        return;
      }
      const tokenId = owned.reduce((a, b) => (a > b ? a : b));
      const isSignPhase =
        phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
        phaseInfo?.currentPhase.toLowerCase() === "signing" ||
        phaseInfo?.currentPhase.toLowerCase() === "sign_phase";
      await writeContract(config, {
        address: CONTRACT_ADDR,
        abi: MARKET_ABI,
        functionName: "signOrClaim",
        args: [tokenId],
        dataSuffix: DATA_SUFFIX,
      });
      playChime();
      fireConfetti();
      if (isSignPhase) {
        setUserHasSigned(true);
        toast.success("Sign successful!");
        setSharePrompt({
          type: "sign",
          text: `Just signed my VRNoun on flooor.fun 🖊️\n\n${dailySigners + 1} signers sharing today's vault of Ξ${fmtEth(dailyVault)}.\n\nSign daily, earn daily. Royalties to the community.`,
        });
      } else {
        setUserHasClaimed(true);
        toast.success("Claim successful!");
        const claimedUsd = toUsd(yieldPerNFT);
        setSharePrompt({
          type: "claim",
          text: `Claimed Ξ${fmtEth(yieldPerNFT)}${claimedUsd ? ` (${claimedUsd})` : ""} from today's vault on flooor.fun 💰\n\nMy VRNoun earns yield every single day — no lockup, no transfer.`,
        });
      }
      setTimeout(() => {
        checkUserSignedStatus();
        getPhaseInfo();
      }, 2000);
    } catch (error) {
      if (isUserRejectedError(error)) {
        toast.info("Transaction cancelled.");
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      toast.error(`Sign/Claim failed: ${errorMessage}`, {
        duration: 5000,
        action: { label: "Retry", onClick: () => handleSign() },
      });
    }
  }, [
    config,
    ensureBase,
    phaseInfo,
    address,
    checkUserSignedStatus,
    getPhaseInfo,
    dailySigners,
    dailyVault,
    yieldPerNFT,
    fmtEth,
    toUsd,
  ]);

  const handleShare = useCallback(
    async (platform: "x" | "farcaster") => {
      if (!sharePrompt) return;
      // Mention biçimleri platforma göre farklı: Farcaster'da @farcaster
      // hesabı + /flooor kanalı (ayrı token'lar), X'te üç ayrı handle
      const mentions =
        platform === "farcaster"
          ? "@farcaster /flooor"
          : "@vrnouns @base @baseapp";
      const text = `${sharePrompt.text}\n\n${mentions}`;
      const url = "https://flooor.fun";
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

  const isWrongNetwork = !!address && !!connectedChain && connectedChain.id !== base.id;

  const isSignPhase =
    phaseInfo?.currentPhase.toLowerCase().includes("sign") ||
    phaseInfo?.currentPhase.toLowerCase() === "signing" ||
    phaseInfo?.currentPhase.toLowerCase() === "sign_phase";

  // Claim'e hazır durum — buton zarif yeşile döner
  const isClaimReady =
    !!phaseInfo && !isSignPhase && userHasSigned && !userHasClaimed;

  // Live Market banner — durum etiketi ve rengi
  const isPhaseUrgent = remainingTimeDisplay > 0 && remainingTimeDisplay < 3600;
  const marketStatusLabel = isSignPhase
    ? userHasSigned
      ? "Signed"
      : "Ready for Sign"
    : userHasClaimed
      ? "Claimed"
      : "Ready for Claim";
  const marketStatusColor = isSignPhase
    ? userHasSigned
      ? GREEN
      : isPhaseUrgent
        ? RED
        : GOLD
    : userHasClaimed
      ? GREEN
      : isPhaseUrgent
        ? RED
        : GOLD;

  const hasBid =
    activeBidder &&
    activeBidder !== "0x0000000000000000000000000000000000000000" &&
    parseFloat(currentBid) > 0;

  const minOutbidAmount = hasBid
    ? Math.max(parseFloat(currentBid) * 1.05, MINIMUM_BID_FOR_SELL)
    : MINIMUM_BID_FOR_SELL;

  // Market cap = koleksiyondaki toplam adet × taban fiyat (min bid)
  const marketCapEth =
    collectionSupply !== null ? collectionSupply * MINIMUM_BID_FOR_SELL : null;
  const marketCapUsd =
    marketCapEth !== null && ethPrice ? marketCapEth * ethPrice : null;
  const marketCapDisplay =
    marketCapUsd !== null ? `$${formatCompactUsd(marketCapUsd)}` : "—";
  const marketCapEthDisplay =
    marketCapEth !== null ? `Ξ${fmtEth(marketCapEth.toString())}` : "—";

  // TVS (Total Value Signed) = bu epoch'ta imzalayan sayısı × taban fiyat (min bid)
  const tvsEth = dailySigners * MINIMUM_BID_FOR_SELL;
  const tvsUsd = ethPrice ? tvsEth * ethPrice : null;
  const tvsUsdDisplay =
    tvsUsd !== null && tvsUsd > 0
      ? `$${Math.round(tvsUsd).toLocaleString("en-US")}`
      : "—";
  const tvsEthDisplay = tvsEth > 0 ? `Ξ ${fmtEth(tvsEth.toString())}` : null;

  return (
    <div
      className={`${playfair.variable} ${inter.variable} min-h-screen relative z-10`}
      style={{ backgroundColor: "#FFFFFF", color: INK, ...SANS }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-50"
        style={{
          backgroundColor: "rgba(255,255,255,0.95)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: `1px solid ${HAIRLINE}`,
        }}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-[72px] flex items-center justify-between">
          <Link
            href="/"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontSize: "26px",
              letterSpacing: "0.02em",
              color: INK,
            }}
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
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSound}
              type="button"
              title={
                soundOn
                  ? "Bid sound on — click to mute"
                  : "Bid sound off — click to enable"
              }
              aria-label={soundOn ? "Mute bid sound" : "Enable bid sound"}
              className="p-3 transition-colors hover:text-black"
              style={{
                color: soundOn ? INK : MUTED,
                border: `1px solid ${HAIRLINE}`,
                backgroundColor: "transparent",
              }}
            >
              {soundOn ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>
              ) : (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                  <path d="M18.6 13A17.9 17.9 0 0118 8a6 6 0 00-9.3-5" />
                  <path d="M6.3 6.3C6.1 6.9 6 7.4 6 8c0 7-3 9-3 9h14" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                mounted,
              }) => {
                const ready = mounted;
                const connected = ready && account && chain;
                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {!connected ? (
                      <button
                        onClick={openConnectModal}
                        type="button"
                        className="px-6 py-3 transition-opacity hover:opacity-80"
                        style={{
                          ...smallCaps,
                          color: "#fff",
                          backgroundColor: INK,
                        }}
                      >
                        Connect
                      </button>
                    ) : chain.unsupported ? (
                      <button
                        onClick={openChainModal}
                        type="button"
                        className="px-6 py-3"
                        style={{
                          ...smallCaps,
                          color: "#9B1C1C",
                          border: "1px solid #9B1C1C",
                          backgroundColor: "#fff",
                        }}
                      >
                        Wrong Network
                      </button>
                    ) : (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="px-6 py-3 transition-colors hover:bg-black hover:text-white"
                        style={{
                          ...smallCaps,
                          color: INK,
                          border: `1px solid ${INK}`,
                          backgroundColor: "#fff",
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

      {/* Network Gate — full-screen block until on Base */}
      {isWrongNetwork && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-6"
          style={{
            backgroundColor: "rgba(26,26,26,0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            className="w-full max-w-sm p-8 sm:p-10 text-center"
            style={{
              backgroundColor: "#fff",
              border: `1px solid ${HAIRLINE}`,
              boxShadow: "0 24px 64px -16px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="mx-auto mb-6 flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                backgroundColor: "#FBF3F3",
                border: "1px solid #F3CACA",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 2L2 17h16L10 2z"
                  stroke="#9B1C1C"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 8v4M10 14.5v.5"
                  stroke="#9B1C1C"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p style={{ ...smallCaps, color: "#9B1C1C" }}>Wrong Network</p>
            <h3
              className="mt-3"
              style={{ ...SERIF, fontWeight: 500, fontSize: "22px" }}
            >
              Switch to Base
            </h3>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: MUTED }}
            >
              Flooor runs on Base. Please switch your wallet to the Base network
              to continue.
            </p>
            <button
              onClick={() => {
                ensureBase().catch(() => {
                  // hata zaten toast ile gösterildi
                });
              }}
              className="mt-7 w-full py-4 transition-opacity hover:opacity-85"
              style={{ ...smallCaps, color: "#fff", backgroundColor: INK }}
            >
              Switch to Base
            </button>
          </div>
        </div>
      )}

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
                      VRNouns
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
                    <Image
                      src={heroToken?.image ?? "/bg.png"}
                      alt={heroToken ? `VRNoun #${heroToken.id}` : "VRNouns"}
                      width={560}
                      height={560}
                      priority
                      className="w-full h-auto"
                    />
                  </HoloFrame>
                </div>

                {/* Meta strip */}
                <div className="px-3.5 py-3 flex items-center justify-between">
                  <span style={{ ...smallCaps, fontSize: 9 }}>
                    No. {heroToken ? heroToken.id : "—"} · Base
                  </span>
                  <a
                    href="https://opensea.io/collection/vrnouns"
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
            <p style={{ ...smallCaps, color: marketStatusColor }}>
              <span
                className="live-dot mr-2"
                style={{ background: marketStatusColor }}
                aria-hidden
              />
              {marketStatusLabel}
              {" · "}Epoch {phaseInfo ? phaseInfo.eid.toString() : "—"}
              {isLoading ? " · syncing" : ""}
            </p>
            {/* Current bid */}
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

              {/* Outbid notice */}
              {hasBid && (
                <div
                  className="mt-8 px-4 py-3 flex items-start gap-3"
                  style={{
                    backgroundColor: PLINTH,
                    border: `1px solid ${HAIRLINE}`,
                  }}
                >
                  <span
                    style={{
                      color: MUTED,
                      fontSize: "13px",
                      lineHeight: 1.5,
                      ...SANS,
                    }}
                  >
                    Current bid is Ξ {fmtEth(currentBid)} — you must bid at
                    least <strong>Ξ {minOutbidAmount.toFixed(6)}</strong> to
                    outbid (5% above current).
                  </span>
                </div>
              )}

              {/* Bid — tam çerçeveli kutu */}
              <div
                className={
                  hasBid ? "mt-3 flex items-stretch" : "mt-8 flex items-stretch"
                }
                style={{
                  border: `1px solid ${bidError ? "#9B1C1C" : INK}`,
                }}
              >
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder={
                    bidError
                      ? `Minimum Ξ ${minOutbidAmount.toFixed(6)}`
                      : hasBid
                        ? `Ξ ${minOutbidAmount.toFixed(6)} or more`
                        : `Ξ ${MINIMUM_BID_FOR_SELL} or more`
                  }
                  className="flex-1 px-4 py-3.5 focus:outline-none min-w-0 text-lg tabular-nums"
                  style={{
                    ...SANS,
                    color: INK,
                    backgroundColor: "#fff",
                    border: "none",
                  }}
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
                      onClick={() =>
                        setBidInput(minOutbidAmount.toFixed(6))
                      }
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
                      onClick={() =>
                        setBidInput(`${MINIMUM_BID_FOR_SELL}`)
                      }
                      className="underline decoration-dotted underline-offset-2 hover:brightness-110 transition-[filter]"
                      style={{ color: GOLD, fontWeight: 600 }}
                    >
                      {MINIMUM_BID_FOR_SELL}
                    </button>{" "}
                    — if someone outbids you, your ETH is returned
                    automatically. Every sale feeds the vault.
                  </>
                )}
              </p>
            </div>

            {/* Details — signers, TVS, vault, yield */}
            <div className="mt-10">
              {[
                {
                  label: "Signers",
                  value: `${dailySigners}`,
                  sub: null,
                  green: false,
                  rainbow: false,
                },
                {
                  label: "TVS — Total Value Signed",
                  value: tvsUsdDisplay,
                  sub: tvsEthDisplay,
                  green: false,
                  rainbow: false,
                },
                {
                  label: "Vault",
                  value: `Ξ ${fmtEth(dailyVault)}`,
                  sub: toUsd(dailyVault),
                  green: false,
                  rainbow: false,
                },
                {
                  label: "Yield per NFT",
                  value: `Ξ ${fmtEth(yieldPerNFT)}`,
                  sub: toUsd(yieldPerNFT),
                  green: true,
                  rainbow: false,
                },
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
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-baseline justify-between py-3.5"
                  style={{ borderTop: `1px solid ${HAIRLINE}` }}
                >
                  <span style={smallCaps}>{row.label}</span>
                  <span
                    className="tabular-nums text-base"
                    style={{
                      ...SANS,
                      fontWeight: 500,
                      color: row.green ? GREEN : INK,
                    }}
                  >
                    {/* Tayf yalnızca değerin kendisine uygulanır; alt bilgi soluk kalır */}
                    {row.rainbow ? (
                      <span className="apr-rainbow">{row.value}</span>
                    ) : (
                      row.value
                    )}
                    {row.sub ? (
                      <span style={{ color: FAINT, fontWeight: 400 }}>
                        {" "}
                        · {row.sub}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>

            {/* Daily sign */}
            <div
              className="mt-10 pt-8"
              style={{ borderTop: `1px solid ${HAIRLINE}` }}
            >
              <button
                onClick={handleSign}
                disabled={isSignButtonDisabled()}
                className="w-full px-12 py-4 transition-opacity enabled:hover:opacity-85"
                style={{
                  ...smallCaps,
                  color: isSignButtonDisabled() ? FAINT : "#fff",
                  backgroundColor: isSignButtonDisabled()
                    ? IVORY
                    : isClaimReady
                      ? GREEN
                      : INK,
                  border: isSignButtonDisabled()
                    ? `1px solid ${HAIRLINE}`
                    : "none",
                  cursor: isSignButtonDisabled() ? "not-allowed" : "pointer",
                }}
              >
                {getSignButtonText()}
              </button>
              <p className="mt-3 text-xs" style={{ color: FAINT }}>
                Hold a VRNouns NFT? Sign in today to claim your share of the
                daily vault. No lockup, no transfer.
              </p>
            </div>
          </div>
        </div>

        {/* Your collection */}
        <div className="mt-20">
          <div className="flex items-baseline justify-between gap-4">
            <p style={smallCaps}>Your Collection</p>
            <button
              onClick={fetchAllData}
              disabled={isLoading}
              className="text-xs hover:text-black transition-colors disabled:opacity-50 shrink-0"
              style={{ ...smallCaps, color: MUTED }}
            >
              {isLoading ? "Refreshing…" : "Refresh Data"}
            </button>
          </div>
          <h2
            className="mt-3"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontSize: "clamp(26px, 3vw, 36px)",
            }}
          >
            Works in your wallet
          </h2>
          <p className="mt-2 text-sm" style={{ color: MUTED }}>
            Sign daily from each card below, or tap More to send or sell.
            {isCheckingApproval ? " Checking approval…" : ""}
          </p>

          {!address ? (
            <div
              className="mt-8 py-14 text-center"
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              <p
                style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
                className="text-lg"
              >
                Connect your wallet to view your collection.
              </p>
            </div>
          ) : userNFTs.length > 0 ? (
            <div className="mt-8 works-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {userNFTs.map((tokenId) => {
                const tokenIdStr = tokenId.toString();
                const approved = nftApprovalStatus[tokenIdStr];
                const busy = nftBusy[tokenIdStr] === true;
                const isExpanded = expandedCards[tokenIdStr] === true;
                const isArmed = armedSell[tokenIdStr] === true;
                const isSignPhaseNow =
                  phaseInfo?.currentPhase.toLowerCase().includes("sign") ??
                  false;
                const signedWaitingForClaim = isSignPhaseNow && userHasSigned;
                const primaryDisabled = isSignButtonDisabled();
                const primaryLabel = signedWaitingForClaim
                  ? `Signed — Epoch ${phaseInfo ? phaseInfo.eid.toString() : "—"}`
                  : getSignButtonText();

                return (
                  <WorkCard
                    key={tokenIdStr}
                    tokenIdStr={tokenIdStr}
                    itemName="VRNoun"
                    image={nftImages[tokenIdStr]}
                    approved={approved === true}
                    primaryLabel={primaryLabel}
                    primaryDisabled={primaryDisabled}
                    primaryTone={
                      signedWaitingForClaim
                        ? "waiting"
                        : isClaimReady
                          ? "ready"
                          : "default"
                    }
                    onPrimaryClick={handleSign}
                    isExpanded={isExpanded}
                    onToggleExpand={() => toggleCardExpanded(tokenId)}
                    busy={busy || nftLoadingStatus[tokenIdStr] === true}
                    onSend={() => requestSendNFT(tokenId)}
                    hasBid={!!hasBid}
                    isArmed={isArmed}
                    currentBidDisplay={fmtEth(currentBid)}
                    onSellClick={() => handleSellButtonClick(tokenId)}
                  />
                );
              })}
            </div>
          ) : (
            <div
              className="mt-8 py-14 text-center"
              style={{ border: `1px solid ${HAIRLINE}` }}
            >
              <p
                style={{ ...SERIF, fontStyle: "italic", color: MUTED }}
                className="text-lg"
              >
                No works in your collection — acquire today&apos;s lot above.
              </p>
            </div>
          )}
        </div>

        {/* Other Collections */}
        <div
          className="mt-20 pt-14"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <p style={smallCaps}>Other Collections</p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              {
                name: "The Warplets",
                sub: "Base · Farcaster",
                img: "https://i2c.seadn.io/base/0x699727f9e01a822efdcf7333073f0461e5914b4e/c4dd77598815bd89610930ca12be02/a2c4dd77598815bd89610930ca12be02.jpeg?w=1000",
                href: "/warplets",
              },
              {
                name: "Gnars",
                sub: "Base",
                img: "https://i2c.seadn.io/base/0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17/000d4dde43f1a377b3203d06a1a1ab/bf000d4dde43f1a377b3203d06a1a1ab.webp?w=1000",
                href: "/gnars",
              },
              {
                name: "Based Onchain Dinos",
                sub: "Base · Onchain",
                img: "/onchdin.svg",
                href: "/based-onchain-dinos",
              },
              {
                name: "Base Day One",
                sub: "Base",
                img: "/basedayone.gif",
                href: "/base-day-one",
              },
            ].map((col) => {
              const isLive = Boolean(col.href);
              const isFeatured = col.name === "Base Day One";
              const card = (
                <>
                  <div
                    className="relative aspect-square overflow-hidden"
                    style={{
                      backgroundColor: isFeatured ? "#f6efe3" : PLINTH,
                      border: `1px solid ${HAIRLINE}`,
                      borderRadius: 16,
                      boxShadow: isFeatured
                        ? "0 18px 38px rgba(26, 26, 26, 0.12)"
                        : "0 6px 18px rgba(26, 26, 26, 0.05)",
                    }}
                  >
                    <HoloFrame
                      className="w-full h-full"
                      overlay={
                        <>
                          <div className="absolute left-3 top-3">
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
                              Base
                            </span>
                          </div>
                          {isFeatured ? (
                            <div className="absolute right-3 top-3">
                              <span
                                style={{
                                  ...smallCaps,
                                  color: "#fff",
                                  fontSize: 9,
                                  padding: "4px 9px",
                                  backgroundColor: GREEN,
                                  letterSpacing: "0.14em",
                                  boxShadow: "0 4px 12px rgba(30,123,79,0.38)",
                                }}
                              >
                                New
                              </span>
                            </div>
                          ) : null}
                          <div className="absolute inset-x-3 bottom-3 flex justify-end">
                            <span
                              style={{
                                ...smallCaps,
                                color: "#fff",
                                fontSize: 9,
                                padding: "4px 9px",
                                backgroundColor: isLive
                                  ? "rgba(30,123,79,0.85)"
                                  : "rgba(26,26,26,0.65)",
                                backdropFilter: "blur(6px)",
                              }}
                            >
                              {isLive ? "Live →" : "Soon"}
                            </span>
                          </div>
                        </>
                      }
                    >
                      {isFeatured ? (
                        <div
                          className="absolute inset-0"
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(255,255,255,0.8), rgba(255,255,255,0.05) 45%, rgba(26,26,26,0.06))",
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        />
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={col.img}
                        alt={col.name}
                        className="w-full h-full"
                        style={
                          isFeatured
                            ? {
                                objectFit: "contain",
                                padding: "26px",
                                transform: "scale(1.04)",
                                filter:
                                  "drop-shadow(0 8px 18px rgba(0,0,0,0.12))",
                              }
                            : isLive
                              ? { objectFit: "cover" }
                              : {
                                  objectFit: "cover",
                                  filter: "blur(10px)",
                                  transform: "scale(1.12)",
                                }
                        }
                      />
                    </HoloFrame>
                  </div>
                  <p
                    className="mt-3"
                    style={{ ...SERIF, fontWeight: 500, fontSize: "17px" }}
                  >
                    {col.name}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: MUTED }}>
                    {col.sub}
                  </p>
                </>
              );
              return col.href ? (
                <Link key={col.name} href={col.href} className="block card-zoom">
                  {card}
                </Link>
              ) : (
                <div key={col.name}>{card}</div>
              );
            })}
          </div>
        </div>

        {/* How it works */}
        <div
          className="mt-24 pt-14"
          style={{ borderTop: `1px solid ${HAIRLINE}` }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                I.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Sign &amp; Earn
              </p>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: MUTED }}
              >
                Sign with your NFT without staking. Five percent of all
                royalties are shared with signers, every day.
              </p>
            </div>
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                II.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Bid or Sell
              </p>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: MUTED }}
              >
                No listings, no negotiation. Place a bid, or sell your work
                instantly at the standing price — settled on-chain.
              </p>
            </div>
            <div>
              <p
                style={{
                  ...SERIF,
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "34px",
                  color: GOLD,
                  lineHeight: 1,
                }}
              >
                III.
              </p>
              <p className="mt-4" style={{ ...smallCaps, color: INK }}>
                Game Theory
              </p>
              <p
                className="mt-3 text-base leading-relaxed"
                style={{ color: MUTED }}
              >
                Built on game theory and designed with a single intention: all
                NFT holders win together.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Torn-paper edge: white page -> ivory band */}
      <div
        aria-hidden="true"
        className="mt-24"
        style={{
          position: "relative",
          height: 48,
          lineHeight: 0,
          overflow: "hidden",
          backgroundColor: IVORY,
        }}
      >
        <svg
          viewBox="0 0 1600 48"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block", transform: "scaleY(-1)" }}
        >
          <path
            d="M0,48 L0,25.6 Q0,25.6 13,27.9 Q26,30.2 39,31.7 Q52,33.2 65,30.2 Q78,27.2 91,30.0 Q104,32.8 117,31.9 Q130,31 143,31.1 Q156,31.2 169,32.3 Q182,33.3 195,32.5 Q208,31.7 221,30.4 Q234,29.2 247,26.8 Q260,24.3 273,26.3 Q286,28.2 299,22.4 Q312,16.5 325,17.1 Q338,17.7 351,16.4 Q364,15 377,16.6 Q390,18.3 403,16.8 Q416,15.3 429,18.5 Q442,21.7 455,22.6 Q468,23.5 481,22.7 Q494,21.9 507,23.4 Q520,24.9 533,23.2 Q546,21.5 559,22.6 Q572,23.6 585,26.5 Q598,29.3 611,27.3 Q624,25.3 637,27.6 Q650,29.9 663,29.5 Q676,29.1 689,28.5 Q702,27.9 715,25.0 Q728,22.2 741,23.9 Q754,25.7 767,25.9 Q780,26.2 793,28.2 Q806,30.2 819,29.4 Q832,28.5 845,30.0 Q858,31.5 871,30.9 Q884,30.3 897,32.4 Q910,34.4 923,35.7 Q936,37 949,37.0 Q962,37.1 975,34.5 Q988,32 1001,30.4 Q1014,28.7 1027,29.9 Q1040,31 1053,30.6 Q1066,30.2 1079,29.4 Q1092,28.6 1105,27.6 Q1118,26.5 1131,28.4 Q1144,30.4 1157,30.9 Q1170,31.5 1183,30.7 Q1196,29.9 1209,29.6 Q1222,29.4 1235,27.0 Q1248,24.6 1261,24.6 Q1274,24.5 1287,26.6 Q1300,28.6 1313,27.0 Q1326,25.3 1339,25.8 Q1352,26.3 1365,27.6 Q1378,28.8 1391,28.9 Q1404,29 1417,26.4 Q1430,23.7 1443,27.9 Q1456,32 1469,29.9 Q1482,27.7 1495,29.4 Q1508,31.1 1521,28.4 Q1534,25.6 1547,27.6 Q1560,29.7 1573,32.0 L1600,34.2 L1600,48 Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>

      <div
        className="py-20 sm:py-28"
        style={{ backgroundColor: IVORY }}
      >
        <div className="max-w-4xl mx-auto px-5 sm:px-8 text-center relative">
          <div
            className="mx-auto mb-7"
            style={{ width: 56, height: 1, backgroundColor: GOLD }}
          />
          <p style={{ ...smallCaps, color: GOLD }}>Flooor · Est. MMXXV</p>
          <p
            className="mt-6"
            style={{
              ...SERIF,
              fontWeight: 500,
              fontStyle: "italic",
              fontSize: "clamp(30px, 4.5vw, 54px)",
              lineHeight: 1.2,
            }}
          >
            All NFT holders win together.
          </p>
        </div>
      </div>

      {/* Torn-paper edge: ivory band -> white page/footer */}
      <div
        aria-hidden="true"
        style={{
          position: "relative",
          height: 48,
          lineHeight: 0,
          overflow: "hidden",
          backgroundColor: "#FFFFFF",
        }}
      >
        <svg
          viewBox="0 0 1600 48"
          preserveAspectRatio="none"
          style={{ width: "100%", height: "100%", display: "block", transform: "scaleY(-1)" }}
        >
          <path
            d="M0,48 L0,23.6 Q0,23.6 13,21.8 Q26,20 39,18.1 Q52,16.1 65,17.4 Q78,18.6 91,20.9 Q104,23.2 117,21.3 Q130,19.3 143,20.0 Q156,20.6 169,24.1 Q182,27.6 195,28.5 Q208,29.4 221,28.3 Q234,27.1 247,28.4 Q260,29.6 273,30.8 Q286,31.9 299,31.2 Q312,30.5 325,29.6 Q338,28.8 351,27.6 Q364,26.3 377,24.4 Q390,22.4 403,23.0 Q416,23.6 429,24.4 Q442,25.1 455,27.7 Q468,30.3 481,32.0 Q494,33.8 507,30.6 Q520,27.5 533,27.1 Q546,26.8 559,24.5 Q572,22.2 585,24.9 Q598,27.7 611,28.9 Q624,30 637,29.1 Q650,28.2 663,28.4 Q676,28.6 689,25.9 Q702,23.2 715,25.3 Q728,27.4 741,25.6 Q754,23.9 767,25.1 Q780,26.3 793,26.8 Q806,27.3 819,25.5 Q832,23.6 845,24.7 Q858,25.8 871,24.1 Q884,22.4 897,24.0 Q910,25.7 923,27.5 Q936,29.4 949,28.8 Q962,28.1 975,25.9 Q988,23.6 1001,22.6 Q1014,21.6 1027,23.0 Q1040,24.4 1053,25.4 Q1066,26.3 1079,25.1 Q1092,23.9 1105,24.8 Q1118,25.7 1131,23.6 Q1144,21.6 1157,24.1 Q1170,26.7 1183,24.1 Q1196,21.5 1209,20.3 Q1222,19.1 1235,20.0 Q1248,20.8 1261,18.9 Q1274,17 1287,17.9 Q1300,18.9 1313,20.4 Q1326,22 1339,21.6 Q1352,21.1 1365,20.8 Q1378,20.4 1391,18.9 Q1404,17.3 1417,17.3 Q1430,17.3 1443,16.2 Q1456,15.1 1469,17.2 Q1482,19.3 1495,22.0 Q1508,24.6 1521,26.4 Q1534,28.1 1547,25.4 Q1560,22.7 1573,21.1 L1600,19.6 L1600,48 Z"
            fill={IVORY}
          />
        </svg>
      </div>

      {/* Send confirmation modal */}
      {pendingSendTokenId !== null && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-6"
          style={{ backgroundColor: "rgba(26,26,26,0.4)" }}
          onClick={() => setPendingSendTokenId(null)}
        >
          <div
            className="w-full max-w-md p-8 sm:p-10"
            style={{
              backgroundColor: "#fff",
              border: `1px solid ${HAIRLINE}`,
              boxShadow: "0 24px 64px -16px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={smallCaps}>Send Noun</p>
            <h3
              className="mt-3"
              style={{ ...SERIF, fontWeight: 500, fontSize: "26px" }}
            >
              VRNoun No. {pendingSendTokenId.toString()}
            </h3>
            <p
              className="mt-4 text-sm leading-relaxed"
              style={{ color: MUTED }}
            >
              Enter the recipient&apos;s wallet address. This transfers the
              token directly — there is no way to undo it.
            </p>
            <input
              type="text"
              placeholder="0x..."
              value={sendAddressInput}
              onChange={(e) => {
                setSendAddressInput(e.target.value);
                setSendAddressError(false);
              }}
              className="mt-4 w-full px-4 py-3 text-sm focus:outline-none"
              style={{
                border: `1px solid ${sendAddressError ? "#9B1C1C" : HAIRLINE}`,
                backgroundColor: "#fff",
                color: INK,
              }}
            />
            {sendAddressError && (
              <p className="mt-2 text-xs" style={{ color: "#9B1C1C" }}>
                Enter a valid wallet address.
              </p>
            )}
            <div className="mt-8 flex gap-4">
              <button
                onClick={() => setPendingSendTokenId(null)}
                className="flex-1 py-3.5 transition-colors hover:bg-black hover:text-white"
                style={{
                  ...smallCaps,
                  color: INK,
                  border: `1px solid ${INK}`,
                  backgroundColor: "#fff",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmSendNFT}
                className="flex-1 py-3.5 transition-opacity hover:opacity-85"
                style={{
                  ...smallCaps,
                  color: "#fff",
                  backgroundColor: INK,
                }}
              >
                Confirm Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share prompt modal — sign/claim/bid/sell sonrası */}
      {sharePrompt !== null && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center px-4"
          style={{ backgroundColor: "rgba(26,26,26,0.5)" }}
        >
          <div
            className="w-full"
            style={{
              maxWidth: "400px",
              backgroundColor: IVORY,
              border: `1px solid ${HAIRLINE}`,
            }}
          >
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
