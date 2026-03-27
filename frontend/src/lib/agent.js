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

export const MINIMUM_STAKE_USDC = 500;
export const MINIMUM_STAKE_MICRO = 500_000_000;

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

export function calculateProvisionalAssayScore(capability, stake, address = '') {
  const wordCount = (capability?.trim().split(/\s+/).filter(Boolean).length ?? 0);
  const stakeComponent = Math.min(Number(stake) / 2_500_000_000, 1) * 2200;
  const richnessComponent = Math.min(wordCount / 60, 1) * 1300;
  const entropyComponent = hashString(`${address}:${capability}`) % 900;

  return Math.min(9500, Math.round(5000 + stakeComponent + richnessComponent + entropyComponent));
}

export function deriveCompletionRate(assayScore, address = '') {
  const jitter = (hashString(address) % 70) / 10;
  return Math.min(99.5, 76 + assayScore / 420 + jitter);
}

export function deriveAverageSpeedMs(assayScore, address = '') {
  const jitter = hashString(`${address}:speed`) % 24;
  return Math.max(18, Math.round(170 - assayScore / 85 + jitter));
}

export function deriveReliabilityStreak(stake, assayScore, address = '') {
  return Math.round(Number(stake) / 1_000_000 / 3 + assayScore / 22 + (hashString(address) % 100));
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

export function hydrateAgent(rawAgent, onChainAgent = {}) {
  const address = rawAgent?.address ?? onChainAgent?.address ?? '';
  const capability = rawAgent?.capability ?? onChainAgent?.capability ?? onChainAgent?.capabilityHash ?? '';
  const stake = rawAgent?.stake ?? onChainAgent?.stake ?? 0;
  const assayScore = rawAgent?.assayScore ?? calculateProvisionalAssayScore(capability, stake, address);
  const name = rawAgent?.name ?? deriveAgentName(address, capability);
  const tags = rawAgent?.tags ?? extractCapabilityTags(capability);
  const active = onChainAgent?.active ?? rawAgent?.active ?? false;
  const registered = onChainAgent?.registered ?? Boolean(rawAgent?.registeredAt);

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
    completionRate: rawAgent?.completionRate ?? deriveCompletionRate(assayScore, address),
    avgSpeedMs: rawAgent?.avgSpeedMs ?? deriveAverageSpeedMs(assayScore, address),
    reliabilityStreak:
      rawAgent?.reliabilityStreak ?? deriveReliabilityStreak(stake, assayScore, address),
    shortAddress: truncateAddress(address),
    combinedScore: rawAgent?.combinedScore ?? rawAgent?.scoreBreakdown?.semantic ?? 0.74,
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
