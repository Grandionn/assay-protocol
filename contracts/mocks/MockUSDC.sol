// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mintable ERC20 with 6 decimals for Base Sepolia testnet use only.
///         Minting is blocked on all other chains to prevent accidental mainnet deployment.
contract MockUSDC is ERC20 {
    uint256 private constant BASE_SEPOLIA_CHAIN_ID = 84532;

    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint any amount to any address — Base Sepolia testnet only.
    /// @dev Reverts on any chain other than Base Sepolia (chainId 84532).
    function mint(address to, uint256 amount) external {
        require(block.chainid == BASE_SEPOLIA_CHAIN_ID, "MockUSDC: testnet only");
        _mint(to, amount);
    }
}
