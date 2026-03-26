// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Mintable ERC20 with 6 decimals for testnet use. Anyone can mint.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint any amount to any address — open to anyone on testnet
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
