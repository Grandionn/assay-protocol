// Read-only integration with ERC-8004 IdentityRegistry on Base mainnet.

const { ethers } = require('ethers');

const BASE_RPC = 'https://mainnet.base.org';
const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

const ABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

let _provider = null;
let _contract = null;

function getContract() {
  if (!_contract) {
    _provider = new ethers.JsonRpcProvider(BASE_RPC);
    _contract = new ethers.Contract(IDENTITY_REGISTRY, ABI, _provider);
  }

  return _contract;
}

function resolveUri(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://')) {
    return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  }
  return uri;
}

async function fetchErc8004AgentCard(agentId) {
  try {
    const contract = getContract();
    const numericId = BigInt(agentId);

    let owner;
    try {
      owner = await contract.ownerOf(numericId);
    } catch {
      return null;
    }

    const tokenUri = await contract.tokenURI(numericId);
    const resolvedUrl = resolveUri(tokenUri);

    if (!resolvedUrl) {
      return {
        agentId: Number(numericId),
        owner: owner.toLowerCase(),
        name: null,
        description: null,
        image: null,
      };
    }

    const response = await fetch(resolvedUrl, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.warn(`[erc8004] Failed to fetch tokenURI for agent ${agentId}: HTTP ${response.status}`);
      return {
        agentId: Number(numericId),
        owner: owner.toLowerCase(),
        name: null,
        description: null,
        image: null,
      };
    }

    const card = await response.json();

    return {
      agentId: Number(numericId),
      owner: owner.toLowerCase(),
      name: card.name || null,
      description: card.description || null,
      image: card.image ? resolveUri(card.image) : null,
    };
  } catch (error) {
    console.warn(`[erc8004] Error fetching agent card for ID ${agentId}:`, error.message);
    return null;
  }
}

module.exports = { fetchErc8004AgentCard };
