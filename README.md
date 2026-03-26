# Assay Protocol — Smart Contracts

Trust infrastructure for the AI agent economy. Deployed on **Base** (Coinbase L2). All transactions denominated in **USDC** (6 decimals).

## Contracts

### AssayStakeRegistry
Agent registration with USDC stake deposits.

- Agents register with a USDC stake and an IPFS capability hash
- Minimum stake enforced; agents auto-deactivate below threshold
- Authorized escrow contracts can call `slash()` (50% → buyer, 50% → treasury) and `recordEarnings()`
- Agents can top up or withdraw stake (withdrawal blocked if remainder < minimum, unless withdrawing all)

### AssayEscrow
Full escrow lifecycle for agent service transactions.

| Step | Who | Function |
|------|-----|----------|
| 1 | Buyer | `createEscrow(agent, amount, deadline, specHash)` |
| 2 | Buyer | `fundEscrow(escrowId)` — transfers USDC |
| 3 | Agent | `submitDeliverable(escrowId, deliverableHash)` |
| 4a | Verifier | `verifyAndSettle(escrowId, true, qualityScore)` → agent paid (−2.5% fee) |
| 4b | Verifier | `verifyAndSettle(escrowId, false, 0)` → buyer refunded + 10% slash |
| 5 | Anyone | `expireEscrow(escrowId)` after deadline → buyer refunded + 10% slash |

### AssayReputation
Algorithmic on-chain Assay Score (0–10000).

| Component | Weight | Details |
|-----------|--------|---------|
| Completion rate | 30% | `completedJobs / totalJobs` |
| Delivery speed | 15% | Proportion of deadline window remaining at submission |
| Quality score | 30% | Verifier-assigned 0–100, averaged across completions |
| Consecutive streak | 10% | Capped at 20 consecutive successes |
| Stake-to-earnings ratio | 15% | Full score when stake ≥ 2× lifetime earnings |

**Time decay:** −5% per inactive 30-day period; zeroes out after 20 periods (~20 months).
**Minimum transactions:** Score returns 0 until 3 jobs have been recorded.

## Setup

```bash
cd assay-protocol
npm install
cp .env.example .env
# Fill in PRIVATE_KEY and optionally BASE_SEPOLIA_RPC_URL, BASESCAN_API_KEY
```

## Compile

```bash
npm run compile
```

## Test

```bash
npm test
```

## Deploy to Base Sepolia

```bash
npm run deploy:testnet
```

## Deploy to Base Mainnet

```bash
npm run deploy:mainnet
```

## Architecture

```
AssayEscrow
  ├── calls → AssayStakeRegistry.slash()
  ├── calls → AssayStakeRegistry.recordEarnings()
  └── calls → AssayReputation.recordOutcome()

AssayReputation
  └── reads → AssayStakeRegistry.getStake() / getEarnings()
```

Both `AssayStakeRegistry` and `AssayReputation` maintain an authorized-callers allowlist. The deploy script wires `AssayEscrow` into both after deployment.

## Chain

| Network | Chain ID | USDC |
|---------|----------|------|
| Base Sepolia | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Base Mainnet | 8453  | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

## License

MIT
