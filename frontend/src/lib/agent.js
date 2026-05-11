import { truncateAddress } from './format';

const keywordGroups = [
  { match: ['audit', 'security', 'reentrancy', 'solidity'], label: 'Security' },
  { match: ['evm', 'smart contract', 'base', 'on-chain'], label: 'EVM' },
  { match: ['defi', 'yield', 'liquidity', 'arbitrage'], label: 'DeFi' },
  { match: ['data', 'analytics', 'dashboard', 'python'], label: 'Analytics' },
  { match: ['translation', 'language', 'localisation'], label: 'Localization' },
  { match: ['nlp', 'summarisation', 'text', 'document'], label: 'NLP' },
  { match: ['video', 'ffmpeg', 'multimedia'], label: 'Media' },
  { match: ['browser', 'playwright', 'scraping'], label: 'Automation' },
  { match: ['latency', 'execution', 'real-time'], label: 'Execution' },
];

const namePrefixes = ['Securify', 'Vector', 'Sovereign', 'Atlas', 'Sentinel', 'Nova', 'Helix', 'Cinder'];
const nameSuffixes = ['Ledger', 'Node', 'Relay', 'Grid', 'Engine', 'Prime', 'Vault', 'Signal'];

export const MINIMUM_STAKE_USDC = 10;
export const MINIMUM_STAKE_MICRO = 10_000_000;

export function extractCapabilityTags(capability) {
  const source = (capability ?? '').toLowerCase();
  const tags = keywordGroups
    .filter((group) => group.match.some((term) => source.includes(term)))
    .map((group) => group.label);

  if (tags.length >= 3) {
    return tags.slice(0, 3);
  }

  const fallback = source
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .filter((term) => term.length >= 5)
    .map((term) => term[0].toUpperCase() + term.slice(1))
    .filter((term, index, array) => array.indexOf(term) === index)
    .slice(0, 3 - tags.length);

  const resolved = [...tags, ...fallback].slice(0, 3);
  return resolved.length > 0 ? resolved : ['Protocol'];
}

export function deriveAgentName(address, capability) {
  const source = capability?.trim();

  if (source) {
    const firstTag = extractCapabilityTags(source)[0];
    if (firstTag) {
      return `${firstTag} ${nameSuffixes[hashString(source) % nameSuffixes.length]}`;
    }
  }

  const hash = hashString(address ?? 'assay');
  return `${namePrefixes[hash % namePrefixes.length]} ${nameSuffixes[(hash >> 3) % nameSuffixes.length]}`;
}

export function deriveStatus({ stake, active, registered }) {
  if (active) {
    return 'Active';
  }

  if (registered || Number(stake) >= MINIMUM_STAKE_MICRO) {
    return 'Monitoring';
  }

  return 'Under Review';
}

export function isTestnetFallbackAgent(indexedAgent, onChainAgent) {
  if (!indexedAgent) {
    return false;
  }

  if (!onChainAgent) {
    return true;
  }

  return (
    !onChainAgent.active &&
    !onChainAgent.registered &&
    Number(onChainAgent.stake ?? 0) === 0 &&
    Number(onChainAgent.earnings ?? 0) === 0
  );
}

export function hydrateAgent(rawAgent, onChainAgent = {}, onChainStats = null) {
  const address = rawAgent?.address ?? onChainAgent?.address ?? '';
  const capability = rawAgent?.capability ?? onChainAgent?.capability ?? onChainAgent?.capabilityHash ?? '';
  const stake = rawAgent?.stake ?? onChainAgent?.stake ?? 0;
  const assayScore = rawAgent?.assayScore ?? 0;
  const name = rawAgent?.name ?? deriveAgentName(address, capability);
  const tags = rawAgent?.tags ?? extractCapabilityTags(capability);
  const active = onChainAgent?.active ?? rawAgent?.active ?? false;
  const registered = onChainAgent?.registered ?? Boolean(rawAgent?.registeredAt);
  let completionRate = rawAgent?.completionRate ?? null;
  let avgSpeedMs = rawAgent?.avgSpeedMs ?? null;
  let reliabilityStreak = rawAgent?.reliabilityStreak ?? 0;

  if (onChainStats && onChainStats.totalJobs > 0) {
    completionRate = (onChainStats.completedJobs / onChainStats.totalJobs) * 100;
    reliabilityStreak = onChainStats.currentStreak;
    if (onChainStats.completedJobs > 0) {
      avgSpeedMs = Math.round(onChainStats.totalSpeedScore / onChainStats.completedJobs);
    }
  }

  return {
    ...rawAgent,
    ...onChainAgent,
    address,
    capability,
    name,
    stake,
    assayScore,
    tags,
    active,
    registered,
    status: rawAgent?.status ?? deriveStatus({ stake, active, registered }),
    completionRate,
    avgSpeedMs,
    reliabilityStreak,
    isTestnetAgent: Boolean(rawAgent?.isTestnetAgent),
    shortAddress: truncateAddress(address),
    combinedScore: rawAgent?.combinedScore ?? 0,
    totalEarnings: onChainAgent?.earnings ?? rawAgent?.totalEarnings ?? 0,
  };
}

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}
