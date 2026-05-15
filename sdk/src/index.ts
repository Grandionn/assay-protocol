const DEFAULT_API_URL = 'https://assay-discovery-api.onrender.com';
const DEFAULT_THRESHOLD = 500;
const MAX_SCORE = 1000;

export type TrustBand =
  | 'UNKNOWN'
  | 'UNVERIFIED'
  | 'LOW_TRUST'
  | 'MODERATE'
  | 'TRUSTED'
  | 'HIGHLY_TRUSTED';

export interface AgentRecord {
  address?: string;
  name?: string;
  capability?: string;
  stake?: number | string;
  assayScore?: number;
  erc8004AgentId?: number | null;
  [key: string]: unknown;
}

export interface TrustCheckOptions {
  threshold?: number;
  apiUrl?: string;
}

export interface AgentLookupOptions {
  apiUrl?: string;
}

export interface TrustCheckResult {
  address: string;
  trusted: boolean;
  score: number;
  maxScore: 1000;
  stake: string;
  capability: string;
  band: TrustBand;
  erc8004: boolean;
}

export interface ScoreResult {
  address: string;
  score: number;
  band: TrustBand;
}

function normalizeApiUrl(apiUrl?: string): string {
  return (apiUrl ?? DEFAULT_API_URL).trim().replace(/\/+$/, '');
}

function normalizeScore(rawScore: unknown): number {
  const parsed = Number(rawScore ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_SCORE, Math.round(parsed / 10)));
}

function getBand(score: number): TrustBand {
  if (score <= 200) {
    return 'UNVERIFIED';
  }

  if (score <= 400) {
    return 'LOW_TRUST';
  }

  if (score <= 600) {
    return 'MODERATE';
  }

  if (score <= 800) {
    return 'TRUSTED';
  }

  return 'HIGHLY_TRUSTED';
}

async function parseJsonSafe(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractAgentRecord(payload: unknown, requestedAddress: string): AgentRecord | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as {
    agent?: unknown;
    results?: unknown;
  };

  if (candidate.agent && typeof candidate.agent === 'object') {
    return candidate.agent as AgentRecord;
  }

  if (Array.isArray(candidate.results)) {
    const normalizedRequestedAddress = requestedAddress.toLowerCase();
    const exactMatch = candidate.results.find((result) => {
      if (!result || typeof result !== 'object') {
        return false;
      }

      const address = typeof (result as AgentRecord).address === 'string' ? (result as AgentRecord).address : '';
      return address.toLowerCase() === normalizedRequestedAddress;
    });

    if (exactMatch && typeof exactMatch === 'object') {
      return exactMatch as AgentRecord;
    }

    const first = candidate.results[0];
    if (first && typeof first === 'object') {
      return first as AgentRecord;
    }
  }

  return null;
}

async function fetchAgentFromSearch(address: string, apiUrl: string): Promise<AgentRecord | null> {
  const response = await fetch(`${apiUrl}/agents?search=${encodeURIComponent(address)}`);
  if (!response.ok) {
    return null;
  }

  const payload = await parseJsonSafe(response);
  return extractAgentRecord(payload, address);
}

async function fetchAgentByAddress(address: string, apiUrl: string): Promise<AgentRecord | null> {
  const response = await fetch(`${apiUrl}/agents/${encodeURIComponent(address)}`);
  if (!response.ok) {
    return null;
  }

  const payload = await parseJsonSafe(response);
  return extractAgentRecord(payload, address);
}

export async function getAgent(address: string, options: AgentLookupOptions = {}): Promise<AgentRecord | null> {
  const normalizedAddress = address.trim();
  if (!normalizedAddress) {
    return null;
  }

  const apiUrl = normalizeApiUrl(options.apiUrl);

  try {
    const searchResult = await fetchAgentFromSearch(normalizedAddress, apiUrl);
    if (searchResult) {
      return searchResult;
    }
  } catch {
    // Fall through to the direct address lookup.
  }

  try {
    return await fetchAgentByAddress(normalizedAddress, apiUrl);
  } catch {
    return null;
  }
}

export async function getScore(address: string, options: AgentLookupOptions = {}): Promise<ScoreResult> {
  const agent = await getAgent(address, options);
  const score = normalizeScore(agent?.assayScore ?? 0);

  return {
    address: agent?.address ?? address,
    score,
    band: agent ? getBand(score) : 'UNKNOWN',
  };
}

export async function trustCheck(
  address: string,
  options: TrustCheckOptions = {},
): Promise<TrustCheckResult> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const agent = await getAgent(address, { apiUrl: options.apiUrl });

  if (!agent) {
    return {
      address,
      trusted: false,
      score: 0,
      maxScore: MAX_SCORE,
      stake: '0',
      capability: '',
      band: 'UNKNOWN',
      erc8004: false,
    };
  }

  const score = normalizeScore(agent.assayScore ?? 0);
  const band = getBand(score);

  return {
    address: agent.address ?? address,
    trusted: score >= threshold,
    score,
    maxScore: MAX_SCORE,
    stake: String(agent.stake ?? '0'),
    capability: String(agent.capability ?? ''),
    band,
    erc8004: agent.erc8004AgentId != null,
  };
}
