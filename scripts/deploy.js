// scripts/deploy.js
// Deploys AssayStakeRegistry, AssayReputation, AssayEscrow to Base Sepolia (or Base mainnet).
// After deployment, wires up permissions between the three contracts.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network baseSepolia
//   npx hardhat run scripts/deploy.js --network base
//
// Required .env variables:
//   PRIVATE_KEY         — deployer wallet private key (no 0x prefix)
//   BASE_SEPOLIA_RPC_URL — (optional, falls back to public RPC)
//   BASESCAN_API_KEY    — (optional, for contract verification)

require("dotenv").config();
const hre = require("hardhat");

// ─── Network config ────────────────────────────────────────────────────────────
const NETWORK_CONFIG = {
  baseSepolia: {
    // Canonical USDC on Base Sepolia (Circle-deployed)
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    // Minimum stake: 10 USDC (6 decimals)
    minimumStake: 10_000_000n,
  },
  base: {
    // Canonical USDC on Base mainnet
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    // Minimum stake: 100 USDC (6 decimals)
    minimumStake: 100_000_000n,
  },
};

async function main() {
  const network = hre.network.name;
  const config  = NETWORK_CONFIG[network];

  if (!config) {
    throw new Error(
      `No config for network "${network}". Add it to NETWORK_CONFIG in deploy.js.`
    );
  }

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying Assay Protocol to ${network}`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(`  USDC     : ${config.usdc}`);
  console.log(`  Min stake: ${config.minimumStake} (${Number(config.minimumStake) / 1e6} USDC)`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  ETH bal  : ${hre.ethers.formatEther(balance)} ETH\n`);

  // The treasury is the deployer for now — update via setTreasury() post-deploy
  const treasury = deployer.address;

  // ── 1. Deploy AssayStakeRegistry ──────────────────────────────────────────
  console.log("1/3  Deploying AssayStakeRegistry...");
  const StakeRegistry = await hre.ethers.getContractFactory("AssayStakeRegistry");
  const stakeRegistry = await StakeRegistry.deploy(config.usdc, config.minimumStake, treasury);
  await stakeRegistry.waitForDeployment();
  const stakeRegistryAddress = await stakeRegistry.getAddress();
  console.log(`     ✓ AssayStakeRegistry : ${stakeRegistryAddress}`);

  // ── 2. Deploy AssayReputation ─────────────────────────────────────────────
  console.log("2/3  Deploying AssayReputation...");
  const Reputation = await hre.ethers.getContractFactory("AssayReputation");
  const reputation = await Reputation.deploy(stakeRegistryAddress);
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log(`     ✓ AssayReputation    : ${reputationAddress}`);

  // ── 3. Deploy AssayEscrow ─────────────────────────────────────────────────
  console.log("3/3  Deploying AssayEscrow...");
  const Escrow = await hre.ethers.getContractFactory("AssayEscrow");
  const escrow = await Escrow.deploy(
    config.usdc,
    stakeRegistryAddress,
    reputationAddress,
    treasury
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log(`     ✓ AssayEscrow        : ${escrowAddress}`);

  // ── 4. Wire permissions ───────────────────────────────────────────────────
  console.log("\nWiring permissions...");

  // StakeRegistry must trust the Escrow to call slash() and recordEarnings()
  const authEscrowTx = await stakeRegistry.authorizeEscrow(escrowAddress);
  await authEscrowTx.wait();
  console.log(`  ✓ StakeRegistry.authorizeEscrow(${escrowAddress})`);

  // Reputation must trust the Escrow to call recordOutcome()
  const authCallerTx = await reputation.authorizeCaller(escrowAddress);
  await authCallerTx.wait();
  console.log(`  ✓ Reputation.authorizeCaller(${escrowAddress})`);

  // ── 5. Summary ────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ASSAY PROTOCOL — DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network            : ${network}`);
  console.log(`  AssayStakeRegistry : ${stakeRegistryAddress}`);
  console.log(`  AssayReputation    : ${reputationAddress}`);
  console.log(`  AssayEscrow        : ${escrowAddress}`);
  console.log(`  Treasury           : ${treasury}  ← update with setTreasury()`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 6. Verify on Basescan (optional) ─────────────────────────────────────
  if (process.env.BASESCAN_API_KEY) {
    console.log("Verifying contracts on Basescan...");
    await _verify(stakeRegistryAddress, [config.usdc, config.minimumStake, treasury]);
    await _verify(reputationAddress,    [stakeRegistryAddress]);
    await _verify(escrowAddress,        [config.usdc, stakeRegistryAddress, reputationAddress, treasury]);
  } else {
    console.log("Skipping Basescan verification (BASESCAN_API_KEY not set).");
  }
}

async function _verify(address, constructorArgs) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`  ✓ Verified ${address}`);
  } catch (err) {
    // Already verified or other non-fatal error
    console.warn(`  ⚠ Could not verify ${address}: ${err.message}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
