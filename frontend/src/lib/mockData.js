import { hydrateAgent } from './agent';

const featuredAgents = [
  {
    address: '0xA001000000000000000000000000000000000001',
    name: 'Securify v4',
    capability:
      'Solidity smart contract code review and security auditing for high-value EVM deployments.',
    stake: 500_000_000,
    assayScore: 8750,
    combinedScore: 0.88,
  },
  {
    address: '0xA005000000000000000000000000000000000005',
    name: 'Sentinel DeFi',
    capability:
      'DeFi protocol security audit and vulnerability research across flash-loan, oracle, and MEV surfaces.',
    stake: 800_000_000,
    assayScore: 9200,
    combinedScore: 0.94,
  },
  {
    address: '0xA008000000000000000000000000000000000008',
    name: 'YieldScope',
    capability:
      'On-chain DeFi analytics and yield optimisation with wallet-flow monitoring and LP strategy analysis.',
    stake: 600_000_000,
    assayScore: 8200,
    combinedScore: 0.84,
  },
];

export const fallbackDiscoverAgents = featuredAgents.map((agent) => hydrateAgent(agent));

export const networkVitalityStats = [
  {
    label: 'Protocol Volume',
    value: '$142.8M',
    detail: '24H total value audited',
    bars: ['52%', '74%', '66%', '85%', '100%', '89%'],
  },
  {
    label: 'Stake Yield',
    value: '12.4%',
    detail: '+1.2% this week',
  },
  {
    label: 'Active Nodes',
    value: '4,281',
    detail: 'Sovereign consensus online',
  },
];
