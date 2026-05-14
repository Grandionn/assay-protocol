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
  console.log(`[cleanupAllErc8004] Loaded .env from ${loadedEnvPath}`);
} else {
  console.warn('[cleanupAllErc8004] No .env file found in expected locations.');
}

const { connectDB } = require('../src/db');
const Agent = require('../src/models/Agent');

async function main() {
  const connected = await connectDB();

  if (!connected) {
    console.error('[cleanupAllErc8004] Missing or invalid MongoDB connection.');
    process.exit(1);
  }

  const result = await Agent.deleteMany({
    address: { $regex: '^erc8004-' },
  });

  console.log(`[cleanupAllErc8004] Deleted ${result.deletedCount} ERC-8004 agent(s).`);

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('[cleanupAllErc8004] Cleanup failed:', error);
  try {
    await mongoose.connection.close();
  } catch {}
  process.exit(1);
});
