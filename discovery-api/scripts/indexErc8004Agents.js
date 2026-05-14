const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

const ENV_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

let loadedEnvPath = null;
for (const envPath of ENV_PATH_CANDIDATES) {
  if (!fs.existsSync(envPath)) {
    continue;
  }

  dotenv.config({ path: envPath });
  loadedEnvPath = envPath;
  break;
}

if (loadedEnvPath) {
  console.log(`[erc8004-index] Loaded .env from ${loadedEnvPath}`);
} else {
  console.log('[erc8004-index] No .env file found in expected locations.');
}

const { ethers } = require('ethers');
const { getEmbedding } = require('../src/embedder');
const store = require('../src/vectorStore');

const BASE_RPC_URL = 'https://mainnet.base.org';
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const DEFAULT_MAX_COUNT = 500;
const DEFAULT_SCAN_CEILING = 10_000;
const FETCH_TIMEOUT_MS = 8_000;
const INDEX_DELAY_MS = 300;
const LOG_INTERVAL = 50;
const CONSECUTIVE_FAILURE_LIMIT = 200;
const BLOCKED_TERMS = ['porn', 'fuck', 'shit', 'ass', 'dick', 'sex', 'nude', 'xxx', 'hentai', 'cock', 'pussy'];

const ABI = [
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

function parseMaxCount(value) {
  if (value == null) {
    return DEFAULT_MAX_COUNT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid max count "${value}". Provide a positive integer, for example: node discovery-api/scripts/indexErc8004Agents.js 500`,
    );
  }

  return parsed;
}

function parseScanCeiling(value) {
  if (value == null) {
    return DEFAULT_SCAN_CEILING;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid scan ceiling "${value}". Provide a positive integer, for example: node discovery-api/scripts/indexErc8004Agents.js 500 10000`,
    );
  }

  return parsed;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveUri(uri) {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  if (uri.startsWith('ipfs://ipfs/')) {
    return `https://ipfs.io/ipfs/${uri.slice('ipfs://ipfs/'.length)}`;
  }

  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`;
  }

  return uri;
}

function hasRealName(name) {
  return typeof name === 'string' && name.trim().length > 0;
}

function containsBlockedContent(name, description) {
  const haystack = `${name ?? ''} ${description ?? ''}`.toLowerCase();
  return BLOCKED_TERMS.some((term) => haystack.includes(term));
}

function isWalletLikeName(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  return normalizedName.startsWith('0x') && normalizedName.length > 20;
}

function isAsciiPrintable(value) {
  return /^[\x20-\x7E]+$/.test(value);
}

async function fetchAgentCard(contract, tokenId) {
  let owner;
  try {
    owner = await contract.ownerOf(tokenId);
  } catch {
    return null;
  }

  let tokenUri = null;
  try {
    tokenUri = await contract.tokenURI(tokenId);
  } catch {
    tokenUri = null;
  }

  const resolvedTokenUri = resolveUri(tokenUri);
  if (!resolvedTokenUri) {
    return {
      owner: owner.toLowerCase(),
      name: null,
      description: null,
      image: null,
    };
  }

  try {
    const response = await fetch(resolvedTokenUri, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) {
      console.warn(`[erc8004-index] Metadata fetch failed for token ${tokenId}: HTTP ${response.status}`);
      return {
        owner: owner.toLowerCase(),
        name: null,
        description: null,
        image: null,
      };
    }

    const card = await response.json();
    return {
      owner: owner.toLowerCase(),
      name: card?.name || null,
      description: card?.description || null,
      image: card?.image ? resolveUri(card.image) : null,
    };
  } catch (error) {
    console.warn(`[erc8004-index] Metadata fetch failed for token ${tokenId}: ${error.message}`);
    return {
      owner: owner.toLowerCase(),
      name: null,
      description: null,
      image: null,
    };
  }
}

async function* enumerateTokenIds(contract, maxCount, scanCeiling) {
  try {
    const totalSupply = Number(await contract.totalSupply());
    const limit = Math.min(totalSupply, maxCount);

    for (let index = 0; index < limit; index += 1) {
      try {
        yield await contract.tokenByIndex(index);
      } catch (error) {
        console.warn(`[erc8004-index] tokenByIndex(${index}) failed: ${error.message}`);
      }
    }
    return;
  } catch (error) {
    console.warn(`[erc8004-index] totalSupply/tokenByIndex unavailable, falling back to tokenId scan: ${error.message}`);
  }

  let consecutiveFailures = 0;

  for (let tokenId = 0; tokenId < scanCeiling; tokenId += 1) {
    try {
      await contract.ownerOf(tokenId);
      consecutiveFailures = 0;
      yield BigInt(tokenId);
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= CONSECUTIVE_FAILURE_LIMIT) {
        console.log(
          `[erc8004-index] Stopping sparse token scan at tokenId ${tokenId} after ${CONSECUTIVE_FAILURE_LIMIT} consecutive ownerOf failures.`,
        );
        break;
      }
    }
  }
}

async function main() {
  const maxCount = parseMaxCount(process.argv[2]);
  const scanCeiling = parseScanCeiling(process.argv[3]);
  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const contract = new ethers.Contract(IDENTITY_REGISTRY, ABI, provider);

  console.log(`[erc8004-index] Loading vector store${process.env.MONGODB_URI ? '' : ' (MongoDB disabled if MONGODB_URI is unset)'}...`);
  console.log(`[erc8004-index] Targeting up to ${maxCount} indexed agents with a sparse scan ceiling of ${scanCeiling}.`);
  await store.load();

  let indexed = 0;
  let skipped = 0;
  let failed = 0;
  let processed = 0;

  for await (const tokenId of enumerateTokenIds(contract, maxCount, scanCeiling)) {
    if (indexed + skipped + failed >= maxCount) {
      break;
    }

    processed += 1;
    const numericTokenId = Number(tokenId);

    try {
      const card = await fetchAgentCard(contract, tokenId);
      if (!card) {
        skipped += 1;
        console.warn(`[erc8004-index] Skipping token ${numericTokenId}: metadata could not be resolved.`);
      } else {
        if (!hasRealName(card.name)) {
          skipped += 1;
          console.warn(`[erc8004-index] Skipping token ${numericTokenId}: metadata has no real name.`);
          if (processed % LOG_INTERVAL === 0) {
            console.log(`Indexed ${processed}/${maxCount} (${failed} failed, ${skipped} skipped)...`);
          }
          await delay(INDEX_DELAY_MS);
          continue;
        }

        const addressKey = `erc8004-${numericTokenId}`;
        const name = card.name.trim();
        const description = card.description || 'ERC-8004 registered agent on Base';

        if (containsBlockedContent(name, description)) {
          skipped += 1;
          console.warn(`[erc8004-index] Skipping token ${numericTokenId}: blocked content detected.`);
          if (processed % LOG_INTERVAL === 0) {
            console.log(`Indexed ${processed}/${maxCount} (${failed} failed, ${skipped} skipped)...`);
          }
          await delay(INDEX_DELAY_MS);
          continue;
        }

        if (isWalletLikeName(name)) {
          skipped += 1;
          console.warn(`[erc8004-index] Skipping token ${numericTokenId}: name looks like a wallet address.`);
          if (processed % LOG_INTERVAL === 0) {
            console.log(`Indexed ${processed}/${maxCount} (${failed} failed, ${skipped} skipped)...`);
          }
          await delay(INDEX_DELAY_MS);
          continue;
        }

        if (!isAsciiPrintable(name)) {
          skipped += 1;
          console.warn(`[erc8004-index] Skipping token ${numericTokenId}: name contains non-ASCII characters.`);
          if (processed % LOG_INTERVAL === 0) {
            console.log(`Indexed ${processed}/${maxCount} (${failed} failed, ${skipped} skipped)...`);
          }
          await delay(INDEX_DELAY_MS);
          continue;
        }

        const image = card.image || null;
        const capability = description;
        const embedding = await getEmbedding(`${name} ${capability}`);

        await store.upsert(addressKey, embedding, {
          address: addressKey,
          name,
          capability,
          stake: 0,
          assayScore: 0,
          erc8004AgentId: numericTokenId,
          erc8004Name: name,
          erc8004Description: description,
          erc8004Image: image,
          erc8004Owner: card.owner,
          registeredAt: new Date().toISOString(),
        });

        indexed += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn(`[erc8004-index] Failed to index token ${numericTokenId}: ${error.message}`);
    }

    if (processed % LOG_INTERVAL === 0) {
      console.log(`Indexed ${processed}/${maxCount} (${failed} failed, ${skipped} skipped)...`);
    }

    await delay(INDEX_DELAY_MS);
  }

  console.log(`[erc8004-index] Completed. Indexed: ${indexed}, skipped: ${skipped}, failed: ${failed}`);
  process.exit(0);
}

main().catch((error) => {
  console.error('[erc8004-index] Fatal error:', error);
  process.exit(1);
});
