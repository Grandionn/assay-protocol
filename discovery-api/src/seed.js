// src/seed.js
// Registers representative sample agents by calling the register logic directly.

const store = require('./vectorStore');
const { registerAgentRecord } = require('./routes/agents');

const SAMPLE_AGENTS = [
  {
    address: '0xb001000000000000000000000000000000000001',
    name: 'Securify v4',
    capability:
      'Senior smart contract auditing agent for Solidity and EVM systems. Reviews upgradeable proxies, access control, reentrancy surfaces, pricing logic, and gas-heavy execution paths. Produces actionable findings with exploit narratives and fix guidance.',
    stake: 900_000_000,
    assayScore: 9310,
  },
  {
    address: '0xb002000000000000000000000000000000000002',
    name: 'Sentinel DeFi',
    capability:
      'DeFi security specialist focused on AMMs, lending markets, flash-loan resilience, oracle integrity, liquidation edge cases, and cross-contract exploit simulation for protocol launches and post-deploy monitoring.',
    stake: 1_250_000_000,
    assayScore: 9580,
  },
  {
    address: '0xb003000000000000000000000000000000000003',
    name: 'QuantLens',
    capability:
      'Data analytics agent for product and protocol telemetry. Builds KPI dashboards, anomaly detection pipelines, cohort analysis, SQL reporting, and statistical summaries for decision support across growth and treasury teams.',
    stake: 520_000_000,
    assayScore: 8120,
  },
  {
    address: '0xb004000000000000000000000000000000000004',
    name: 'PolyGlot Engine',
    capability:
      'Professional translation and localisation agent covering English, Spanish, French, German, Japanese, and Mandarin. Preserves tone across legal docs, technical manuals, investor updates, and high-context product copy.',
    stake: 410_000_000,
    assayScore: 7740,
  },
  {
    address: '0xb005000000000000000000000000000000000005',
    name: 'PixelForge',
    capability:
      'Image generation operator for product marketing and concept art. Crafts prompt systems, refines brand-consistent outputs, evaluates diffusion model variants, and prepares campaign-ready assets with style controls and iteration notes.',
    stake: 460_000_000,
    assayScore: 7380,
  },
  {
    address: '0xb006000000000000000000000000000000000006',
    name: 'SynthText',
    capability:
      'Code review agent for full-stack application changesets. Reads diffs, flags regressions, identifies edge cases, recommends tests, and focuses on correctness, maintainability, and production rollout risk.',
    stake: 680_000_000,
    assayScore: 8460,
  },
  {
    address: '0xb007000000000000000000000000000000000007',
    name: 'CrawlNet',
    capability:
      'API testing agent for REST and GraphQL services. Designs contract tests, authentication checks, pagination coverage, schema validation, and failure-mode scenarios for CI pipelines and release gates.',
    stake: 570_000_000,
    assayScore: 8010,
  },
  {
    address: '0xb008000000000000000000000000000000000008',
    name: 'DocWriter',
    capability:
      'Document processing agent for contracts, invoices, compliance packets, and internal reports. Extracts fields, classifies documents, summarises obligations, and normalises outputs into structured downstream workflows.',
    stake: 490_000_000,
    assayScore: 7625,
  },
  {
    address: '0xb009000000000000000000000000000000000009',
    name: 'YieldScope',
    capability:
      'Blockchain indexing agent for event streams, balance deltas, and historical backfills. Builds resilient indexers, stream processors, query-ready datasets, and alerting around protocol state transitions.',
    stake: 830_000_000,
    assayScore: 8875,
  },
  {
    address: '0xb00a00000000000000000000000000000000000a',
    name: 'ClipCraft',
    capability:
      'ML model evaluation agent for benchmark design, hallucination scoring, regression analysis, eval-set curation, prompt variance testing, and model comparison across reliability, latency, and cost dimensions.',
    stake: 610_000_000,
    assayScore: 8295,
  },
];

async function seedDirect() {
  let seededCount = 0;
  console.log(`Ensuring ${SAMPLE_AGENTS.length} sample agents are indexed...`);

  for (const agent of SAMPLE_AGENTS) {
    if (store.get(agent.address)) {
      console.log(`  = ${agent.address} already present, skipping.`);
      continue;
    }

    const result = await registerAgentRecord(agent);
    seededCount += 1;
    console.log(`  + ${result.agent.address}  score=${result.agent.assayScore}  stake=${result.agent.stake}`);
  }

  const indexed = store.list();
  console.log(`Indexed ${indexed.length} agents total (${seededCount} newly seeded).`);
  return indexed;
}

if (require.main === module) {
  seedDirect()
    .then((indexed) => {
      console.log(`Seed complete — ${indexed.length}/${SAMPLE_AGENTS.length} agents indexed.`);
    })
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exitCode = 1;
    });
}

module.exports = { SAMPLE_AGENTS, seedDirect };
