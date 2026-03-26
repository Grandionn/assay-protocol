// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAssayStakeRegistry
/// @notice Interface for the Assay stake registry — agent registration, slashing, and earnings tracking
interface IAssayStakeRegistry {
    /// @notice Slash an agent's stake on escrow failure. 50% → buyer, 50% → treasury.
    /// @param agent   The agent being slashed
    /// @param amount  The amount to slash (capped at available stake)
    /// @param buyer   Receives 50% of the slashed amount
    function slash(address agent, uint256 amount, address buyer) external;

    /// @notice Record payment earnings for an agent after successful settlement
    function recordEarnings(address agent, uint256 amount) external;

    /// @notice Returns the current USDC stake held for an agent
    function getStake(address agent) external view returns (uint256);

    /// @notice Returns total lifetime earnings recorded for an agent
    function getEarnings(address agent) external view returns (uint256);

    /// @notice Returns true if the agent is active (stake >= minimum)
    function isActive(address agent) external view returns (bool);

    /// @notice Returns true if the address is an authorized escrow contract
    function isAuthorizedEscrow(address escrow) external view returns (bool);
}
