const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema(
  {
    address: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String, default: '' },
    capability: { type: String, required: true },
    stake: { type: Number, required: true },
    assayScore: { type: Number, required: true, default: 0 },
    embedding: { type: [Number], required: true },
    erc8004AgentId: { type: Number, default: null },
    erc8004Name: { type: String, default: null },
    erc8004Description: { type: String, default: null },
    erc8004Image: { type: String, default: null },
    erc8004Owner: { type: String, default: null },
    registeredAt: { type: String, default: () => new Date().toISOString() },
  },
  {
    collection: 'agents',
  },
);

module.exports = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
