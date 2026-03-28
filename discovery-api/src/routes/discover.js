// src/routes/discover.js
// POST /discover — natural language query → ranked agent matches
//
// Scoring: 60% semantic similarity + 25% Assay Score + 15% stake

const express = require('express');
const { getEmbedding } = require('../embedder');
const store = require('../vectorStore');

const router = express.Router();

router.post('/', async (req, res) => {
  let { query, topK } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query is required and must be a non-empty string' });
  }

  // Default topK = 20; accept anything in [1, 100]
  if (topK === undefined || topK === null) {
    topK = 20;
  }
  if (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 100) {
    return res.status(400).json({ error: 'topK must be an integer in [1, 100]' });
  }

  // ── Embed query + search ──────────────────────────────────────────────────
  try {
    const queryEmbedding = await getEmbedding(query.trim());
    const results        = store.search(queryEmbedding, topK, query.trim());
    const { WEIGHTS }    = store;

    return res.json({
      query:   query.trim(),
      topK,
      count:   results.length,
      scoring: {
        semanticWeight:   WEIGHTS.SEMANTIC_WEIGHT,
        assayScoreWeight: WEIGHTS.SCORE_WEIGHT,
        stakeWeight:      WEIGHTS.STAKE_WEIGHT,
      },
      results,
    });
  } catch (err) {
    console.error('[/discover] error:', err.message);
    return res.status(500).json({
      error:   'Discovery failed',
      details: err.message,
    });
  }
});

module.exports = router;
