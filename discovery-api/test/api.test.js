// test/api.test.js
// Full test suite for the Assay Discovery API.
//
// Strategy: jest.mock('../src/embedder') replaces getEmbedding with a fast,
// deterministic stand-in so tests never download the real model.
// The mock returns a unit vector with a single hot dimension chosen by a
// simple string hash, giving non-trivial cosine similarities between texts
// that share keywords while keeping tests fully offline.

'use strict';

// ── Mock embedder (must be before any require of app / store) ─────────────────
//
// jest.mock() factories are hoisted to the top of the file and may only
// reference variables whose names begin with "mock" (or built-ins).
// All helper logic is therefore inlined inside the factory itself.

jest.mock('../src/embedder', () => {
  /**
   * Deterministic 384-dim unit-ish vector derived from text content.
   * Texts that share a keyword land near the same dimension → similarity > 0.
   * Completely different texts land on different dimensions → similarity ≈ 0.
   * Defined here (inside the factory) so it is never an out-of-scope reference.
   */
  function mockBuildVec(text) {
    const dim   = 384;
    const vec   = new Array(dim).fill(0);
    const lower = text.toLowerCase();

    // Primary dimension — djb2 hash of full text
    let h = 5381;
    for (let i = 0; i < lower.length; i++) {
      h = ((h << 5) + h) ^ lower.charCodeAt(i);
      h = h >>> 0;
    }
    const primary = h % dim;

    // Secondary dimension — hash of first word only (partial-match overlap)
    const firstWord = lower.split(/\s+/)[0] || '';
    let h2 = 0;
    for (let i = 0; i < firstWord.length; i++) {
      h2 = ((h2 << 5) + h2) ^ firstWord.charCodeAt(i);
      h2 = h2 >>> 0;
    }
    const secondary = h2 % dim;

    vec[primary]   = 0.8944; // ≈ sin(63.4°)
    vec[secondary] = 0.4472; // ≈ cos(63.4°)  → |vec| ≈ 1

    return vec;
  }

  return {
    getEmbedding:  jest.fn().mockImplementation(async (text) => mockBuildVec(text)),
    resetPipeline: jest.fn(),
  };
});

// ── Imports (after mock is registered) ───────────────────────────────────────

const request = require('supertest');
const app     = require('../src/app');
const store   = require('../src/vectorStore');
const { getEmbedding } = require('../src/embedder');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const AGENT_HIGH = {
  address:    '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01',
  capability: 'Solidity smart contract security auditing and vulnerability detection',
  stake:      800_000_000,  // 800 USDC → normStake = 0.8
  assayScore: 9000,         // normScore = 0.9
};

const AGENT_LOW = {
  address:    '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02',
  capability: 'Python data analysis machine learning pipelines',
  stake:      80_000_000,   // 80 USDC  → normStake = 0.08
  assayScore: 5000,         // normScore = 0.5
};

const AGENT_MID = {
  address:    '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC03',
  capability: 'Language translation localisation Spanish French German',
  stake:      300_000_000,  // 300 USDC → normStake = 0.3
  assayScore: 7000,         // normScore = 0.7
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function register(agent) {
  return request(app).post('/agents/register').send(agent);
}

async function discover(query, opts = {}) {
  return request(app).post('/discover').send({ query, ...opts });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  store.clear();
  getEmbedding.mockClear();
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /health
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('reflects the current number of indexed agents', async () => {
    expect((await request(app).get('/health')).body.agentsIndexed).toBe(0);
    await register(AGENT_HIGH);
    expect((await request(app).get('/health')).body.agentsIndexed).toBe(1);
    await register(AGENT_LOW);
    expect((await request(app).get('/health')).body.agentsIndexed).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /agents/register
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /agents/register', () => {

  describe('happy path', () => {
    it('returns 201 with agent metadata and embeddingDim', async () => {
      const res = await register(AGENT_HIGH);

      expect(res.status).toBe(201);
      expect(res.body.message).toMatch(/registered/i);
      expect(res.body.agent.address).toBe(AGENT_HIGH.address.toLowerCase());
      expect(res.body.agent.capability).toBe(AGENT_HIGH.capability);
      expect(res.body.agent.stake).toBe(AGENT_HIGH.stake);
      expect(res.body.agent.assayScore).toBe(AGENT_HIGH.assayScore);
      expect(res.body.agent.registeredAt).toBeDefined();
      expect(res.body.embeddingDim).toBe(384);
    });

    it('normalises address to lowercase', async () => {
      const res = await register({ ...AGENT_HIGH, address: AGENT_HIGH.address.toUpperCase() });
      expect(res.body.agent.address).toBe(AGENT_HIGH.address.toLowerCase());
    });

    it('trims whitespace from capability', async () => {
      const res = await register({ ...AGENT_HIGH, capability: '  padded capability  ' });
      expect(res.body.agent.capability).toBe('padded capability');
    });

    it('calls getEmbedding once with the trimmed capability', async () => {
      await register({ ...AGENT_HIGH, capability: '  Solidity auditing  ' });
      expect(getEmbedding).toHaveBeenCalledTimes(1);
      expect(getEmbedding).toHaveBeenCalledWith('Solidity auditing');
    });

    it('upserts an existing agent — returns 201 with updated fields', async () => {
      await register(AGENT_HIGH);
      const updated = { ...AGENT_HIGH, assayScore: 9999, stake: 999_000_000 };
      const res = await register(updated);
      expect(res.status).toBe(201);
      expect(res.body.agent.assayScore).toBe(9999);
      expect(res.body.agent.stake).toBe(999_000_000);
      // Still only one entry in the store
      expect(store.size()).toBe(1);
    });

    it('accepts assayScore of 0 (boundary)', async () => {
      const res = await register({ ...AGENT_HIGH, assayScore: 0 });
      expect(res.status).toBe(201);
    });

    it('accepts assayScore of 10000 (boundary)', async () => {
      const res = await register({ ...AGENT_HIGH, assayScore: 10_000 });
      expect(res.status).toBe(201);
    });

    it('accepts stake of 0', async () => {
      const res = await register({ ...AGENT_HIGH, stake: 0 });
      expect(res.status).toBe(201);
    });
  });

  describe('validation errors → 400', () => {
    it('rejects missing address', async () => {
      const { address: _, ...body } = AGENT_HIGH;
      const res = await request(app).post('/agents/register').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/address/i);
    });

    it('rejects empty string address', async () => {
      const res = await register({ ...AGENT_HIGH, address: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/address/i);
    });

    it('rejects missing capability', async () => {
      const { capability: _, ...body } = AGENT_HIGH;
      const res = await request(app).post('/agents/register').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/capability/i);
    });

    it('rejects empty string capability', async () => {
      const res = await register({ ...AGENT_HIGH, capability: '   ' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/capability/i);
    });

    it('rejects missing stake', async () => {
      const { stake: _, ...body } = AGENT_HIGH;
      const res = await request(app).post('/agents/register').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/stake/i);
    });

    it('rejects negative stake', async () => {
      const res = await register({ ...AGENT_HIGH, stake: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/stake/i);
    });

    it('rejects missing assayScore', async () => {
      const { assayScore: _, ...body } = AGENT_HIGH;
      const res = await request(app).post('/agents/register').send(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assayScore/i);
    });

    it('rejects assayScore > 10000', async () => {
      const res = await register({ ...AGENT_HIGH, assayScore: 10_001 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assayScore/i);
    });

    it('rejects assayScore < 0', async () => {
      const res = await register({ ...AGENT_HIGH, assayScore: -1 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/assayScore/i);
    });

    it('rejects non-numeric stake (string)', async () => {
      const res = await register({ ...AGENT_HIGH, stake: '500000000' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/stake/i);
    });
  });

  describe('embedder failure → 500', () => {
    it('returns 500 when getEmbedding throws', async () => {
      getEmbedding.mockRejectedValueOnce(new Error('model exploded'));
      const res = await register(AGENT_HIGH);
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/embedding/i);
      expect(res.body.details).toMatch(/model exploded/);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /agents/:address
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /agents/:address', () => {
  beforeEach(async () => {
    await register(AGENT_HIGH);
  });

  it('returns 200 with agent profile and embeddingDim after registration', async () => {
    const res = await request(app).get(`/agents/${AGENT_HIGH.address}`);
    expect(res.status).toBe(200);
    expect(res.body.agent.address).toBe(AGENT_HIGH.address.toLowerCase());
    expect(res.body.agent.capability).toBe(AGENT_HIGH.capability);
    expect(res.body.agent.assayScore).toBe(AGENT_HIGH.assayScore);
    expect(res.body.agent.stake).toBe(AGENT_HIGH.stake);
    expect(res.body.agent.registeredAt).toBeDefined();
    expect(res.body.embeddingDim).toBe(384);
  });

  it('is case-insensitive for the address path parameter', async () => {
    const upper = await request(app).get(`/agents/${AGENT_HIGH.address.toUpperCase()}`);
    const lower = await request(app).get(`/agents/${AGENT_HIGH.address.toLowerCase()}`);
    expect(upper.status).toBe(200);
    expect(lower.status).toBe(200);
    expect(upper.body.agent.address).toBe(lower.body.agent.address);
  });

  it('returns 404 for an address that was never registered', async () => {
    const res = await request(app).get('/agents/0xDEAD000000000000000000000000000000000000');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('reflects updated metadata after an upsert', async () => {
    await register({ ...AGENT_HIGH, assayScore: 9999 });
    const res = await request(app).get(`/agents/${AGENT_HIGH.address}`);
    expect(res.body.agent.assayScore).toBe(9999);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /discover
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /discover', () => {

  describe('happy path', () => {
    beforeEach(async () => {
      await register(AGENT_HIGH);
      await register(AGENT_LOW);
      await register(AGENT_MID);
    });

    it('returns 200 with well-formed response envelope', async () => {
      const res = await discover('smart contract audit');

      expect(res.status).toBe(200);
      expect(typeof res.body.query).toBe('string');
      expect(typeof res.body.topK).toBe('number');
      expect(typeof res.body.count).toBe('number');
      expect(res.body.scoring).toMatchObject({
        semanticWeight:   0.60,
        assayScoreWeight: 0.25,
        stakeWeight:      0.15,
      });
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('every result contains the required fields', async () => {
      const res = await discover('audit');
      expect(res.body.results.length).toBeGreaterThan(0);

      for (const r of res.body.results) {
        expect(r).toHaveProperty('address');
        expect(r).toHaveProperty('capability');
        expect(r).toHaveProperty('assayScore');
        expect(r).toHaveProperty('stake');
        expect(r).toHaveProperty('similarity');
        expect(r).toHaveProperty('combinedScore');
        expect(r).toHaveProperty('scoreBreakdown');
        expect(r.scoreBreakdown).toHaveProperty('semantic');
        expect(r.scoreBreakdown).toHaveProperty('assayScore');
        expect(r.scoreBreakdown).toHaveProperty('stake');
      }
    });

    it('scoreBreakdown components sum to combinedScore (within floating-point tolerance)', async () => {
      const res = await discover('test query');
      for (const r of res.body.results) {
        const { semantic, assayScore, stake } = r.scoreBreakdown;
        // Allow ±0.001 rounding tolerance from 4-decimal truncation
        expect(semantic + assayScore + stake).toBeCloseTo(r.combinedScore, 2);
      }
    });

    it('combinedScore and similarity are within [0, 1] for every result', async () => {
      const res = await discover('any query text');
      for (const r of res.body.results) {
        expect(r.combinedScore).toBeGreaterThanOrEqual(0);
        expect(r.combinedScore).toBeLessThanOrEqual(1.001); // tiny rounding slack
        expect(r.similarity).toBeGreaterThanOrEqual(0);
        expect(r.similarity).toBeLessThanOrEqual(1.001);
      }
    });

    it('results are in descending combinedScore order', async () => {
      const res = await discover('defi solidity smart contract');
      const scores = res.body.results.map(r => r.combinedScore);
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
      }
    });

    it('AGENT_HIGH outranks AGENT_LOW when all similarities are equal', async () => {
      // Make getEmbedding always return the exact same vector
      // so similarity is identical for every agent → ranking by score+stake only
      getEmbedding.mockResolvedValue(Array.from({ length: 384 }, (_, i) => (i === 0 ? 1 : 0)));

      store.clear();
      await register(AGENT_HIGH);
      await register(AGENT_LOW);

      const res = await discover('anything');
      expect(res.status).toBe(200);
      expect(res.body.results[0].address).toBe(AGENT_HIGH.address.toLowerCase());
      expect(res.body.results[1].address).toBe(AGENT_LOW.address.toLowerCase());
      // AGENT_HIGH combinedScore = 0.6 + 0.25*0.9 + 0.15*0.8 = 0.6+0.225+0.12 = 0.945
      // AGENT_LOW  combinedScore = 0.6 + 0.25*0.5 + 0.15*0.08= 0.6+0.125+0.012= 0.737
      expect(res.body.results[0].combinedScore).toBeGreaterThan(res.body.results[1].combinedScore);
    });

    it('respects the topK limit', async () => {
      const res = await discover('some capability', { topK: 2 });
      expect(res.status).toBe(200);
      expect(res.body.results.length).toBeLessThanOrEqual(2);
      expect(res.body.topK).toBe(2);
    });

    it('uses topK = 5 by default', async () => {
      // Register 7 agents
      for (let i = 4; i <= 10; i++) {
        await register({
          address:    `0x${'A'.repeat(39)}${i}`,
          capability: `Agent ${i} specialises in task ${i}`,
          stake:      100_000_000,
          assayScore: 5000,
        });
      }
      // Now 3 + 7 = 10 agents in store
      const res = await discover('task');
      expect(res.body.results.length).toBe(5);
      expect(res.body.topK).toBe(5);
    });

    it('returns count equal to results length', async () => {
      const res = await discover('query', { topK: 2 });
      expect(res.body.count).toBe(res.body.results.length);
    });

    it('echo query and topK back in the response', async () => {
      const res = await discover('  smart contract audit  ', { topK: 3 });
      expect(res.body.query).toBe('smart contract audit'); // trimmed
      expect(res.body.topK).toBe(3);
    });
  });

  describe('empty store', () => {
    it('returns 200 with empty results array', async () => {
      const res = await discover('smart contract');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });
  });

  describe('validation errors → 400', () => {
    it('rejects missing query body', async () => {
      const res = await request(app).post('/discover').send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/query/i);
    });

    it('rejects empty string query', async () => {
      const res = await discover('   ');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/query/i);
    });

    it('rejects topK = 0', async () => {
      const res = await discover('test', { topK: 0 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/topK/i);
    });

    it('rejects topK > 100', async () => {
      const res = await discover('test', { topK: 101 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/topK/i);
    });

    it('rejects non-integer topK', async () => {
      const res = await discover('test', { topK: 3.5 });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/topK/i);
    });

    it('rejects string topK', async () => {
      const res = await discover('test', { topK: '5' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/topK/i);
    });
  });

  describe('embedder failure → 500', () => {
    it('returns 500 when query embedding throws', async () => {
      getEmbedding.mockRejectedValueOnce(new Error('GPU out of memory'));
      const res = await discover('smart contracts');
      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/discovery failed/i);
      expect(res.body.details).toMatch(/GPU out of memory/);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// vectorStore unit tests
// ═════════════════════════════════════════════════════════════════════════════

describe('vectorStore', () => {
  const mkVec = (hotDim) => {
    const v = new Array(384).fill(0);
    v[hotDim] = 1;
    return v;
  };

  it('upsert + get round-trip', () => {
    store.upsert('0xABC', mkVec(0), { address: '0xabc', capability: 'test', stake: 100, assayScore: 5000, registeredAt: '' });
    const entry = store.get('0xABC'); // case-insensitive
    expect(entry).not.toBeNull();
    expect(entry.metadata.capability).toBe('test');
  });

  it('get returns null for unknown address', () => {
    expect(store.get('0xUNKNOWN')).toBeNull();
  });

  it('list returns metadata for every registered entry', () => {
    store.upsert('0xA1', mkVec(0), { address: '0xa1', capability: 'c1', stake: 100, assayScore: 5000, registeredAt: '' });
    store.upsert('0xA2', mkVec(1), { address: '0xa2', capability: 'c2', stake: 200, assayScore: 6000, registeredAt: '' });
    expect(store.list()).toHaveLength(2);
  });

  it('size() reflects current entry count', () => {
    expect(store.size()).toBe(0);
    store.upsert('0xA1', mkVec(0), { address: '0xa1', capability: 'c1', stake: 100, assayScore: 5000, registeredAt: '' });
    expect(store.size()).toBe(1);
  });

  it('clear() empties the store', () => {
    store.upsert('0xA1', mkVec(0), { address: '0xa1', capability: 'c1', stake: 100, assayScore: 5000, registeredAt: '' });
    store.clear();
    expect(store.size()).toBe(0);
  });

  it('search ranks by combinedScore descending', () => {
    // Two agents with the same embedding (similarity 1.0) — only score+stake differs
    const vec = mkVec(0);
    store.upsert('0xHIGH', vec, { address: '0xhigh', capability: 'h', stake: 1_000_000_000, assayScore: 10_000, registeredAt: '' });
    store.upsert('0xLOW',  vec, { address: '0xlow',  capability: 'l', stake: 0,             assayScore: 0,      registeredAt: '' });

    const results = store.search(vec, 10);
    expect(results[0].address).toBe('0xhigh');
    expect(results[1].address).toBe('0xlow');
    expect(results[0].combinedScore).toBeGreaterThan(results[1].combinedScore);
  });

  it('cosine similarity is 1.0 for identical vectors', () => {
    const vec = mkVec(42);
    store.upsert('0xSAME', vec, { address: '0xsame', capability: 'x', stake: 100, assayScore: 5000, registeredAt: '' });
    const results = store.search(vec, 1);
    expect(results[0].similarity).toBe(1);
  });

  it('cosine similarity is 0 for orthogonal vectors', () => {
    store.upsert('0xORT', mkVec(0), { address: '0xort', capability: 'x', stake: 100, assayScore: 5000, registeredAt: '' });
    const results = store.search(mkVec(1), 10); // query is orthogonal to stored vector
    expect(results[0].similarity).toBe(0);
  });

  it('search respects the topK limit', () => {
    for (let i = 0; i < 5; i++) {
      store.upsert(`0xX${i}`, mkVec(i), { address: `0xx${i}`, capability: `cap${i}`, stake: 100, assayScore: 5000, registeredAt: '' });
    }
    expect(store.search(mkVec(0), 3)).toHaveLength(3);
  });

  it('search returns empty array when store is empty', () => {
    expect(store.search(mkVec(0), 5)).toHaveLength(0);
  });

  it('stake above STAKE_REF is clamped to normStake = 1.0', () => {
    const vec = mkVec(0);
    // 2 000 USDC stake — should be clamped to 1.0 (STAKE_REF = 1 000 USDC)
    store.upsert('0xRICH', vec, { address: '0xrich', capability: 'rich', stake: 2_000_000_000, assayScore: 0, registeredAt: '' });
    // Same as 1 000 USDC for scoring purposes
    store.upsert('0xREF',  vec, { address: '0xref',  capability: 'ref',  stake: 1_000_000_000, assayScore: 0, registeredAt: '' });

    const results = store.search(vec, 10);
    const rich = results.find(r => r.address === '0xrich');
    const ref  = results.find(r => r.address === '0xref');
    // Both have normStake clamped to 1.0, so stake component must be equal
    expect(rich.scoreBreakdown.stake).toBe(ref.scoreBreakdown.stake);
    expect(rich.combinedScore).toBe(ref.combinedScore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Seed data sanity checks (no HTTP, uses SAMPLE_AGENTS directly)
// ═════════════════════════════════════════════════════════════════════════════

describe('SAMPLE_AGENTS', () => {
  const { SAMPLE_AGENTS } = require('../scripts/seed');

  it('exports exactly 10 agents', () => {
    expect(SAMPLE_AGENTS).toHaveLength(10);
  });

  it('every agent has required fields with valid types', () => {
    for (const a of SAMPLE_AGENTS) {
      expect(typeof a.address).toBe('string');
      expect(typeof a.capability).toBe('string');
      expect(typeof a.stake).toBe('number');
      expect(typeof a.assayScore).toBe('number');
      expect(a.capability.length).toBeGreaterThan(20);
      expect(a.stake).toBeGreaterThan(0);
      expect(a.assayScore).toBeGreaterThanOrEqual(0);
      expect(a.assayScore).toBeLessThanOrEqual(10_000);
    }
  });

  it('all addresses are unique', () => {
    const addrs = SAMPLE_AGENTS.map(a => a.address.toLowerCase());
    expect(new Set(addrs).size).toBe(SAMPLE_AGENTS.length);
  });

  it('capabilities cover diverse domains', () => {
    const combined = SAMPLE_AGENTS.map(a => a.capability.toLowerCase()).join(' ');
    const domains = ['solidity', 'data', 'image', 'translation', 'defi', 'scraping', 'natural language', 'analytics', 'documentation', 'video'];
    for (const domain of domains) {
      expect(combined).toContain(domain);
    }
  });

  it('seedDirect registers all agents into the store via getEmbedding', async () => {
    const { seedDirect } = require('../scripts/seed');
    const count = await seedDirect();
    expect(count).toBe(10);
    expect(store.size()).toBe(10);
    expect(getEmbedding).toHaveBeenCalledTimes(10);
  });
});
