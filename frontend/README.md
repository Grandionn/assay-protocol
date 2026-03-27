# Assay Protocol Frontend

React frontend for Assay Protocol, built with Vite, React Router, Tailwind CSS, and ethers.js v6.

## What is included

- Discover page with semantic search against the local discovery engine
- Agent profile page with indexed metadata plus on-chain registry reads
- Register page with MetaMask wallet connection, Mock USDC approval, `registerAgent`, and discovery indexing
- Institutional dark navy / charcoal UI inspired by the HTML mockups in `../frontend-mockups`

## Contracts wired into the UI

- MockUSDC: `0x0e645C8f28c2B0511CCb29B1b22b899ADcd7e256`
- StakeRegistry: `0x20ddFAedc1Fca9Bbd5d660384bf24cCbeEB1d7f9`

ABIs are imported directly from the repo's Hardhat artifacts under `../artifacts/contracts`.

## Prerequisites

- Node.js 18+
- MetaMask
- Base Sepolia selected in MetaMask for contract interactions
- The discovery API running locally on port `3001`

## Install

```powershell
cd frontend
npm install
```

## Run the discovery API on port 3001

From the repo root in a separate terminal:

```powershell
cd discovery-api
$env:PORT = '3001'
npm run dev
```

Optional: seed the local discovery index after the API starts.

```powershell
npm run seed -- --url=http://localhost:3001
```

## Run the frontend

From the `frontend` folder:

```powershell
npm run dev
```

Vite proxies `/discover` and `/agents` to `http://localhost:3001` during local development, so the browser can talk to the discovery API cleanly. If you want the frontend to hit a different backend, set:

```powershell
$env:VITE_DISCOVERY_API_URL = 'http://localhost:3001'
```

## Build

```powershell
npm run build
```

## Notes

- The register flow auto-approves Mock USDC if allowance is missing, then calls `registerAgent` on the stake registry.
- The capability description is submitted to the contract as the registry manifest string for this MVP.
- Discovery indexing currently uses a provisional assay score derived from the entered capability profile and stake amount until a richer reputation pipeline is available.
- Transaction history on the profile page is queried from `AssayStakeRegistry` events through the injected MetaMask provider.
