const express = require('express');
const { ethers } = require('ethers');
const { getEmbedding } = require('../embedder');
const store = require('../vectorStore');

const router = express.Router();

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function validateRegisterPayload(payload) {
  const { address, capability, stake, assayScore, name } = payload ?? {};

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
  if (name != null && typeof name !== 'string') {
    throw validationError('name must be a string when provided');
  }

  const trimmedName = typeof name === 'string' ? name.trim() : undefined;
  if (trimmedName && trimmedName.length > 64) {
    throw validationError('name must be 64 characters or fewer');
  }

  return {
    address: address.trim().toLowerCase(),
    capability: capability.trim(),
    stake,
    assayScore,
    ...(trimmedName ? { name: trimmedName } : {}),
  };
}

function isScoreOnlyUpdatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(payload, 'address') &&
    Object.prototype.hasOwnProperty.call(payload, 'assayScore') &&
    !Object.prototype.hasOwnProperty.call(payload, 'name') &&
    !Object.prototype.hasOwnProperty.call(payload, 'capability') &&
    !Object.prototype.hasOwnProperty.call(payload, 'stake')
  );
}

function buildScoreOnlyUpdatePayload(payload, existingEntry) {
  return validateRegisterPayload({
    address: payload.address,
    name: existingEntry?.metadata?.name,
    capability: existingEntry?.metadata?.capability,
    stake: existingEntry?.metadata?.stake,
    assayScore: payload.assayScore,
  });
}

async function registerAgentRecord(payload, options = {}) {
  const normalised = validateRegisterPayload(payload);
  const embeddingText = normalised.name
    ? `${normalised.name} ${normalised.capability}`
    : normalised.capability;
  const embedding = await getEmbedding(embeddingText);

  const metadata = {
    ...normalised,
    registeredAt: options.registeredAt ?? new Date().toISOString(),
  };

  await store.upsert(normalised.address, embedding, metadata);

  return {
    message: 'Agent registered successfully',
    agent: metadata,
    embeddingDim: embedding.length,
  };
}

router.post('/register', async (req, res) => {
  try {
    const rawAddress = typeof req.body?.address === 'string' ? req.body.address.trim().toLowerCase() : '';
    const existingEntry = rawAddress ? await store.get(rawAddress) : null;
    const isScoreOnlyUpdate = Boolean(existingEntry) && isScoreOnlyUpdatePayload(req.body);
    const payload = isScoreOnlyUpdate
      ? buildScoreOnlyUpdatePayload(req.body, existingEntry)
      : validateRegisterPayload(req.body);

    if (!isScoreOnlyUpdate) {
      const { signature } = req.body ?? {};

      if (!signature || typeof signature !== 'string') {
        return res.status(401).json({ error: 'Signature is required to prove wallet ownership.' });
      }

      const message = `Assay: register ${payload.address.toLowerCase()}`;
      let recoveredAddress;

      try {
        recoveredAddress = ethers.verifyMessage(message, signature);
      } catch {
        return res.status(401).json({ error: 'Invalid signature format.' });
      }

      if (recoveredAddress.toLowerCase() !== payload.address.toLowerCase()) {
        return res.status(401).json({ error: 'Signature does not match the provided address.' });
      }
    }

    const result = await registerAgentRecord(payload, {
      registeredAt: existingEntry?.metadata?.registeredAt,
    });
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

router.get('/:address', async (req, res) => {
  const entry = await store.get(req.params.address);

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
