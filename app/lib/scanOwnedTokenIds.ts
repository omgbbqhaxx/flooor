import type { Config } from "wagmi";
import { getPublicClient, readContract, readContracts } from "wagmi/actions";

type RetryFn = (
  fn: () => Promise<unknown>,
  maxRetries?: number,
  baseDelay?: number,
) => Promise<unknown>;

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
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  candidateIds: bigint[];
  retryWithBackoff: RetryFn;
}): Promise<bigint[]> {
  if (candidateIds.length === 0) return [];
  const CHUNK = 250;
  const owned: bigint[] = [];
  for (let start = 0; start < candidateIds.length; start += CHUNK) {
    const chunk = candidateIds.slice(start, start + CHUNK);
    try {
      const results = (await retryWithBackoff(
        async () =>
          readContracts(config, {
            contracts: chunk.map((tokenId) => ({
              address: collectionAddress,
              abi: abi as never,
              functionName: "ownerOf",
              args: [tokenId],
            })) as never,
            allowFailure: true,
          }),
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
      console.error("verifyCurrentOwnership: chunk failed", error);
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
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  owner: `0x${string}`;
}): Promise<bigint[]> {
  const client = getPublicClient(config);
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
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  chunkSize: number;
  retryWithBackoff: RetryFn;
}): Promise<bigint[]> {
  const totalSupply = (await retryWithBackoff(async () => {
    return (await readContract(config, {
      address: collectionAddress,
      abi: abi as never,
      functionName: "totalSupply",
    })) as bigint;
  })) as bigint;
  const supply = Number(totalSupply);

  const candidateIds: bigint[] = [];
  for (let i = 1; i <= supply; i++) candidateIds.push(BigInt(i));

  const ids: bigint[] = [];
  for (let start = 0; start < candidateIds.length; start += chunkSize) {
    const chunk = candidateIds.slice(start, start + chunkSize);
    try {
      const results = (await retryWithBackoff(
        async () =>
          readContracts(config, {
            contracts: chunk.map((tokenId) => ({
              address: collectionAddress,
              abi: abi as never,
              functionName: "ownerOf",
              args: [tokenId],
            })) as never,
            allowFailure: true,
          }),
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
      // Bu parça tüm retry denemelerine rağmen başarısız oldu — atla,
      // diğer parçalardan toplanan sonuçları kaybetme.
      console.error("scanViaBruteForceRange: chunk failed", error);
    }
  }
  return ids;
}

export async function scanOwnedTokenIds({
  config,
  collectionAddress,
  abi,
  owner,
  chunkSize = 250,
  retryWithBackoff,
}: {
  config: Config;
  collectionAddress: `0x${string}`;
  abi: unknown;
  owner: `0x${string}`;
  chunkSize?: number;
  retryWithBackoff: RetryFn;
}): Promise<bigint[]> {
  try {
    const candidateIds = await scanViaAlchemyTransfers({
      config,
      collectionAddress,
      owner,
    });
    return await verifyCurrentOwnership({
      config,
      collectionAddress,
      abi,
      owner,
      candidateIds,
      retryWithBackoff,
    });
  } catch (error) {
    console.error(
      "scanOwnedTokenIds: alchemy_getAssetTransfers failed, falling back to range scan",
      error,
    );
    return scanViaBruteForceRange({
      config,
      collectionAddress,
      abi,
      owner,
      chunkSize,
      retryWithBackoff,
    });
  }
}
