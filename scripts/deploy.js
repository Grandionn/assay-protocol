// scripts/deploy.js
// Deploys MockUSDC (testnet only), AssayStakeRegistry, AssayReputation, AssayEscrow.
// Wires up permissions between the three core contracts.
// Saves deployed addresses to deployments/<network>.json.
//
// Usage:
//   npx hardhat run scripts/deploy.js --network baseSepolia
//   npx hardhat run scripts/deploy.js --network base
//
// Required .env variables:
//   PRIVATE_KEY          — deployer wallet private key (no 0x prefix)
//   BASE_SEPOLIA_RPC_URL — (optional, falls back to public RPC)
//   BASESCAN_API_KEY     — (optional, for contract verification)

require("dotenv").config();
const hre  = require("hardhat");
const fs   = require("fs");
const path = require("path");

// ─── Network config ─────────────────────────────────────────────────────────
// usdc: null means deploy MockUSDC; a string means use that canonical address.
const NETWORK_CONFIG = {
  baseSepolia: {
    usdc:         null,          // will deploy MockUSDC
    minimumStake: 10_000_000n,   // 10 USDC (6 decimals)
  },
  base: {
    usdc:         "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // canonical USDC on Base mainnet
    minimumStake: 10_000_000n,   // 10 USDC (6 decimals)
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

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`  ETH bal  : ${hre.ethers.formatEther(balance)} ETH\n`);

  // The treasury is the deployer for now — update via setTreasury() post-deploy
  const treasury = deployer.address;

  // ── 0. Deploy MockUSDC (testnet only) ────────────────────────────────────
  let usdcAddress = config.usdc;

  if (!usdcAddress) {
    console.log("0/4  Deploying MockUSDC...");
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`     ✓ MockUSDC           : ${usdcAddress}`);

    // Mint 1,000,000 USDC to deployer (6 decimals → 1_000_000 * 1e6)
    const mintAmount = 1_000_000n * 1_000_000n; // 1e12
    const mintTx = await mockUsdc.mint(deployer.address, mintAmount);
    await mintTx.wait();
    console.log(`     ✓ Minted 1,000,000 USDC to ${deployer.address}\n`);
  } else {
    console.log(`     Using canonical USDC : ${usdcAddress}\n`);
  }

  console.log(`  Min stake: ${config.minimumStake} (${Number(config.minimumStake) / 1e6} USDC)`);

  // ── 1. Deploy AssayStakeRegistry ─────────────────────────────────────────
  let stakeRegistryAddress = config.stakeRegistry || null;
  if (!stakeRegistryAddress) {
    console.log("1/3  Deploying AssayStakeRegistry...");
    const StakeRegistry = await hre.ethers.getContractFactory("AssayStakeRegistry");
    const stakeRegistry = await StakeRegistry.deploy(usdcAddress, config.minimumStake, treasury);
    await stakeRegistry.waitForDeployment();
    stakeRegistryAddress = await stakeRegistry.getAddress();
    console.log(`     ✓ AssayStakeRegistry : ${stakeRegistryAddress}`);
  } else {
    console.log(`     Using existing AssayStakeRegistry : ${stakeRegistryAddress}`);
  }

  // ── 2. Deploy AssayReputation ────────────────────────────────────────────
  let reputationAddress = config.reputation || null;
  if (!reputationAddress) {
    console.log("2/3  Deploying AssayReputation...");
    const Reputation = await hre.ethers.getContractFactory("AssayReputation");
    const reputation = await Reputation.deploy(stakeRegistryAddress);
    await reputation.waitForDeployment();
    reputationAddress = await reputation.getAddress();
    console.log(`     ✓ AssayReputation    : ${reputationAddress}`);
  } else {
    console.log(`     Using existing AssayReputation : ${reputationAddress}`);
  }

  // ── 3. Deploy AssayEscrow ────────────────────────────────────────────────
  let escrowAddress = config.escrow || null;
  if (!escrowAddress) {
    console.log("3/3  Deploying AssayEscrow...");
    const Escrow = await hre.ethers.getContractFactory("AssayEscrow");
    const escrow = await Escrow.deploy(
      usdcAddress,
      stakeRegistryAddress,
      reputationAddress,
      treasury
    );
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    console.log(`     ✓ AssayEscrow        : ${escrowAddress}`);
  } else {
    console.log(`     Using existing AssayEscrow : ${escrowAddress}`);
  }

  // ── 4. Wire permissions ──────────────────────────────────────────────────
  console.log("\nWiring permissions...");

  // Attach to contracts (handles both freshly-deployed and pre-existing)
  const stakeRegistryContract = await hre.ethers.getContractAt("AssayStakeRegistry", stakeRegistryAddress);
  const reputationContract    = await hre.ethers.getContractAt("AssayReputation",    reputationAddress);

  // StakeRegistry must trust the Escrow to call slash() and recordEarnings()
  const authEscrowTx = await stakeRegistryContract.authorizeEscrow(escrowAddress);
  await authEscrowTx.wait();
  console.log(`  ✓ StakeRegistry.authorizeEscrow(${escrowAddress})`);

  // Reputation must trust the Escrow to call recordOutcome()
  const authCallerTx = await reputationContract.authorizeCaller(escrowAddress);
  await authCallerTx.wait();
  console.log(`  ✓ Reputation.authorizeCaller(${escrowAddress})`);

  // ── 4b. Verify wiring by reading authorization state back ────────────────
  console.log("\nVerifying wiring...");

  const escrowAuthorized = await _waitForCondition(
    () => stakeRegistryContract.isAuthorizedEscrow(escrowAddress),
    "StakeRegistry escrow authorization"
  );
  const callerAuthorized = await _waitForCondition(
    () => reputationContract.isAuthorizedCaller(escrowAddress),
    "Reputation caller authorization"
  );

  if (!escrowAuthorized) throw new Error("WIRING FAILED: Escrow not authorized in StakeRegistry");
  if (!callerAuthorized)  throw new Error("WIRING FAILED: Escrow not authorized as caller in Reputation");

  console.log(`  ✓ StakeRegistry.isAuthorizedEscrow(escrow) = ${escrowAuthorized}`);
  console.log(`  ✓ Reputation.isAuthorizedCaller(escrow)    = ${callerAuthorized}`);

  // ── 5. Summary ───────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ASSAY PROTOCOL — DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Network            : ${network}`);
  if (!config.usdc) {
    console.log(`  MockUSDC           : ${usdcAddress}`);
  }
  console.log(`  AssayStakeRegistry : ${stakeRegistryAddress}`);
  console.log(`  AssayReputation    : ${reputationAddress}`);
  console.log(`  AssayEscrow        : ${escrowAddress}`);
  console.log(`  Treasury           : ${treasury}  ← update with setTreasury()`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 6. Save addresses to deployments/<network>.json ──────────────────────
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network,
    deployedAt: new Date().toISOString(),
    deployer:   deployer.address,
    contracts: {
      ...(config.usdc ? {} : { MockUSDC: usdcAddress }),
      AssayStakeRegistry: stakeRegistryAddress,
      AssayReputation:    reputationAddress,
      AssayEscrow:        escrowAddress,
    },
    treasury,
  };

  const outPath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
  console.log(`  Addresses saved to deployments/${network}.json`);

  // ── 6b. Write DEPLOYED_ADDRESSES.md to project root ──────────────────────
  const mdLines = [
    `# Assay Protocol — Deployed Addresses`,
    ``,
    `**Network:** ${network}`,
    `**Deployed at:** ${deploymentData.deployedAt}`,
    `**Deployer:** \`${deployer.address}\``,
    `**Treasury:** \`${treasury}\``,
    ``,
    `## Contract Addresses`,
    ``,
    `| Contract | Address |`,
    `|---|---|`,
    ...(config.usdc
      ? [`| USDC | \`${usdcAddress}\` |`]
      : [`| MockUSDC | \`${usdcAddress}\` |`]),
    `| AssayStakeRegistry | \`${stakeRegistryAddress}\` |`,
    `| AssayReputation | \`${reputationAddress}\` |`,
    `| AssayEscrow | \`${escrowAddress}\` |`,
    ``,
    `## Wiring`,
    ``,
    `| Check | Result |`,
    `|---|---|`,
    `| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | ✅ true |`,
    `| Reputation.isAuthorizedCaller(AssayEscrow) | ✅ true |`,
    ``,
    `## Notes`,
    ``,
    `- Treasury is currently set to the deployer address. Update with \`setTreasury()\` before production use.`,
    `- MockUSDC is for Base Sepolia testnet only; mainnet deployment uses canonical USDC at \`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\`.`,
  ];
  const mdFilename = network === "base" ? "DEPLOYED_ADDRESSES_MAINNET.md" : "DEPLOYED_ADDRESSES.md";
  const mdPath = path.join(__dirname, "..", mdFilename);
  fs.writeFileSync(mdPath, mdLines.join("\n") + "\n");
  console.log(`  Addresses saved to ${mdFilename}`);

  // ── 7. Verify on Basescan (optional) ─────────────────────────────────────
  if (process.env.BASESCAN_API_KEY) {
    console.log("\nVerifying contracts on Basescan...");
    if (!config.usdc) {
      await _verify(usdcAddress, []);
    }
    await _verify(stakeRegistryAddress, [usdcAddress, config.minimumStake, treasury]);
    await _verify(reputationAddress,    [stakeRegistryAddress]);
    await _verify(escrowAddress,        [usdcAddress, stakeRegistryAddress, reputationAddress, treasury]);
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

async function _waitForCondition(readFn, label, attempts = 5, delayMs = 3000) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await readFn();
    if (result) {
      return result;
    }

    if (index < attempts - 1) {
      console.warn(`  Waiting for ${label}... retry ${index + 2}/${attempts}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
