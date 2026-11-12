import type { Config } from "wagmi";
import type { Abi } from "viem";
import { getPublicClient, readContract } from "wagmi/actions";

type RetryFn = (
  fn: () => Promise<unknown>,
  maxRetries?: number,
  baseDelay?: number,
) => Promise<unknown>;

// Coalesce only concurrent scans. Never cache ownership across transactions.
const pendingScans = new WeakMap<Config, Map<string, Promise<bigint[]>>>();

function hasRpcCode(error: unknown, codes: number[]): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { code?: number; cause?: unknown };
    if (value.code !== undefined && codes.includes(value.code)) return true;
    current = value.cause;
  }
  return false;
}

// ownerOf may legitimately revert for burned/unminted IDs. Transport failures
// must propagate: returning a partial list would incorrectly remove owned NFTs.
function isMissingToken(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { name?: string; cause?: unknown };
    if (value.name === "ContractFunctionRevertedError") return true;
    current = value.cause;
  }
  return false;
}

type OwnershipContract = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

async function readOwners(config: Config, chainId: number | undefined, contracts: unknown) {
  const client = getPublicClient(config, chainId ? { chainId } : undefined);
  if (!client) throw new Error("no public client");
  // Direct multicall deliberately avoids wagmi readContracts' individual-call
  // fallback during an RPC outage (hundreds of requests per failed chunk).
  const results = await client.multicall({
    contracts: contracts as readonly OwnershipContract[],
    allowFailure: true,
  });
  for (const result of results) {
    if (result.status === "failure" && !isMissingToken(result.error)) throw result.error;
  }
  return results;
}

type AlchemyAssetTransfer = { tokenId?: string; erc721TokenId?: string };
type AlchemyAssetTransfersResponse = {
  transfers: AlchemyAssetTransfer[];
  pageKey?: string;
};

async function verifyCurrentOwnership({
  config,
  collectionAddress,
  abi,
  owner,
  candidateIds,
  retryWithBackoff,
  chainId,
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  candidateIds: bigint[];
  retryWithBackoff: RetryFn;
  chainId?: number;
}): Promise<bigint[]> {
  if (candidateIds.length === 0) return [];
  const CHUNK = 250;
  const owned: bigint[] = [];
  for (let start = 0; start < candidateIds.length; start += CHUNK) {
    const chunk = candidateIds.slice(start, start + CHUNK);
    try {
      const results = (await retryWithBackoff(
        async () =>
          readOwners(
            config,
            chainId,
            chunk.map((tokenId) => ({
              address: collectionAddress,
              abi: abi as never,
              functionName: "ownerOf",
              args: [tokenId],
            })),
          ),
        5,
        1200,
      )) as { status: "success" | "failure"; result?: unknown }[];
      results.forEach((r, idx) => {
        if (
          r.status === "success" &&
          typeof r.result === "string" &&
          r.result.toLowerCase() === owner.toLowerCase()
        ) {
          owned.push(chunk[idx]);
        }
      });
    } catch (error) {
      throw error;
    }
  }
  return owned;
}

// Alchemy'nin indeksli transfer geçmişi (alchemy_getAssetTransfers) ile
// bir adrese HİÇ transfer edilmiş tüm tokenId'leri bulup, sonra bunların
// GÜNCEL sahipliğini ownerOf() ile doğruluyoruz. Bu, tokenId aralığını
// taramaktan (aşağıdaki fallback) çok daha doğru: bazı koleksiyonlarda
// (örn. Gnars) tokenId'ler 1..totalSupply gibi ardışık değil, çok daha
// geniş/seyrek bir aralığa yayılıyor — totalSupply kadar tarama bu
// durumda sahip olunan tokenId'leri sessizce kaçırıyordu.
async function scanViaAlchemyTransfers({
  config,
  collectionAddress,
  owner,
  chainId,
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  owner: `0x${string}`;
  chainId?: number;
}): Promise<bigint[]> {
  const client = getPublicClient(config, chainId ? { chainId } : undefined);
  if (!client) throw new Error("no public client");

  const candidateIds = new Set<string>();
  let pageKey: string | undefined;
  let pages = 0;
  do {
    const params: Record<string, unknown> = {
      fromBlock: "0x0",
      toBlock: "latest",
      toAddress: owner,
      contractAddresses: [collectionAddress],
      category: ["erc721"],
      withMetadata: false,
      excludeZeroValue: false,
    };
    if (pageKey) params.pageKey = pageKey;

    const res = (await client.request({
      // Alchemy'ye özgü zenginleştirilmiş RPC metodu — standart eth_getLogs'un
      // aksine blok aralığı sınırı yok, tek/az sayıda çağrıyla tüm geçmişi tarar.
      method: "alchemy_getAssetTransfers" as never,
      params: [params] as never,
    })) as AlchemyAssetTransfersResponse;

    for (const t of res.transfers ?? []) {
      const raw = t.tokenId ?? t.erc721TokenId;
      if (raw) candidateIds.add(BigInt(raw).toString());
    }
    pageKey = res.pageKey;
    pages += 1;
  } while (pageKey && pages < 50); // güvenlik sınırı

  if (pageKey) throw new Error("Transfer history exceeds scan page limit");
  return [...candidateIds].map((id) => BigInt(id));
}

// Fallback: Alchemy dışı bir RPC'ye düşülürse (alchemy_getAssetTransfers
// yoksa) totalSupply kadar tokenId için ownerOf() taranır. tokenId'ler
// ardışıksa doğru sonuç verir; seyrekse (Gnars gibi) eksik kalabilir ama
// hiç sonuç göstermemekten iyidir.
async function scanViaBruteForceRange({
  config,
  collectionAddress,
  abi,
  owner,
  chunkSize,
  retryWithBackoff,
  chainId,
  fallbackMaxTokenId,
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  chunkSize: number;
  retryWithBackoff: RetryFn;
  chainId?: number;
  fallbackMaxTokenId?: number;
}): Promise<bigint[]> {
  // ERC404 aynaları (örn. QUOTRONS) totalSupply sunmaz. Okuma başarısız olursa
  // çağıranın verdiği üst sınıra düş; o da yoksa hata yukarı taşınır.
  let supply: number;
  try {
    const totalSupply = (await retryWithBackoff(async () => {
      return (await readContract(config, {
        address: collectionAddress,
        abi: abi as never,
        functionName: "totalSupply",
        ...(chainId ? { chainId } : {}),
      })) as bigint;
    })) as bigint;
    supply = Number(totalSupply);
  } catch (error) {
    if (fallbackMaxTokenId === undefined) throw error;
    console.error(
      "scanViaBruteForceRange: totalSupply unavailable, using fallbackMaxTokenId",
      error,
    );
    supply = fallbackMaxTokenId;
  }

  const candidateIds: bigint[] = [];
  for (let i = 1; i <= supply; i++) candidateIds.push(BigInt(i));

  const ids: bigint[] = [];
  for (let start = 0; start < candidateIds.length; start += chunkSize) {
    const chunk = candidateIds.slice(start, start + chunkSize);
    try {
      const results = (await retryWithBackoff(
        async () =>
          readOwners(
            config,
            chainId,
            chunk.map((tokenId) => ({
              address: collectionAddress,
              abi: abi as never,
              functionName: "ownerOf",
              args: [tokenId],
            })),
          ),
        5,
        1200,
      )) as { status: "success" | "failure"; result?: unknown }[];
      results.forEach((r, idx) => {
        if (
          r.status === "success" &&
          typeof r.result === "string" &&
          r.result.toLowerCase() === owner.toLowerCase()
        ) {
          ids.push(chunk[idx]);
        }
      });
    } catch (error) {
      // A partial scan must not replace a previously complete ownership list.
      throw error;
    }
  }
  return ids;
}

async function scanOwnedTokenIdsUnshared({
  config,
  collectionAddress,
  abi,
  owner,
  chunkSize = 250,
  retryWithBackoff,
  chainId,
  fallbackMaxTokenId,
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  chunkSize?: number;
  retryWithBackoff: RetryFn;
  chainId?: number;
  /** totalSupply sunmayan koleksiyonlarda taranacak en yüksek tokenId. */
  fallbackMaxTokenId?: number;
}): Promise<bigint[]> {
  let candidateIds: bigint[];
  try {
    candidateIds = await scanViaAlchemyTransfers({
      config,
      collectionAddress,
      owner,
      chainId,
    });
  } catch (error) {
    // Only an explicitly unsupported indexed API justifies the expensive
    // compatibility scan. 429/timeouts/outages preserve the caller's old list.
    if (!hasRpcCode(error, [-32601, -32004])) throw error;
    return scanViaBruteForceRange({
      config,
      collectionAddress,
      abi,
      owner,
      chunkSize,
      retryWithBackoff,
      chainId,
      fallbackMaxTokenId,
    });
  }
  return verifyCurrentOwnership({
    config, collectionAddress, abi, owner, candidateIds, retryWithBackoff, chainId,
  });
}

export function scanOwnedTokenIds(options: Parameters<typeof scanOwnedTokenIdsUnshared>[0]): Promise<bigint[]> {
  let pending = pendingScans.get(options.config);
  if (!pending) {
    pending = new Map();
    pendingScans.set(options.config, pending);
  }
  const chainId = options.chainId ?? options.config.state.chainId;
  const key = `${chainId}:${options.collectionAddress.toLowerCase()}:${options.owner.toLowerCase()}:${options.chunkSize ?? 250}:${options.fallbackMaxTokenId ?? ""}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = scanOwnedTokenIdsUnshared({ ...options, chainId }).finally(() => pending!.delete(key));
  pending.set(key, task);
  return task;
}
