const express = require('express');
const mongoose = require('mongoose');
const { connectDB } = require('../db');

const router = express.Router();

function validationError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

async function getTransactionsCollection() {
  const connected = await connectDB();
  if (!connected || !mongoose.connection.db) {
    return null;
  }

  return mongoose.connection.db.collection('transactions');
}

router.post('/record', async (req, res) => {
  try {
    const {
      agentAddress,
      txHash,
      method,
      label,
      amount,
      escrowId,
      timestamp,
    } = req.body ?? {};

    if (!agentAddress || typeof agentAddress !== 'string') {
      throw validationError('agentAddress is required');
    }

    if (!txHash || typeof txHash !== 'string') {
      throw validationError('txHash is required');
    }

    const collection = await getTransactionsCollection();
    if (!collection) {
      return res.status(503).json({ error: 'Transaction store unavailable' });
    }

    await collection.insertOne({
      agentAddress: agentAddress.trim().toLowerCase(),
      txHash: txHash.trim(),
      method: typeof method === 'string' ? method : '',
      label: typeof label === 'string' ? label : '',
      amount: amount != null ? String(amount) : '0',
      ...(escrowId != null && escrowId !== '' ? { escrowId: String(escrowId) } : {}),
      timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : Math.floor(Date.now() / 1000),
    });

    return res.status(201).json({ success: true });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Failed to record transaction' });
  }
});

router.get('/:address', async (req, res) => {
  try {
    const address = req.params.address?.trim().toLowerCase();
    const collection = await getTransactionsCollection();

    if (!collection || !address) {
      return res.json({ transactions: [] });
    }

    const transactions = await collection
      .find({ agentAddress: address })
      .sort({ timestamp: -1 })
      .toArray();

    return res.json({
      transactions: transactions.map(({ _id, ...transaction }) => transaction),
    });
  } catch {
    return res.json({ transactions: [] });
  }
});

module.exports = router;
