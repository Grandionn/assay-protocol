require('dotenv').config();
const { ethers } = require('hardhat');

const mockUsdcAbi = require('../frontend/src/abi/MockUSDC.json');
const escrowAbi = require('../frontend/src/abi/AssayEscrow.json');
const reputationAbi = require('../frontend/src/abi/AssayReputation.json');
const stakeRegistryAbi = require('../frontend/src/abi/AssayStakeRegistry.json');

const CONTRACT_ADDRESSES = {
  mockUsdc: '0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256',
  stakeRegistry: '0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9',
  reputation: '0xD6a81ADd33398A777640787b2f48D7A33D46fbab',
  escrow: '0x17E177d698A244E13f84446982BA772eBdCed567',
};

const RAILWAY_BASE_URL = 'https://assay-protocol-production.up.railway.app';
const TWO_SECONDS_MS = 2_000;
const USDC_DECIMALS = 6;
const GAS_TOP_UP_WEI = ethers.parseEther('0.01');
const GAS_MIN_WEI = ethers.parseEther('0.005');
const BUYER_OPERATIONAL_GAS_MIN_WEI = ethers.parseEther('0.0005');
const DEPLOYER_GAS_RESERVE_WEI = ethers.parseEther('0.002');
const MINT_AMOUNT = 500_000n * 10n ** 6n;

function normalizePrivateKey(value, name) {
  if (!value) {
    throw new Error(`${name} is missing from .env`);
  }

  return value.startsWith('0x') ? value : `0x${value}`;
}

function formatUsdc(amount) {
  return `${ethers.formatUnits(amount, USDC_DECIMALS)} USDC`;
}

function txHashOf(receipt) {
  return receipt.hash ?? receipt.transactionHash;
}

async function delay() {
  await new Promise((resolve) => setTimeout(resolve, TWO_SECONDS_MS));
}

async function waitForReceipt(tx, label) {
  console.log(`⏳ ${label} submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  await delay();
  return receipt;
}

async function postTransactionRecord({
  address,
  type,
  method,
  label,
  amount,
  txHash,
  details,
  escrowId,
  timestamp,
}) {
  const response = await fetch(`${RAILWAY_BASE_URL}/transactions/record`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      address,
      agentAddress: address,
      type,
      method,
      label,
      amount,
      txHash,
      details,
      escrowId,
      timestamp,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Transaction record failed (${response.status}): ${text}`);
  }
}

function resolveEscrowId(receipt, escrowContract) {
  const createdEvent = receipt.logs
    .map((log) => {
      try {
        return escrowContract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === 'EscrowCreated');

  const escrowId = createdEvent?.args?.escrowId ?? createdEvent?.args?.[0] ?? null;
  if (escrowId == null) {
    throw new Error('EscrowCreated event was not found in the createEscrow receipt.');
  }

  return BigInt(escrowId);
}

async function runEscrowFlow({
  flowNumber,
  buyer,
  agent,
  escrow,
  amountMicro,
  specText,
  deadline,
}) {
  console.log(`\n=== Escrow #${flowNumber} ===`);

  const specHash = ethers.keccak256(ethers.toUtf8Bytes(specText));
  const amountLabel = formatUsdc(amountMicro);

  const approveTx = await buyer.mockUsdc.approve(CONTRACT_ADDRESSES.escrow, amountMicro);
  const approveReceipt = await waitForReceipt(approveTx, `Approve ${amountLabel} for escrow`);

  const createTx = await buyer.escrow.createEscrow(agent.address, amountMicro, deadline, specHash);
  const createReceipt = await waitForReceipt(createTx, `Create escrow #${flowNumber}`);
  const escrowId = resolveEscrowId(createReceipt, escrow);
  console.log(`🆔 Escrow #${flowNumber} ID: ${escrowId.toString()}`);

  const createdTimestamp = Math.floor(Date.now() / 1000);
  await postTransactionRecord({
    address: agent.address,
    type: 'escrow_created',
    method: 'ESCROW_CREATED',
    label: 'Escrow Created',
    amount: amountMicro.toString(),
    txHash: txHashOf(createReceipt),
    details: `${specText} (escrow ${escrowId.toString()})`,
    escrowId: escrowId.toString(),
    timestamp: createdTimestamp,
  });

  const fundTx = await buyer.escrow.fundEscrow(escrowId);
  const fundReceipt = await waitForReceipt(fundTx, `Fund escrow #${flowNumber}`);
  await postTransactionRecord({
    address: buyer.address,
    type: 'escrow_funded',
    method: 'ESCROW_FUNDED',
    label: 'Escrow Funded',
    amount: amountMicro.toString(),
    txHash: txHashOf(fundReceipt),
    details: `Buyer funded escrow ${escrowId.toString()}`,
    escrowId: escrowId.toString(),
    timestamp: Math.floor(Date.now() / 1000),
  });

  const deliverableHash = ethers.keccak256(
    ethers.toUtf8Bytes(`Deliverable for escrow ${escrowId.toString()}: ${specText}`),
  );
  const submitTx = await agent.escrow.submitDeliverable(escrowId, deliverableHash);
  const submitReceipt = await waitForReceipt(submitTx, `Submit deliverable for escrow #${flowNumber}`);
  await postTransactionRecord({
    address: agent.address,
    type: 'escrow_completed',
    method: 'DELIVERABLE',
    label: 'Deliverable Submitted',
    amount: amountMicro.toString(),
    txHash: txHashOf(submitReceipt),
    details: `Agent submitted deliverable for escrow ${escrowId.toString()}`,
    escrowId: escrowId.toString(),
    timestamp: Math.floor(Date.now() / 1000),
  });

  const settleTx = await agent.escrow.verifyAndSettle(escrowId, true, 95);
  const settleReceipt = await waitForReceipt(settleTx, `Settle escrow #${flowNumber}`);
  await postTransactionRecord({
    address: agent.address,
    type: 'escrow_settled',
    method: 'ESCROW_SETTLED',
    label: 'Escrow Settled',
    amount: amountMicro.toString(),
    txHash: txHashOf(settleReceipt),
    details: `Verifier settled escrow ${escrowId.toString()} successfully`,
    escrowId: escrowId.toString(),
    timestamp: Math.floor(Date.now() / 1000),
  });

  return {
    escrowId,
    settleHash: txHashOf(settleReceipt),
    approveHash: txHashOf(approveReceipt),
    createHash: txHashOf(createReceipt),
    fundHash: txHashOf(fundReceipt),
    submitHash: txHashOf(submitReceipt),
  };
}

async function main() {
  const deployerKey = normalizePrivateKey(process.env.PRIVATE_KEY, 'PRIVATE_KEY');
  const buyerKey = normalizePrivateKey(process.env.BUYER_PRIVATE_KEY, 'BUYER_PRIVATE_KEY');
  const provider = ethers.provider;

  const deployer = new ethers.Wallet(deployerKey, provider);
  const buyer = new ethers.Wallet(buyerKey, provider);

  const deployerContracts = {
    mockUsdc: new ethers.Contract(CONTRACT_ADDRESSES.mockUsdc, mockUsdcAbi, deployer),
    stakeRegistry: new ethers.Contract(CONTRACT_ADDRESSES.stakeRegistry, stakeRegistryAbi, deployer),
    reputation: new ethers.Contract(CONTRACT_ADDRESSES.reputation, reputationAbi, deployer),
    escrow: new ethers.Contract(CONTRACT_ADDRESSES.escrow, escrowAbi, deployer),
  };

  const buyerContracts = {
    mockUsdc: new ethers.Contract(CONTRACT_ADDRESSES.mockUsdc, mockUsdcAbi, buyer),
    escrow: new ethers.Contract(CONTRACT_ADDRESSES.escrow, escrowAbi, buyer),
  };

  console.log(`Deployer / Agent / Verifier: ${deployer.address}`);
  console.log(`Buyer: ${buyer.address}`);

  const [isAgentActive, isVerifierAuthorized] = await Promise.all([
    deployerContracts.stakeRegistry.isActive(deployer.address),
    deployerContracts.escrow.isAuthorizedVerifier(deployer.address),
  ]);

  if (!isAgentActive) {
    throw new Error(`Agent ${deployer.address} is not active in StakeRegistry.`);
  }

  if (!isVerifierAuthorized) {
    throw new Error(`Verifier ${deployer.address} is not authorized in Escrow.`);
  }

  const buyerEthBalance = await provider.getBalance(buyer.address);
  console.log(`Buyer ETH balance: ${ethers.formatEther(buyerEthBalance)} ETH`);
  if (buyerEthBalance < GAS_MIN_WEI) {
    const deployerEthBalance = await provider.getBalance(deployer.address);
    const affordableTopUp =
      deployerEthBalance > DEPLOYER_GAS_RESERVE_WEI
        ? deployerEthBalance - DEPLOYER_GAS_RESERVE_WEI
        : 0n;

    if (affordableTopUp >= GAS_TOP_UP_WEI) {
      const gasTx = await deployer.sendTransaction({
        to: buyer.address,
        value: GAS_TOP_UP_WEI,
      });
      const gasReceipt = await waitForReceipt(gasTx, 'Top up buyer gas');
      console.log(`⛽ Sent gas top-up: ${txHashOf(gasReceipt)}`);
    } else if (buyerEthBalance >= BUYER_OPERATIONAL_GAS_MIN_WEI) {
      console.log('⛽ Buyer is below the preferred gas threshold, but still has enough ETH for this scripted flow. Skipping top-up.');
    } else if (affordableTopUp > 0n) {
      const gasTx = await deployer.sendTransaction({
        to: buyer.address,
        value: affordableTopUp,
      });
      const gasReceipt = await waitForReceipt(gasTx, 'Partial buyer gas top-up');
      console.log(`⛽ Sent partial gas top-up: ${txHashOf(gasReceipt)} (${ethers.formatEther(affordableTopUp)} ETH)`);
    } else {
      throw new Error('Neither wallet has enough ETH to safely continue the scripted escrow flow.');
    }
  } else {
    console.log('⛽ Buyer already has enough ETH for gas.');
  }

  const mintTx = await deployerContracts.mockUsdc.mint(buyer.address, MINT_AMOUNT);
  const mintReceipt = await waitForReceipt(mintTx, `Mint ${formatUsdc(MINT_AMOUNT)} to buyer`);
  const buyerUsdcBalance = await deployerContracts.mockUsdc.balanceOf(buyer.address);
  console.log(`💵 Buyer USDC balance after mint: ${formatUsdc(buyerUsdcBalance)} (tx ${txHashOf(mintReceipt)})`);

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);

  const escrow2 = await runEscrowFlow({
    flowNumber: 2,
    buyer: { ...buyerContracts, address: buyer.address },
    agent: { ...deployerContracts, address: deployer.address },
    escrow: deployerContracts.escrow,
    amountMicro: ethers.parseUnits('150', USDC_DECIMALS),
    specText: 'Code audit for smart contract',
    deadline,
  });

  const escrow3 = await runEscrowFlow({
    flowNumber: 3,
    buyer: { ...buyerContracts, address: buyer.address },
    agent: { ...deployerContracts, address: deployer.address },
    escrow: deployerContracts.escrow,
    amountMicro: ethers.parseUnits('200', USDC_DECIMALS),
    specText: 'API integration and testing',
    deadline,
  });

  const [score, stats, minJobs] = await Promise.all([
    deployerContracts.reputation.getScore(deployer.address),
    deployerContracts.reputation.getAgentStats(deployer.address),
    deployerContracts.reputation.MIN_JOBS_FOR_SCORE(),
  ]);

  const completedJobs = Number(stats.completedJobs);
  const unlocked = completedJobs >= Number(minJobs) && Number(score) > 0;

  console.log(`\n✅ Escrow #2 settled — TX: ${escrow2.settleHash}`);
  console.log(`✅ Escrow #3 settled — TX: ${escrow3.settleHash}`);
  console.log(`✅ Reputation: ${completedJobs} completed jobs`);
  console.log(unlocked ? '✅ Assay Score UNLOCKED' : '❌ Assay Score still locked');

  if (!unlocked) {
    throw new Error(`Assay Score is not unlocked yet. Score=${score.toString()}, completedJobs=${completedJobs}, minJobs=${minJobs.toString()}`);
  }
}

main().catch((error) => {
  console.error('❌ unlockScore failed:', error);
  process.exitCode = 1;
});
