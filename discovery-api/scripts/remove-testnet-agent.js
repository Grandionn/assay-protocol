const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ENV_PATH_CANDIDATES = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

let loadedEnvPath = null;
for (const envPath of ENV_PATH_CANDIDATES) {
  if (!fs.existsSync(envPath)) {
    continue;
  }

  require('dotenv').config({ path: envPath });
  loadedEnvPath = envPath;
  break;
}

if (loadedEnvPath) {
  console.log(`[remove-testnet-agent] Loaded .env from ${loadedEnvPath}`);
} else {
  console.warn('[remove-testnet-agent] No .env file found in expected locations.');
}

const { connectDB } = require('../src/db');
const Agent = require('../src/models/Agent');

const TARGET_NAME = 'Securify v4';
const TARGET_ADDRESS = '0x328f5a2169d803211dc24ac6576fbe2545a9b51e';

async function main() {
  const connected = await connectDB();

  if (!connected) {
    console.error('[remove-testnet-agent] Missing or invalid MongoDB connection.');
    process.exit(1);
  }

  const targetFilter = {
    erc8004AgentId: null,
    $or: [{ name: TARGET_NAME }, { address: TARGET_ADDRESS }],
  };

  const existingMatches = await Agent.find(targetFilter)
    .select({ address: 1, name: 1, capability: 1, assayScore: 1, stake: 1, registeredAt: 1, erc8004AgentId: 1 })
    .lean();

  if (existingMatches.length > 0) {
    console.log('[remove-testnet-agent] Matching document(s) queued for deletion:');
    console.log(JSON.stringify(existingMatches, null, 2));
  } else {
    console.log('[remove-testnet-agent] No matching non-ERC-8004 testnet agent found. Nothing to delete.');
  }

  const otherNonErc8004Agents = await Agent.find({
    erc8004AgentId: null,
    address: { $ne: TARGET_ADDRESS },
    name: { $ne: TARGET_NAME },
  })
    .select({ address: 1, name: 1, capability: 1, assayScore: 1, stake: 1, registeredAt: 1 })
    .lean();

  if (otherNonErc8004Agents.length > 0) {
    console.log('[remove-testnet-agent] Other non-ERC-8004 agents found for manual review (not deleted):');
    console.log(JSON.stringify(otherNonErc8004Agents, null, 2));
  } else {
    console.log('[remove-testnet-agent] No other non-ERC-8004 agents found.');
  }

  if (existingMatches.length > 0) {
    const deletionResult = await Agent.deleteMany(targetFilter);
    console.log(`[remove-testnet-agent] Deleted ${deletionResult.deletedCount} matching document(s).`);
  }

  console.log(
    '[remove-testnet-agent] Note: the discovery vector store is hydrated from MongoDB on startup, so restart the discovery API service to clear any in-memory copy.',
  );

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('[remove-testnet-agent] Cleanup failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
