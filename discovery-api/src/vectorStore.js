// src/vectorStore.js
// In-memory vector store with cosine-similarity search and trust-weighted ranking.
//
// Combined score formula (all components normalised to [0, 1]):
//
//   combinedScore = 0.60 Ã— cosineSimilarity
//                 + 0.25 Ã— (assayScore / 10_000)
//                 + 0.15 Ã— min(stake / STAKE_REF, 1)
//
// STAKE_REF is the stake amount that earns a full 1.0 normalised stake component.
// Set to 1 000 USDC (6-decimal units) â€” agents with â‰¥ 1 000 USDC staked score the maximum.

const SEMANTIC_WEIGHT = 0.60;
const SCORE_WEIGHT    = 0.25;
const STAKE_WEIGHT    = 0.15;

const MAX_ASSAY_SCORE  = 10_000;
const STAKE_REF        = 1_000 * 1_000_000; // 1 000 USDC in 6-decimal units

// address (lowercase) â†’ { embedding: number[], metadata: object }
const _store = new Map();

// â”€â”€ Math helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function _mag(v) {
  return Math.sqrt(_dot(v, v));
}

function _cosine(a, b) {
  const denom = _mag(a) * _mag(b);
  return denom === 0 ? 0 : _dot(a, b) / denom;
}

function _normStake(stake) {
  return Math.min(stake / STAKE_REF, 1.0);
}

function _normScore(assayScore) {
  return assayScore / MAX_ASSAY_SCORE;
}

function _round4(n) {
  return Math.round(n * 10_000) / 10_000;
}

// â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Insert or update an agent.
 * @param {string}   address    Ethereum address (case-insensitive)
 * @param {number[]} embedding  384-dim normalised vector
 * @param {object}   metadata   { address, capability, stake, assayScore, registeredAt }
 */
function upsert(address, embedding, metadata) {
  _store.set(address.toLowerCase(), { embedding, metadata });
}

/**
 * Retrieve a single agent entry, or null if not found.
 * @param {string} address
 * @returns {{ embedding: number[], metadata: object } | null}
 */
function get(address) {
  return _store.get(address.toLowerCase()) ?? null;
}

/**
 * Return metadata for every registered agent (no embeddings).
 * @returns {object[]}
 */
function list() {
  return Array.from(_store.values()).map(({ metadata }) => metadata);
}

/**
 * Ranked semantic + trust-signal search.
 *
 * @param {number[]} queryEmbedding  384-dim query vector
 * @param {number}   topK            Maximum results to return (default 10)
 * @returns {Array<{
 *   address:       string,
 *   capability:    string,
 *   assayScore:    number,
 *   stake:         number,
 *   similarity:    number,   // cosine similarity [0, 1]
 *   combinedScore: number,   // weighted combined score [0, 1]
 *   scoreBreakdown: { semantic: number, assayScore: number, stake: number }
 * }>}
 */
function search(queryEmbedding, topK = 10) {
  const results = [];

  for (const [, { embedding, metadata }] of _store) {
    const sim       = _cosine(queryEmbedding, embedding);
    const normScore = _normScore(metadata.assayScore);
    const normStake = _normStake(metadata.stake);

    const semPart   = SEMANTIC_WEIGHT * sim;
    const scorePart = SCORE_WEIGHT    * normScore;
    const stakePart = STAKE_WEIGHT    * normStake;
    const combined  = semPart + scorePart + stakePart;

    results.push({
      address:       metadata.address,
      capability:    metadata.capability,
      assayScore:    metadata.assayScore,
      stake:         metadata.stake,
      registeredAt:  metadata.registeredAt,
      name:          metadata.name,
      similarity:    _round4(sim),
      combinedScore: _round4(combined),
      scoreBreakdown: {
        semantic:   _round4(semPart),
        assayScore: _round4(scorePart),
        stake:      _round4(stakePart),
      },
    });
  }

  return results
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, topK);
}

/**
 * Returns the number of registered agents.
 * @returns {number}
 */
function size() {
  return _store.size;
}

/**
 * Remove all entries. Useful in tests and for clean reloads.
 */
function clear() {
  _store.clear();
}

module.exports = {
  upsert,
  get,
  list,
  search,
  size,
  clear,
  // Expose constants so routes can embed them in responses without importing separately
  WEIGHTS: { SEMANTIC_WEIGHT, SCORE_WEIGHT, STAKE_WEIGHT },
};
