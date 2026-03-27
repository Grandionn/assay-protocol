import { ethers } from 'ethers';
import mockUsdcArtifact from '@artifacts/contracts/mocks/MockUSDC.sol/MockUSDC.json';
import stakeRegistryArtifact from '@artifacts/contracts/AssayStakeRegistry.sol/AssayStakeRegistry.json';
import { formatDateTime, formatUsdc } from './format';

export const CONTRACT_ADDRESSES = {
  mockUsdc: '0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256',
  stakeRegistry: '0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9',
};

export function getContracts(signerOrProvider) {
  return {
    stakeRegistry: new ethers.Contract(
      CONTRACT_ADDRESSES.stakeRegistry,
      stakeRegistryArtifact.abi,
      signerOrProvider,
    ),
    usdc: new ethers.Contract(CONTRACT_ADDRESSES.mockUsdc, mockUsdcArtifact.abi, signerOrProvider),
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

export async function registerAgent({ signer, agentAddress, capability, stakeAmount }) {
  const { stakeRegistry, usdc } = getContracts(signer);
  const stakeAmountMicro = ethers.parseUnits(stakeAmount, 6);
  const allowance = await usdc.allowance(agentAddress, CONTRACT_ADDRESSES.stakeRegistry);

  if (allowance < stakeAmountMicro) {
    const approvalTx = await usdc.approve(CONTRACT_ADDRESSES.stakeRegistry, stakeAmountMicro);
    await approvalTx.wait();
  }

  const registerTx = await stakeRegistry.registerAgent(capability, stakeAmountMicro);
  const receipt = await registerTx.wait();

  return {
    stakeAmountMicro,
    receipt,
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
