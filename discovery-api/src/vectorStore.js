const { connectDB } = require('./db');
const Agent = require('./models/Agent');

const SEMANTIC_WEIGHT = 0.60;
const SCORE_WEIGHT = 0.25;
const STAKE_WEIGHT = 0.15;

const MAX_ASSAY_SCORE = 10_000;
const STAKE_REF = 1_000 * 1_000_000;

const _store = new Map();
let _mongoReady = null;

function _dot(a, b) {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    sum += a[index] * b[index];
  }
  return sum;
}

function _mag(vector) {
  return Math.sqrt(_dot(vector, vector));
}

function _cosine(a, b) {
  const denominator = _mag(a) * _mag(b);
  return denominator === 0 ? 0 : _dot(a, b) / denominator;
}

function _normStake(stake) {
  return Math.min(stake / STAKE_REF, 1.0);
}

function _normScore(assayScore) {
  return assayScore / MAX_ASSAY_SCORE;
}

function _round4(value) {
  return Math.round(value * 10_000) / 10_000;
}

async function ensureMongoReady() {
  if (_mongoReady !== null) {
    return _mongoReady;
  }

  _mongoReady = await connectDB();
  return _mongoReady;
}

async function load() {
  _store.clear();

  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return;
  }

  try {
    const agents = await Agent.find({}).lean();

    for (const agent of agents) {
      if (!agent || !Array.isArray(agent.embedding)) {
        continue;
      }

      const { embedding, ...metadata } = agent;
      _store.set(agent.address.toLowerCase(), {
        embedding,
        metadata,
      });
    }
  } catch (error) {
    _store.clear();
    console.warn('[vectorStore] Failed to hydrate agents from MongoDB, starting empty:', error.message);
  }
}

async function upsert(address, embedding, metadata) {
  _store.set(address.toLowerCase(), { embedding, metadata });

  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return;
  }

  await Agent.findOneAndUpdate(
    { address: address.toLowerCase() },
    {
      ...metadata,
      address: address.toLowerCase(),
      embedding,
    },
    { upsert: true, new: true },
  );
}

async function get(address) {
  const normalizedAddress = address.toLowerCase();
  const cached = _store.get(normalizedAddress);

  if (cached) {
    return cached;
  }

  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return null;
  }

  const agent = await Agent.findOne({ address: normalizedAddress }).lean();
  if (!agent || !Array.isArray(agent.embedding)) {
    return null;
  }

  const { embedding, ...metadata } = agent;
  const entry = { embedding, metadata };
  _store.set(normalizedAddress, entry);
  return entry;
}

function list() {
  return Array.from(_store.values()).map(({ metadata }) => metadata);
}

function search(queryEmbedding, topK = 20, queryText = '') {
  const results = [];
  const normalizedQuery = queryText.trim().toLowerCase();

  for (const [, { embedding, metadata }] of _store) {
    const sim = _cosine(queryEmbedding, embedding);
    const normScore = _normScore(metadata.assayScore);
    const normStake = _normStake(metadata.stake);

    const semPart = SEMANTIC_WEIGHT * sim;
    const scorePart = SCORE_WEIGHT * normScore;
    const stakePart = STAKE_WEIGHT * normStake;
    let combined = semPart + scorePart + stakePart;

    if (normalizedQuery && metadata.name && metadata.name.toLowerCase().includes(normalizedQuery)) {
      combined += 0.15;
    }

    results.push({
      address: metadata.address,
      capability: metadata.capability,
      assayScore: metadata.assayScore,
      stake: metadata.stake,
      registeredAt: metadata.registeredAt,
      name: metadata.name,
      similarity: _round4(sim),
      combinedScore: _round4(combined),
      scoreBreakdown: {
        semantic: _round4(semPart),
        assayScore: _round4(scorePart),
        stake: _round4(stakePart),
      },
    });
  }

  return results
    .sort((left, right) => right.combinedScore - left.combinedScore)
    .slice(0, topK);
}

function size() {
  return _store.size;
}

async function clear() {
  _store.clear();

  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return;
  }

  await Agent.deleteMany({});
}

module.exports = {
  upsert,
  get,
  list,
  search,
  size,
  clear,
  load,
  WEIGHTS: { SEMANTIC_WEIGHT, SCORE_WEIGHT, STAKE_WEIGHT },
};
