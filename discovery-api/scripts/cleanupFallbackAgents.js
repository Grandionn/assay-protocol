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
  console.log(`[cleanupFallbackAgents] Loaded .env from ${loadedEnvPath}`);
} else {
  console.warn('[cleanupFallbackAgents] No .env file found in expected locations.');
}

const { connectDB } = require('../src/db');
const Agent = require('../src/models/Agent');

async function main() {
  const connected = await connectDB();

  if (!connected) {
    console.error('[cleanupFallbackAgents] Missing or invalid MongoDB connection.');
    process.exit(1);
  }

  const result = await Agent.deleteMany({
    address: { $regex: '^erc8004-' },
    capability: 'ERC-8004 registered agent on Base',
  });

  console.log(`[cleanupFallbackAgents] Deleted ${result.deletedCount} fallback ERC-8004 agent(s).`);

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('[cleanupFallbackAgents] Cleanup failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
