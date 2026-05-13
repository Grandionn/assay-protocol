// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface IERC8004ReputationRegistry {
    function submitFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        string calldata endpointURI,
        string calldata fileURI,
        bytes32 fileHash
    ) external;
}
