# Assay Protocol - Deployed Addresses (Base Mainnet)

**Network:** base
**Chain ID:** 8453
**Deployed at:** 2026-05-11T09:19:21.5612291Z
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
| AssayEscrow | `0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe` |

## Wiring

| Check | Result |
|---|---|
| StakeRegistry.isAuthorizedEscrow(AssayEscrow) | true |
| Reputation.isAuthorizedCaller(AssayEscrow) | true |

## Basescan Verification

| Contract | Link |
|---|---|
| AssayStakeRegistry | [basescan.org/address/0x2589D201414A4658eFED96ea34841fBE31416bb8#code](https://basescan.org/address/0x2589D201414A4658eFED96ea34841fBE31416bb8#code) |
| AssayReputation | [basescan.org/address/0x713F6aa4D833A1943fE55032ABc647c72501949E#code](https://basescan.org/address/0x713F6aa4D833A1943fE55032ABc647c72501949E#code) |
| AssayEscrow | [basescan.org/address/0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe#code](https://basescan.org/address/0xC0Ce47838aCF7Dfb77ae3a6161B552604Ae8aaEe#code) |

## Constructor Arguments Used for Verification

### AssayStakeRegistry

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
10000000
0x328F5a2169D803211dC24aC6576FbE2545a9b51e
```

### AssayReputation

```text
0x2589D201414A4658eFED96ea34841fBE31416bb8
```

### AssayEscrow

```text
0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
0x2589D201414A4658eFED96ea34841fBE31416bb8
0x713F6aa4D833A1943fE55032ABc647c72501949E
0x328F5a2169D803211dC24aC6576FbE2545a9b51e
```

## Notes

- No MockUSDC was deployed on mainnet.
- The deployment mirrors testnet wiring and uses canonical Base mainnet USDC.
- Treasury is currently set to the deployer address. Update it with `setTreasury()` if needed.
