import { ethers } from 'ethers';
import mockUsdcAbi from '../abi/MockUSDC.json';
import stakeRegistryAbi from '../abi/AssayStakeRegistry.json';
import escrowAbi from '../abi/AssayEscrow.json';
import reputationAbi from '../abi/AssayReputation.json';
import { formatDateTime, formatUsdc } from './format';

export const CONTRACT_ADDRESSES = {
  mockUsdc: '0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256',
  stakeRegistry: '0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9',
  escrow: '0x17E177d698A244E13f84446982BA772eBdCed567',
  reputation: '0xD6a81ADd33398A777640787b2f48D7A33D46fbab',
};

export const ESCROW_STATUS_LABELS = ['Created', 'Funded', 'Submitted', 'Settled', 'Refunded', 'Disputed'];

export function getEscrowStatusLabel(status) {
  const normalizedStatus = typeof status === 'bigint' ? Number(status) : Number(status ?? 0);
  return ESCROW_STATUS_LABELS[normalizedStatus] ?? `Unknown (${normalizedStatus})`;
}

export function getContracts(signerOrProvider) {
  return {
    stakeRegistry: new ethers.Contract(
      CONTRACT_ADDRESSES.stakeRegistry,
      stakeRegistryAbi,
      signerOrProvider,
    ),
    usdc: new ethers.Contract(CONTRACT_ADDRESSES.mockUsdc, mockUsdcAbi, signerOrProvider),
    escrow: new ethers.Contract(CONTRACT_ADDRESSES.escrow, escrowAbi, signerOrProvider),
    reputation: new ethers.Contract(CONTRACT_ADDRESSES.reputation, reputationAbi, signerOrProvider),
  };
}

export async function fetchOnChainAgent(provider, address) {
  if (!provider || !ethers.isAddress(address)) {
    return null;
  }

  const { stakeRegistry } = getContracts(provider);
  const [info, active] = await Promise.all([
    stakeRegistry.getAgentInfo(address),
    stakeRegistry.isActive(address),
  ]);

  return {
    address,
    stake: info.stake,
    capabilityHash: info.capabilityHash,
    earnings: info.earnings,
    registered: info.registered,
    active,
  };
}

export async function registerAgent({ signer, agentAddress, capability, stakeAmount, onStatus }) {
  const { stakeRegistry, usdc } = getContracts(signer);
  const stakeAmountMicro = ethers.parseUnits(stakeAmount, 6);
  const allowance = await usdc.allowance(agentAddress, CONTRACT_ADDRESSES.stakeRegistry);

  if (allowance < stakeAmountMicro) {
    onStatus?.('Step 1/2: Approving USDC allowance...');
    const approvalTx = await usdc.approve(CONTRACT_ADDRESSES.stakeRegistry, stakeAmountMicro);
    await approvalTx.wait();
  }

  onStatus?.('Step 2/2: Submitting registration transaction...');
  const registerTx = await stakeRegistry.registerAgent(capability, stakeAmountMicro);
  const receipt = await registerTx.wait();

  return {
    stakeAmountMicro,
    receipt,
  };
}

export async function createAndFundEscrow({ signer, agentAddress, paymentAmount, specHash, deadlineTimestamp, onStatus }) {
  const { escrow, stakeRegistry, usdc } = getContracts(signer);
  const paymentMicro = ethers.parseUnits(paymentAmount, 6);
  const buyerAddress = await signer.getAddress();
  const normalizedDeadline = BigInt(deadlineTimestamp);

  if (!ethers.isAddress(agentAddress)) {
    throw new Error('Create escrow failed: the agent address is invalid.');
  }

  if (buyerAddress.toLowerCase() === agentAddress.toLowerCase()) {
    throw new Error('Create escrow failed: buyer and agent must be different wallets.');
  }

  if (paymentMicro <= 0n) {
    throw new Error('Create escrow failed: payment amount must be greater than zero.');
  }

  if (normalizedDeadline <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new Error('Create escrow failed: deadline must be in the future.');
  }

  const isAgentActive = await stakeRegistry.isActive(agentAddress);
  if (!isAgentActive) {
    throw new Error('Create escrow failed: the selected agent is not active on the StakeRegistry.');
  }

  onStatus?.('Step 1/3: Creating escrow on-chain...');

  let createReceipt;
  try {
    const createTx = await escrow.createEscrow(agentAddress, paymentMicro, normalizedDeadline, specHash);
    createReceipt = await createTx.wait();
  } catch (error) {
    throw new Error(formatEscrowStepError('Create escrow', escrow, error));
  }

  const allowance = await usdc.allowance(buyerAddress, CONTRACT_ADDRESSES.escrow);
  if (allowance < paymentMicro) {
    onStatus?.('Step 2/3: Approving USDC for escrow...');
    try {
      const approveTx = await usdc.approve(CONTRACT_ADDRESSES.escrow, paymentMicro);
      await approveTx.wait();
    } catch (error) {
      throw new Error(`Approve escrow allowance failed: ${parseWalletError(error)}`);
    }
  }

  const createdEvent = createReceipt.logs
    .map((log) => {
      try {
        return escrow.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed?.name === 'EscrowCreated');

  let escrowId = createdEvent?.args?.escrowId ?? createdEvent?.args?.[0] ?? null;

  if (escrowId == null) {
    const nextEscrowId = await escrow.nextEscrowId();
    if (nextEscrowId > 0n) {
      escrowId = nextEscrowId - 1n;
    }
  }

  if (escrowId == null) {
    throw new Error('Escrow creation succeeded but the escrow ID could not be resolved from logs.');
  }

  onStatus?.('Step 3/3: Funding escrow...');
  let fundReceipt;
  try {
    const fundTx = await escrow.fundEscrow(escrowId);
    fundReceipt = await fundTx.wait();
  } catch (error) {
    throw new Error(formatEscrowStepError('Fund escrow', escrow, error));
  }

  return {
    escrowId: BigInt(escrowId),
    paymentMicro,
    createReceipt,
    fundReceipt,
  };
}

export async function submitDeliverable({ signer, escrowId, deliverableHash, onStatus }) {
  const { escrow } = getContracts(signer);
  onStatus?.('Submitting deliverable on-chain...');
  const tx = await escrow.submitDeliverable(BigInt(escrowId), deliverableHash);
  const receipt = await tx.wait();
  return { receipt };
}

export async function verifyAndSettle({ signer, escrowId, success = true, qualityScore = 100, onStatus }) {
  const { escrow } = getContracts(signer);
  const normalizedQualityScore = Math.max(0, Math.min(100, Math.round(Number(qualityScore) || 0)));
  onStatus?.('Verifying and settling escrow...');
  const tx = await escrow.verifyAndSettle(BigInt(escrowId), success, BigInt(normalizedQualityScore));
  const receipt = await tx.wait();
  return { receipt };
}

export async function fetchEscrowDetails(provider, escrowId) {
  if (!provider) {
    throw new Error('A provider is required to read escrow details.');
  }

  const { escrow } = getContracts(provider);
  const normalizedEscrowId = BigInt(escrowId);
  const details = await escrow.getEscrow(normalizedEscrowId);

  if ((details.createdAt ?? 0n) === 0n && (details.buyer ?? ethers.ZeroAddress) === ethers.ZeroAddress) {
    throw new Error('Escrow not found.');
  }

  return {
    escrowId: normalizedEscrowId,
    buyer: details.buyer,
    agent: details.agent,
    amount: details.amount,
    deadline: details.deadline,
    specHash: details.specHash,
    deliverableHash: details.deliverableHash,
    status: details.status,
    statusLabel: getEscrowStatusLabel(details.status),
    createdAt: details.createdAt,
    fundedAt: details.fundedAt,
    submittedAt: details.submittedAt,
  };
}

const EVENT_MAPPERS = [
  {
    filter: (contract, address) => contract.filters.AgentRegistered(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'REG_INIT',
      status: 'Confirmed',
      amount: log.args.stake,
      label: 'Initial Stake',
    }),
  },
  {
    filter: (contract, address) => contract.filters.StakeAdded(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'STAKE_TOPUP',
      status: 'Confirmed',
      amount: log.args.amount,
      label: 'Stake Added',
    }),
  },
  {
    filter: (contract, address) => contract.filters.StakeWithdrawn(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'STAKE_EXIT',
      status: 'Confirmed',
      amount: log.args.amount,
      label: 'Stake Withdrawn',
    }),
  },
  {
    filter: (contract, address) => contract.filters.EarningsRecorded(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'PAYOUT',
      status: 'Confirmed',
      amount: log.args.amount,
      label: 'Earnings Recorded',
    }),
  },
  {
    filter: (contract, address) => contract.filters.AgentSlashed(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'SLASH',
      status: 'Confirmed',
      amount: log.args.slashedAmount,
      label: 'Stake Slashed',
    }),
  },
  {
    filter: (contract, address) => contract.filters.CapabilityHashUpdated(address),
    toRow: (log) => ({
      hash: log.transactionHash,
      method: 'CAPABILITY_UPDATE',
      status: 'Confirmed',
      amount: 0,
      label: 'Capability Updated',
    }),
  },
];

export async function fetchAgentHistory(provider, address) {
  if (!provider || !ethers.isAddress(address)) {
    return [];
  }

  const { stakeRegistry } = getContracts(provider);

  const groupedLogs = await Promise.all(
    EVENT_MAPPERS.map(async (eventMapper) => {
      const logs = await stakeRegistry.queryFilter(eventMapper.filter(stakeRegistry, address));
      return logs.map((log) => ({
        ...eventMapper.toRow(log),
        blockNumber: log.blockNumber,
      }));
    }),
  );

  const rows = groupedLogs.flat();
  const uniqueBlocks = [...new Set(rows.map((row) => row.blockNumber))];
  const blockEntries = await Promise.all(
    uniqueBlocks.map(async (blockNumber) => [blockNumber, await provider.getBlock(blockNumber)]),
  );
  const blockMap = new Map(blockEntries);

  return rows
    .map((row) => {
      const block = blockMap.get(row.blockNumber);
      return {
        ...row,
        timestamp: block?.timestamp ?? null,
        amountLabel: row.amount ? formatUsdc(row.amount) : 'Metadata',
        timestampLabel: block?.timestamp ? formatDateTime(block.timestamp) : 'Pending',
      };
    })
    .sort((left, right) => right.blockNumber - left.blockNumber);
}

export function parseWalletError(error) {
  return (
    error?.shortMessage ||
    error?.reason ||
    error?.info?.error?.message ||
    error?.message ||
    'Transaction failed.'
  );
}

function formatEscrowStepError(stepLabel, escrowContract, error) {
  const parsedError = parseContractError(escrowContract, error);

  if (parsedError?.name === 'AgentNotActive') {
    return `${stepLabel} failed: the selected agent is not active on the StakeRegistry.`;
  }

  if (parsedError?.name === 'SelfDeal') {
    return `${stepLabel} failed: buyer and agent must be different wallets.`;
  }

  if (parsedError?.name === 'DeadlineInPast') {
    return `${stepLabel} failed: the deadline must be in the future.`;
  }

  if (parsedError?.name === 'ZeroAmount') {
    return `${stepLabel} failed: payment amount must be greater than zero.`;
  }

  if (parsedError?.name === 'NotBuyer') {
    return `${stepLabel} failed: only the escrow buyer wallet can fund this escrow.`;
  }

  if (parsedError?.name === 'EscrowNotFound') {
    return `${stepLabel} failed: the escrow could not be found on-chain.`;
  }

  if (parsedError?.name === 'InvalidStatus') {
    const current = getEscrowStatusLabel(parsedError.args?.current ?? parsedError.args?.[0] ?? 0);
    const expected = getEscrowStatusLabel(parsedError.args?.expected ?? parsedError.args?.[1] ?? 0);
    return `${stepLabel} failed: escrow status is ${current}, expected ${expected}.`;
  }

  const fallbackMessage = parseWalletError(error);
  return `${stepLabel} failed: ${fallbackMessage}`;
}

function parseContractError(contract, error) {
  const candidates = [
    error?.data,
    error?.info?.error?.data,
    error?.info?.data,
    error?.error?.data,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    try {
      return contract.interface.parseError(candidate);
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
