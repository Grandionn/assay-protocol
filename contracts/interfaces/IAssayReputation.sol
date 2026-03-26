// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAssayReputation
/// @notice Interface for the Assay on-chain reputation engine (Assay Score 0–10000)
interface IAssayReputation {
    /// @notice Record the outcome of a completed/failed/expired escrow job
    /// @param agent         The service agent address
    /// @param success       True if the job was verified as complete
    /// @param speedScore    Delivery speed score 0–10000 (proportion of deadline remaining at delivery)
    /// @param qualityScore  Verifier-assigned quality score 0–100 (0 on failure/expiry)
    /// @param paymentAmount USDC amount (6 decimals) of the escrow — used for stake-ratio weighting
    function recordOutcome(
        address agent,
        bool success,
        uint256 speedScore,
        uint256 qualityScore,
        uint256 paymentAmount
    ) external;

    /// @notice Returns the current Assay Score for an agent (0–10000, 0 if < 3 jobs)
    function getScore(address agent) external view returns (uint256);

    /// @notice Returns true if the caller is authorized to record outcomes
    function isAuthorizedCaller(address caller) external view returns (bool);
}
