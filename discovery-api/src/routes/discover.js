const express = require('express');
const { getEmbedding } = require('../embedder');
const store = require('../vectorStore');

const router = express.Router();

function sortByTrust(left, right) {
  const scoreDelta = Number(right.assayScore ?? 0) - Number(left.assayScore ?? 0);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return Number(right.stake ?? 0) - Number(left.stake ?? 0);
}

function mapUnscoredResult(metadata) {
  return {
    address: metadata.address,
    capability: metadata.capability,
    assayScore: metadata.assayScore,
    stake: metadata.stake,
    registeredAt: metadata.registeredAt,
    name: metadata.name,
    erc8004AgentId: metadata.erc8004AgentId ?? null,
    erc8004Name: metadata.erc8004Name ?? null,
    erc8004Image: metadata.erc8004Image ?? null,
  };
}

router.post('/', async (req, res) => {
  let { query, topK } = req.body ?? {};
  const normalizedQuery = typeof query === 'string' ? query.trim() : '';

  if (topK === undefined || topK === null) {
    topK = 20;
  }
  if (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 100) {
    return res.status(400).json({ error: 'topK must be an integer in [1, 100]' });
  }

  if (!normalizedQuery) {
    const results = store.list().slice().sort(sortByTrust).slice(0, topK).map(mapUnscoredResult);

    return res.json({
      query: '',
      topK,
      count: results.length,
      results,
    });
  }

  try {
    const queryEmbedding = await getEmbedding(normalizedQuery);
    const results = store.search(queryEmbedding, topK, normalizedQuery);
    const { WEIGHTS } = store;

    return res.json({
      query: normalizedQuery,
      topK,
      count: results.length,
      scoring: {
        semanticWeight: WEIGHTS.SEMANTIC_WEIGHT,
        assayScoreWeight: WEIGHTS.SCORE_WEIGHT,
        stakeWeight: WEIGHTS.STAKE_WEIGHT,
      },
      results,
    });
  } catch (error) {
    console.error('[/discover] error:', error.message);
    return res.status(500).json({
      error: 'Discovery failed',
      details: error.message,
    });
  }
});

module.exports = router;
