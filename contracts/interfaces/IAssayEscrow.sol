// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAssayEscrow
/// @notice Interface for querying escrow state
interface IAssayEscrow {
    enum EscrowStatus {
        Created,    // created, awaiting funding
        Funded,     // buyer funded, awaiting agent delivery
        Submitted,  // agent submitted deliverable hash, awaiting verification
        Settled,    // verified complete — payment released to agent
        Refunded,   // failed or expired — payment returned to buyer + stake slashed
        Disputed    // escalated to arbitration (future extension point)
    }

    /// @notice Returns the current status of an escrow
    function getEscrowStatus(uint256 escrowId) external view returns (EscrowStatus);
}
