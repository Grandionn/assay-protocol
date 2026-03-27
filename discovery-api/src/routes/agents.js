// src/routes/agents.js
// POST /agents/register  — embed capability text and upsert into vector store
// GET  /agents/:address  — return stored agent profile + embedding dimension

const express = require('express');
const { getEmbedding } = require('../embedder');
const store = require('../vectorStore');

const router = express.Router();

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateRegisterPayload(payload) {
  const { address, capability, stake, assayScore } = payload ?? {};

  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    throw validationError('address is required and must be a non-empty string');
  }
  if (!capability || typeof capability !== 'string' || capability.trim().length === 0) {
    throw validationError('capability is required and must be a non-empty string');
  }
  if (typeof stake !== 'number' || !Number.isFinite(stake) || stake < 0) {
    throw validationError('stake must be a non-negative finite number (USDC × 106)');
  }
  if (typeof assayScore !== 'number' || !Number.isFinite(assayScore) || assayScore < 0 || assayScore > 10_000) {
    throw validationError('assayScore must be a number in [0, 10000]');
  }

  return {
    address: address.trim().toLowerCase(),
    capability: capability.trim(),
    stake,
    assayScore,
  };
}

async function registerAgentRecord(payload, options = {}) {
  const normalised = validateRegisterPayload(payload);
  const embedding = await getEmbedding(normalised.capability);

  const metadata = {
    ...normalised,
    registeredAt: options.registeredAt ?? new Date().toISOString(),
  };

  store.upsert(normalised.address, embedding, metadata);

  return {
    message: 'Agent registered successfully',
    agent: metadata,
    embeddingDim: embedding.length,
  };
}

router.post('/register', async (req, res) => {
  try {
    const result = await registerAgentRecord(req.body);
    return res.status(201).json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }

    console.error('[/agents/register] embedding error:', err.message);
    return res.status(500).json({
      error: 'Failed to generate embedding',
      details: err.message,
    });
  }
});

router.get('/:address', (req, res) => {
  const entry = store.get(req.params.address);

  if (!entry) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  return res.json({
    agent: entry.metadata,
    embeddingDim: entry.embedding.length,
  });
});

module.exports = router;
module.exports.validateRegisterPayload = validateRegisterPayload;
module.exports.registerAgentRecord = registerAgentRecord;
