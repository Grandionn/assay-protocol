require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const NETWORK_CONFIG = {
  baseSepolia: {
    usdc: null,
    minimumStake: 10_000_000n,
  },
  base: {
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    minimumStake: 10_000_000n,
    stakeRegistry: "0x2589D201414A4658eFED96ea34841fBE31416bb8",
    reputation: "0x713F6aa4D833A1943fE55032ABc647c72501949E",
    deprecatedEscrow: "0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe",
  },
};

async function main() {
  const network = hre.network.name;
  const config = NETWORK_CONFIG[network];

  if (!config) {
    throw new Error(`No config for network "${network}". Add it to NETWORK_CONFIG in scripts/deploy.js.`);
  }

  const [deployer] = await hre.ethers.getSigners();
  const treasury = deployer.address;
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`\nDeploying Assay Protocol to ${network}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  ETH bal : ${hre.ethers.formatEther(balance)} ETH`);
  console.log(`  Treasury: ${treasury}`);
  console.log(`  Min stake: ${config.minimumStake} (${Number(config.minimumStake) / 1e6} USDC)\n`);

  let usdcAddress = config.usdc;
  if (!usdcAddress) {
    console.log("0/4 Deploying MockUSDC...");
    const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
    const mockUsdc = await MockUSDC.deploy();
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`    MockUSDC: ${usdcAddress}`);

    const mintAmount = 1_000_000n * 1_000_000n;
    await (await mockUsdc.mint(deployer.address, mintAmount)).wait();
    console.log(`    Minted 1,000,000 USDC to ${deployer.address}\n`);
  } else {
    console.log(`Using canonical USDC: ${usdcAddress}\n`);
  }

  let stakeRegistryAddress = config.stakeRegistry || null;
  if (!stakeRegistryAddress) {
    console.log("1/3 Deploying AssayStakeRegistry...");
    const StakeRegistry = await hre.ethers.getContractFactory("AssayStakeRegistry");
    const stakeRegistry = await StakeRegistry.deploy(usdcAddress, config.minimumStake, treasury);
    await stakeRegistry.waitForDeployment();
    stakeRegistryAddress = await stakeRegistry.getAddress();
    console.log(`    AssayStakeRegistry: ${stakeRegistryAddress}`);
  } else {
    console.log(`Using existing AssayStakeRegistry: ${stakeRegistryAddress}`);
  }

  let reputationAddress = config.reputation || null;
  if (!reputationAddress) {
    console.log("2/3 Deploying AssayReputation...");
    const Reputation = await hre.ethers.getContractFactory("AssayReputation");
    const reputation = await Reputation.deploy(stakeRegistryAddress);
    await reputation.waitForDeployment();
    reputationAddress = await reputation.getAddress();
    console.log(`    AssayReputation: ${reputationAddress}`);
  } else {
    console.log(`Using existing AssayReputation: ${reputationAddress}`);
  }

  let escrowAddress = config.escrow || null;
  if (!escrowAddress) {
    console.log("3/3 Deploying AssayEscrow...");
    const Escrow = await hre.ethers.getContractFactory("AssayEscrow");
    const escrow = await Escrow.deploy(
      usdcAddress,
      stakeRegistryAddress,
      reputationAddress,
      treasury,
    );
    await escrow.waitForDeployment();
    escrowAddress = await escrow.getAddress();
    console.log(`    AssayEscrow: ${escrowAddress}`);
  } else {
    console.log(`Using existing AssayEscrow: ${escrowAddress}`);
  }

  const deprecatedEscrowAddress = config.deprecatedEscrow &&
    config.deprecatedEscrow.toLowerCase() !== escrowAddress.toLowerCase()
      ? config.deprecatedEscrow
      : null;

  console.log("\nWiring permissions...");

  const stakeRegistryContract = await hre.ethers.getContractAt("AssayStakeRegistry", stakeRegistryAddress);
  const reputationContract = await hre.ethers.getContractAt("AssayReputation", reputationAddress);
  const escrowContract = await hre.ethers.getContractAt("AssayEscrow", escrowAddress);

  await (await stakeRegistryContract.authorizeEscrow(escrowAddress)).wait();
  console.log(`  StakeRegistry.authorizeEscrow(${escrowAddress})`);

  await (await reputationContract.authorizeCaller(escrowAddress)).wait();
  console.log(`  Reputation.authorizeCaller(${escrowAddress})`);

  await (await escrowContract.authorizeVerifier(deployer.address)).wait();
  console.log(`  AssayEscrow.authorizeVerifier(${deployer.address})`);

  if (deprecatedEscrowAddress) {
    await (await stakeRegistryContract.revokeEscrow(deprecatedEscrowAddress)).wait();
    console.log(`  StakeRegistry.revokeEscrow(${deprecatedEscrowAddress})`);

    await (await reputationContract.revokeCaller(deprecatedEscrowAddress)).wait();
    console.log(`  Reputation.revokeCaller(${deprecatedEscrowAddress})`);
  }

  console.log("\nVerifying wiring...");

  const escrowAuthorized = await waitForCondition(
    () => stakeRegistryContract.isAuthorizedEscrow(escrowAddress),
    "StakeRegistry escrow authorization",
  );
  const callerAuthorized = await waitForCondition(
    () => reputationContract.isAuthorizedCaller(escrowAddress),
    "Reputation caller authorization",
  );
  const verifierAuthorized = await waitForCondition(
    () => escrowContract.isAuthorizedVerifier(deployer.address),
    "Escrow verifier authorization",
  );
  const deprecatedEscrowRevoked = deprecatedEscrowAddress
    ? await waitForCondition(
      async () => (await stakeRegistryContract.isAuthorizedEscrow(deprecatedEscrowAddress)) === false,
      "StakeRegistry deprecated escrow revocation",
    )
    : true;
  const deprecatedCallerRevoked = deprecatedEscrowAddress
    ? await waitForCondition(
      async () => (await reputationContract.isAuthorizedCaller(deprecatedEscrowAddress)) === false,
      "Reputation deprecated caller revocation",
    )
    : true;

  if (!escrowAuthorized) {
    throw new Error("WIRING FAILED: Escrow not authorized in StakeRegistry");
  }
  if (!callerAuthorized) {
    throw new Error("WIRING FAILED: Escrow not authorized as caller in Reputation");
  }
  if (!verifierAuthorized) {
    throw new Error("WIRING FAILED: Deployer not authorized as verifier in Escrow");
  }
  if (!deprecatedEscrowRevoked) {
    throw new Error("WIRING FAILED: Deprecated escrow still authorized in StakeRegistry");
  }
  if (!deprecatedCallerRevoked) {
    throw new Error("WIRING FAILED: Deprecated caller still authorized in Reputation");
  }

  console.log(`  StakeRegistry.isAuthorizedEscrow(new) = ${escrowAuthorized}`);
  console.log(`  Reputation.isAuthorizedCaller(new)    = ${callerAuthorized}`);
  console.log(`  AssayEscrow.isAuthorizedVerifier(self) = ${verifierAuthorized}`);
  if (deprecatedEscrowAddress) {
    console.log(`  Deprecated escrow revoked everywhere  = ${deprecatedEscrowRevoked && deprecatedCallerRevoked}`);
  }

  console.log("\nDeployment complete");
  console.log(`  Network            : ${network}`);
  if (!config.usdc) {
    console.log(`  MockUSDC           : ${usdcAddress}`);
  } else {
    console.log(`  USDC               : ${usdcAddress}`);
  }
  console.log(`  AssayStakeRegistry : ${stakeRegistryAddress}`);
  console.log(`  AssayReputation    : ${reputationAddress}`);
  console.log(`  AssayEscrow        : ${escrowAddress}`);
  if (deprecatedEscrowAddress) {
    console.log(`  Deprecated Escrow  : ${deprecatedEscrowAddress}`);
  }

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentData = {
    network,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    treasury,
    contracts: {
      ...(config.usdc ? { USDC: usdcAddress } : { MockUSDC: usdcAddress }),
      AssayStakeRegistry: stakeRegistryAddress,
      AssayReputation: reputationAddress,
      AssayEscrow: escrowAddress,
      ...(deprecatedEscrowAddress ? { DeprecatedAssayEscrow: deprecatedEscrowAddress } : {}),
    },
  };

  const deploymentJsonPath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(deploymentJsonPath, JSON.stringify(deploymentData, null, 2));
  console.log(`  Saved deployment JSON to deployments/${network}.json`);

  const mdLines = [
    network === "base"
      ? "# Assay Protocol - Deployed Addresses (Base Mainnet)"
      : "# Assay Protocol - Deployed Addresses",
    "",
    `**Network:** ${network}`,
    `**Deployed at:** ${deploymentData.deployedAt}`,
    `**Deployer:** \`${deployer.address}\``,
    `**Treasury:** \`${treasury}\``,
    ...(config.usdc ? [`**USDC:** \`${usdcAddress}\``] : []),
    `**Minimum Stake:** \`${config.minimumStake}\` (${Number(config.minimumStake) / 1e6} USDC, 6 decimals)`,
    "",
    "## Contract Addresses",
    "",
    "| Contract | Address |",
    "|---|---|",
    ...(config.usdc ? [`| USDC | \`${usdcAddress}\` |`] : [`| MockUSDC | \`${usdcAddress}\` |`]),
    `| AssayStakeRegistry | \`${stakeRegistryAddress}\` |`,
    `| AssayReputation | \`${reputationAddress}\` |`,
    `| AssayEscrow | \`${escrowAddress}\` |`,
    ...(deprecatedEscrowAddress ? [`| AssayEscrow (deprecated) | \`${deprecatedEscrowAddress}\` |`] : []),
    "",
    "## Wiring",
    "",
    "| Check | Result |",
    "|---|---|",
    "| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | true |",
    "| Reputation.isAuthorizedCaller(AssayEscrow) | true |",
    "| AssayEscrow.isAuthorizedVerifier(deployer) | true |",
    ...(deprecatedEscrowAddress
      ? [
        "| StakeRegistry.isAuthorizedEscrow(deprecated) | false |",
        "| Reputation.isAuthorizedCaller(deprecated) | false |",
      ]
      : []),
    "",
    "## Constructor Arguments Used for Verification",
    "",
    "### AssayEscrow",
    "",
    "```text",
    usdcAddress,
    stakeRegistryAddress,
    reputationAddress,
    treasury,
    "```",
    "",
    "## Notes",
    "",
    "- Treasury is currently set to the deployer address. Update it with setTreasury() if needed.",
    ...(config.usdc ? ["- Mainnet uses canonical Base USDC; no MockUSDC is deployed."] : ["- MockUSDC is for Base Sepolia testnet only."]),
  ];

  const mdFilename = network === "base" ? "DEPLOYED_ADDRESSES_MAINNET.md" : "DEPLOYED_ADDRESSES.md";
  const deploymentMdPath = path.join(__dirname, "..", mdFilename);
  fs.writeFileSync(deploymentMdPath, `${mdLines.join("\n")}\n`);
  console.log(`  Saved deployment markdown to ${mdFilename}`);

  if (process.env.BASESCAN_API_KEY) {
    console.log("\nVerifying contracts on Basescan...");
    if (!config.usdc) {
      await verify(usdcAddress, []);
    }
    await verify(stakeRegistryAddress, [usdcAddress, config.minimumStake, treasury]);
    await verify(reputationAddress, [stakeRegistryAddress]);
    await verify(escrowAddress, [usdcAddress, stakeRegistryAddress, reputationAddress, treasury]);
  } else {
    console.log("Skipping Basescan verification (BASESCAN_API_KEY not set).");
  }
}

async function verify(address, constructorArgs) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`  Verified ${address}`);
  } catch (error) {
    console.warn(`  Could not verify ${address}: ${error.message}`);
  }
}

async function waitForCondition(readFn, label, attempts = 5, delayMs = 3000) {
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
