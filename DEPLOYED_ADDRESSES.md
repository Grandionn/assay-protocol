# Assay Protocol - Deployed Addresses

## Base Mainnet Escrow Upgrade

**Network:** base
**Upgraded at:** 2026-05-12T10:38:00.783Z
**StakeRegistry:** `0x2589D201414A4658eFED96ea34841fBE31416bb8`
**Reputation:** `0x713F6aa4D833A1943fE55032ABc647c72501949E`
**USDC:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`

| Contract | Address |
| --- | --- |
| AssayEscrow | `0x797b3e1C41fcA5ee5CB56bA7E2454e4545C6D70F` |
| AssayEscrow (deprecated) | `0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe` |

| Check | Result |
| --- | --- |
| StakeRegistry.isAuthorizedEscrow(new) | true |
| StakeRegistry.isAuthorizedEscrow(deprecated) | false |
| Reputation.isAuthorizedCaller(new) | true |
| Reputation.isAuthorizedCaller(deprecated) | false |
| AssayEscrow.isAuthorizedVerifier(deployer) | true |

## Base Sepolia Deployment

**Network:** baseSepolia
**Deployed at:** 2026-03-27T16:47:15.063Z
**Deployer:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`
**Treasury:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`

### Contract Addresses

| Contract | Address |
| --- | --- |
| MockUSDC | `0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256` |
| AssayStakeRegistry | `0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9` |
| AssayReputation | `0xD6a81ADd33398A777640787b2f48D7A33D46fbab` |
| AssayEscrow | `0x17E177d698A244E13f84446982BA772eBdCed567` |

### Wiring

| Check | Result |
| --- | --- |
| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | true |
| Reputation.isAuthorizedCaller(AssayEscrow) | true |

### Notes

- Treasury is currently set to the deployer address. Update with `setTreasury()` before production use.
- MockUSDC is for Base Sepolia testnet only; mainnet deployment uses canonical USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
