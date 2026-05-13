// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract MockERC8004ReputationRegistry {
    struct Feedback {
        uint256 agentId;
        int128 value;
        uint8 valueDecimals;
        bytes32 tag1;
        bytes32 tag2;
        string endpointURI;
        string fileURI;
        bytes32 fileHash;
    }

    Feedback public lastFeedback;
    uint256 public submitCount;
    bool public shouldRevert;

    event FeedbackSubmitted(
        uint256 indexed agentId,
        int128 value,
        uint8 valueDecimals,
        bytes32 indexed tag1,
        bytes32 indexed tag2,
        string endpointURI,
        string fileURI,
        bytes32 fileHash
    );

    function setShouldRevert(bool value) external {
        shouldRevert = value;
    }

    function submitFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        bytes32 tag1,
        bytes32 tag2,
        string calldata endpointURI,
        string calldata fileURI,
        bytes32 fileHash
    ) external {
        if (shouldRevert) {
            revert("mock failure");
        }

        lastFeedback = Feedback({
            agentId: agentId,
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            endpointURI: endpointURI,
            fileURI: fileURI,
            fileHash: fileHash
        });
        submitCount += 1;

        emit FeedbackSubmitted(agentId, value, valueDecimals, tag1, tag2, endpointURI, fileURI, fileHash);
    }
}
