# Assay Protocol — Deployed Addresses

**Network:** baseSepolia
**Deployed at:** 2026-03-27T16:47:15.063Z
**Deployer:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`
**Treasury:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`

## Contract Addresses

| Contract | Address |
|---|---|
| MockUSDC | `0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256` |
| AssayStakeRegistry | `0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9` |
| AssayReputation | `0xD6a81ADd33398A777640787b2f48D7A33D46fbab` |
| AssayEscrow | `0x17E177d698A244E13f84446982BA772eBdCed567` |

## Wiring

| Check | Result |
|---|---|
| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | ✅ true |
| Reputation.isAuthorizedCaller(AssayEscrow) | ✅ true |

## Notes

- Treasury is currently set to the deployer address. Update with `setTreasury()` before production use.
- MockUSDC is for Base Sepolia testnet only; mainnet deployment uses canonical USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
