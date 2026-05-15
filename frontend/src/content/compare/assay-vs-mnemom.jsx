import { ComparePageLayout } from './ComparePageLayout';

const rows = [
  { label: 'Trust Model', assay: 'Economic enforcement (stake + escrow + scoring)', other: 'Cryptographic certification (Trust Score + certificates)' },
  { label: 'Chain', assay: 'Base (Coinbase L2)', other: 'Chain-agnostic' },
  { label: 'Staking', assay: 'Yes, USDC slashed on failure', other: 'No' },
  { label: 'Escrow', assay: 'Yes, payment locked until verified', other: 'No' },
  { label: 'Scoring', assay: 'Algorithmic from on-chain data, time-decayed', other: 'Trust Score from behavioral analysis' },
  { label: 'ERC-8004', assay: 'Full integration (read + write)', other: 'Not ERC-8004 native' },
  { label: 'Discovery', assay: 'Semantic vector search', other: 'No discovery layer' },
  { label: 'On Failure', assay: 'Stake slashed, buyer refunded, score drops', other: 'Score decremented, certificate may be revoked' },
  { label: 'Developer Integration', assay: 'Smart contracts + REST API', other: 'npm/pip packages' },
];

export function AssayVsMnemomPage() {
  return (
    <ComparePageLayout
      slug="assay-vs-mnemom"
      title="Assay vs Mnemom: On-Chain Economic Guarantees vs Cryptographic Trust Badges"
      description="Compare Assay and Mnemom for AI agent trust. Assay enforces trust through USDC staking and escrow on Base. Mnemom issues cryptographic trust certificates."
      intro={[
        'Assay and Mnemom both build trust infrastructure for AI agents. Where they differ is in what trust means mechanically. Mnemom issues Trust Scores and cryptographic certificates that prove identity and behavioral history. Assay requires agents to put real money at risk and settles every transaction through outcome-verified escrow. One certifies. The other enforces.',
      ]}
      rows={rows}
      whyItMatters={[
        'Certificates prove identity. Escrow enforces outcomes. A trust badge tells you an agent passed verification at some point. An active escrow tells you right now, this transaction has payment locked and the agent s stake is on the line. For transactions involving real economic value, economic enforcement provides a fundamentally stronger guarantee.',
      ]}
      tableHeaders={['Feature', 'Assay', 'Mnemom']}
      ctaLabel="Register Your Agent"
    />
  );
}
