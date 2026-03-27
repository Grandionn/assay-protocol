// scripts/seed.js
// Registers 10 representative agents with varied capabilities.
//
// Two usage modes:
//
//   1. Direct (same process as the server, called from server.js AUTO_SEED):
//        const { seedDirect } = require('./scripts/seed');
//        await seedDirect();
//
//   2. HTTP (against a running server):
//        node scripts/seed.js [--url http://localhost:3000]
//        npm run seed

// ── Sample agent registry ─────────────────────────────────────────────────────
// stake units: USDC × 10^6  (e.g. 500_000_000 = 500 USDC)
// assayScore:  0 – 10 000

const SAMPLE_AGENTS = [
  {
    address:     '0xA001000000000000000000000000000000000001',
    capability:  'Solidity smart contract code review and security auditing. ' +
                 'Detects reentrancy, integer overflow, access control flaws, and gas ' +
                 'inefficiencies. Produces structured audit reports with severity ratings.',
    stake:       500_000_000,   // 500 USDC
    assayScore:  8750,
  },
  {
    address:     '0xA002000000000000000000000000000000000002',
    capability:  'Data analysis and statistical modelling using Python. ' +
                 'Builds pandas data pipelines, regression and classification models, ' +
                 'and interactive Plotly dashboards for business intelligence.',
    stake:       200_000_000,   // 200 USDC
    assayScore:  7200,
  },
  {
    address:     '0xA003000000000000000000000000000000000003',
    capability:  'AI image generation and creative visual design. ' +
                 'Fine-tunes Stable Diffusion checkpoints, engineers prompts for DALL-E and ' +
                 'Midjourney, produces consistent brand assets and concept art at scale.',
    stake:       150_000_000,   // 150 USDC
    assayScore:  6800,
  },
  {
    address:     '0xA004000000000000000000000000000000000004',
    capability:  'Professional language translation and localisation. ' +
                 'Fluent in Spanish, French, German, Japanese, and Mandarin Chinese. ' +
                 'Adapts tone and idiom for legal, marketing, and technical documents.',
    stake:       300_000_000,   // 300 USDC
    assayScore:  7500,
  },
  {
    address:     '0xA005000000000000000000000000000000000005',
    capability:  'DeFi protocol security audit and vulnerability research. ' +
                 'Specialises in flash-loan attack vectors, oracle manipulation, MEV ' +
                 'extraction, and cross-contract reentrancy in Uniswap-style AMMs.',
    stake:       800_000_000,   // 800 USDC
    assayScore:  9200,
  },
  {
    address:     '0xA006000000000000000000000000000000000006',
    capability:  'Web scraping, data extraction, and browser automation. ' +
                 'Builds robust Playwright and Puppeteer crawlers with anti-bot bypass, ' +
                 'structured JSON output, and incremental ETL pipelines.',
    stake:       100_000_000,   // 100 USDC
    assayScore:  6500,
  },
  {
    address:     '0xA007000000000000000000000000000000000007',
    capability:  'Natural language processing and text intelligence. ' +
                 'Abstractive summarisation, multi-label document classification, ' +
                 'named-entity recognition, and sentiment analysis using fine-tuned BERT models.',
    stake:       350_000_000,   // 350 USDC
    assayScore:  7800,
  },
  {
    address:     '0xA008000000000000000000000000000000000008',
    capability:  'On-chain DeFi analytics and yield optimisation. ' +
                 'Analyses liquidity pool APYs, computes impermanent loss curves, ' +
                 'monitors whale wallet flows, and back-tests yield farming strategies.',
    stake:       600_000_000,   // 600 USDC
    assayScore:  8200,
  },
  {
    address:     '0xA009000000000000000000000000000000000009',
    capability:  'Technical writing and developer documentation. ' +
                 'Produces API references, architecture decision records, onboarding guides, ' +
                 'and README files. Comfortable with OpenAPI specs and Docusaurus.',
    stake:       100_000_000,   // 100 USDC
    assayScore:  6000,
  },
  {
    address:     '0xA010000000000000000000000000000000000010',
    capability:  'Video processing and multimedia automation. ' +
                 'Writes FFmpeg pipelines for batch transcoding, auto-generates subtitles ' +
                 'with Whisper, cuts highlight reels, and produces social-media-ready clips.',
    stake:        80_000_000,   // 80 USDC
    assayScore:  5800,
  },
];

// ── Mode 1: direct in-process seeding ────────────────────────────────────────

/**
 * Embed all SAMPLE_AGENTS and insert them into the in-process vector store.
 * Returns the number of agents seeded.
 */
async function seedDirect() {
  const { getEmbedding } = require('../src/embedder');
  const store            = require('../src/vectorStore');

  console.log(`Seeding ${SAMPLE_AGENTS.length} sample agents…`);

  for (const agent of SAMPLE_AGENTS) {
    const embedding = await getEmbedding(agent.capability);
    store.upsert(agent.address, embedding, {
      ...agent,
      registeredAt: new Date().toISOString(),
    });
    console.log(`  ✓ ${agent.address.slice(0, 10)}…  (${agent.capability.slice(0, 48)}…)`);
  }

  console.log(`Seeding complete — ${SAMPLE_AGENTS.length} agents indexed.`);
  return SAMPLE_AGENTS.length;
}

// ── Mode 2: HTTP seeding against a running server ─────────────────────────────

async function seedHttp(baseUrl) {
  console.log(`Seeding ${SAMPLE_AGENTS.length} agents via HTTP → ${baseUrl}`);
  let ok = 0;

  for (const agent of SAMPLE_AGENTS) {
    const res = await fetch(`${baseUrl}/agents/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(agent),
    });

    if (res.ok) {
      console.log(`  ✓ ${agent.address.slice(0, 10)}…  (${agent.capability.slice(0, 48)}…)`);
      ok++;
    } else {
      const body = await res.json().catch(() => ({}));
      console.error(`  ✗ ${agent.address.slice(0, 10)}…  HTTP ${res.status}: ${body.error ?? res.statusText}`);
    }
  }

  console.log(`\nDone — ${ok}/${SAMPLE_AGENTS.length} agents registered.`);
  return ok;
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  // Parse optional --url flag; default to localhost
  const urlArg  = process.argv.find(a => a.startsWith('--url='));
  const baseUrl = urlArg
    ? urlArg.split('=')[1]
    : `http://localhost:${process.env.PORT || 3000}`;

  seedHttp(baseUrl)
    .then(n => { process.exitCode = n === SAMPLE_AGENTS.length ? 0 : 1; })
    .catch(err => {
      console.error('Seed failed:', err.message);
      console.error('Make sure the server is running:  npm start');
      process.exitCode = 1;
    });
}

module.exports = { SAMPLE_AGENTS, seedDirect, seedHttp };
