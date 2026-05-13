# Assay Protocol - Deployed Addresses (Base Mainnet)

**Network:** base
**Deployed at:** 2026-05-13T14:25:01.588Z
**Deployer:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`
**Treasury:** `0x328F5a2169D803211dC24aC6576FbE2545a9b51e`
**USDC:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
**Minimum Stake:** `10000000` (10 USDC, 6 decimals)

## Contract Addresses

| Contract | Address |
|---|---|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| AssayStakeRegistry | `0x2589D201414A4658eFED96ea34841fBE31416bb8` |
| AssayReputation | `0x713F6aa4D833A1943fE55032ABc647c72501949E` |
| AssayEscrow | `0xbFeC217471Ea83bBA123f4905C41009F1C2A6339` |
| AssayEscrow (deprecated) | `0x797b3e1C41fcA5ee5CB56bA7E2454e4545C6D70F` |
| ERC8004ReputationRegistry | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |

## Wiring

| Check | Result |
|---|---|
| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | true |
| Reputation.isAuthorizedCaller(AssayEscrow) | true |
| AssayEscrow.isAuthorizedVerifier(deployer) | true |
| AssayEscrow.erc8004Reputation() == ERC8004ReputationRegistry | true |
| StakeRegistry.isAuthorizedEscrow(deprecated) | false |
| Reputation.isAuthorizedCaller(deprecated) | false |

## Constructor Arguments Used for Verification

### AssayEscrow

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
0x2589D201414A4658eFED96ea34841fBE31416bb8
0x713F6aa4D833A1943fE55032ABc647c72501949E
0x328F5a2169D803211dC24aC6576FbE2545a9b51e
```

## Notes

- Treasury is currently set to the deployer address. Update it with setTreasury() if needed.
- ERC-8004 reputation feedback is configured to write into `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`.
- Mainnet uses canonical Base USDC; no MockUSDC is deployed.
