const fs = require('fs');
const path = require('path');

const SEMANTIC_WEIGHT = 0.60;
const SCORE_WEIGHT = 0.25;
const STAKE_WEIGHT = 0.15;

const MAX_ASSAY_SCORE = 10_000;
const STAKE_REF = 1_000 * 1_000_000;

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'agents.json');

const _store = new Map();

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

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const payload = Object.fromEntries(
      Array.from(_store.entries()).map(([address, entry]) => [address, entry]),
    );
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.warn('[vectorStore] Failed to persist agents:', error.message);
  }
}

function load() {
  _store.clear();

  if (!fs.existsSync(DATA_FILE)) {
    return;
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    for (const [address, entry] of Object.entries(parsed ?? {})) {
      if (!entry || !Array.isArray(entry.embedding) || typeof entry.metadata !== 'object' || entry.metadata == null) {
        continue;
      }

      _store.set(address.toLowerCase(), {
        embedding: entry.embedding,
        metadata: entry.metadata,
      });
    }
  } catch (error) {
    _store.clear();
    console.warn('[vectorStore] Failed to load persisted agents, starting empty:', error.message);
  }
}

function upsert(address, embedding, metadata) {
  _store.set(address.toLowerCase(), { embedding, metadata });
  save();
}

function get(address) {
  return _store.get(address.toLowerCase()) ?? null;
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

function clear() {
  _store.clear();
  save();
}

module.exports = {
  upsert,
  get,
  list,
  search,
  size,
  clear,
  load,
  save,
  DATA_DIR,
  DATA_FILE,
  WEIGHTS: { SEMANTIC_WEIGHT, SCORE_WEIGHT, STAKE_WEIGHT },
};
