// src/routes/agents.js
// POST /agents/register  — embed capability text and upsert into vector store
// GET  /agents/:address  — return stored agent profile + embedding dimension

const express = require('express');
const { getEmbedding } = require('../embedder');
const store = require('../vectorStore');

const router = express.Router();

// ── POST /agents/register ─────────────────────────────────────────────────────

router.post('/register', async (req, res) => {
  const { address, capability, stake, assayScore } = req.body;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return res.status(400).json({ error: 'address is required and must be a non-empty string' });
  }
  if (!capability || typeof capability !== 'string' || capability.trim().length === 0) {
    return res.status(400).json({ error: 'capability is required and must be a non-empty string' });
  }
  if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 0) {
    return res.status(400).json({ error: 'stake must be a non-negative finite number (USDC × 10⁶)' });
  }
  if (typeof assayScore !== 'number' || !Number.isFinite(assayScore) ||
      assayScore < 0 || assayScore > 10_000) {
    return res.status(400).json({ error: 'assayScore must be a number in [0, 10000]' });
  }

  // ── Embed + store ─────────────────────────────────────────────────────────
  try {
    const embedding = await getEmbedding(capability.trim());

    const metadata = {
      address:      address.trim().toLowerCase(),
      capability:   capability.trim(),
      stake,
      assayScore,
      registeredAt: new Date().toISOString(),
    };

    store.upsert(address, embedding, metadata);

    return res.status(201).json({
      message:      'Agent registered successfully',
      agent:        metadata,
      embeddingDim: embedding.length,
    });
  } catch (err) {
    console.error('[/agents/register] embedding error:', err.message);
    return res.status(500).json({
      error:   'Failed to generate embedding',
      details: err.message,
    });
  }
});

// ── GET /agents/:address ──────────────────────────────────────────────────────

router.get('/:address', (req, res) => {
  const entry = store.get(req.params.address);

  if (!entry) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json({
    agent:        entry.metadata,
    embeddingDim: entry.embedding.length,
  });
});

module.exports = router;
