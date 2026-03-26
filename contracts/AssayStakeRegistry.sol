// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAssayStakeRegistry.sol";

/// @title AssayStakeRegistry
/// @notice Agent registration with USDC stake deposits, slashing, and earnings tracking.
///         Authorized escrow contracts may call slash() and recordEarnings().
///         An agent's active status is computed dynamically: registered && stake >= minimumStake.
contract AssayStakeRegistry is IAssayStakeRegistry, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ────────────────────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;

    /// @notice Minimum USDC stake (6 decimals) required to be listed as active
    uint256 public minimumStake;

    /// @notice Receives 50% of every slash + 2.5% protocol fees from Escrow
    address public treasury;

    struct AgentInfo {
        uint256 stake;          // current USDC stake (6 decimals)
        string  capabilityHash; // IPFS CID pointing to capability manifest
        uint256 earnings;       // lifetime USDC earnings recorded by Escrow
        bool    registered;     // registration flag
        // NOTE: active status is computed dynamically: registered && stake >= minimumStake
    }

    mapping(address => AgentInfo) private _agents;
    mapping(address => bool)      private _authorizedEscrows;

    // ────────────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────────────

    event AgentRegistered(address indexed agent, uint256 stake, string capabilityHash);
    event StakeAdded(address indexed agent, uint256 amount, uint256 newTotal);
    event StakeWithdrawn(address indexed agent, uint256 amount, uint256 remaining);
    event AgentSlashed(
        address indexed agent,
        uint256 slashedAmount,
        address indexed buyer,
        uint256 toBuyer,
        uint256 toTreasury
    );
    event AgentDeactivated(address indexed agent);
    event AgentReactivated(address indexed agent);
    event EarningsRecorded(address indexed agent, uint256 amount, uint256 total);
    event EscrowAuthorized(address indexed escrow);
    event EscrowRevoked(address indexed escrow);
    event MinimumStakeUpdated(uint256 oldMin, uint256 newMin);
    event TreasuryUpdated(address oldTreasury, address newTreasury);
    event CapabilityHashUpdated(address indexed agent, string newHash);

    // ────────────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────────────

    error NotRegistered();
    error AlreadyRegistered();
    error InsufficientStake();
    error NotAuthorizedEscrow();
    error WithdrawalExceedsStake();
    error WithdrawalWouldDeactivate();
    error ZeroAmount();
    error ZeroAddress();

    // ────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────────────

    /// @param _usdc         USDC token address on Base
    /// @param _minimumStake Minimum stake in USDC (6 decimals), e.g. 100_000_000 = 100 USDC
    /// @param _treasury     Protocol treasury address
    constructor(
        address _usdc,
        uint256 _minimumStake,
        address _treasury
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _treasury == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
        minimumStake = _minimumStake;
        treasury = _treasury;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Modifiers
    // ────────────────────────────────────────────────────────────────────────────

    modifier onlyAuthorizedEscrow() {
        if (!_authorizedEscrows[msg.sender]) revert NotAuthorizedEscrow();
        _;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Agent actions
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice Register as an agent with an initial USDC stake
    /// @param capabilityHash IPFS CID of the agent's capability manifest
    /// @param stakeAmount    USDC amount to stake (must be >= minimumStake)
    function registerAgent(string calldata capabilityHash, uint256 stakeAmount) external nonReentrant {
        if (_agents[msg.sender].registered) revert AlreadyRegistered();
        if (stakeAmount < minimumStake)      revert InsufficientStake();

        usdc.safeTransferFrom(msg.sender, address(this), stakeAmount);

        _agents[msg.sender] = AgentInfo({
            stake:          stakeAmount,
            capabilityHash: capabilityHash,
            earnings:       0,
            registered:     true
        });

        emit AgentRegistered(msg.sender, stakeAmount, capabilityHash);
    }

    /// @notice Deposit additional stake (also reactivates if stake was below minimum)
    function addStake(uint256 amount) external nonReentrant {
        if (!_agents[msg.sender].registered) revert NotRegistered();
        if (amount == 0)                     revert ZeroAmount();

        bool wasActive = _agents[msg.sender].stake >= minimumStake;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _agents[msg.sender].stake += amount;

        if (!wasActive && _agents[msg.sender].stake >= minimumStake) {
            emit AgentReactivated(msg.sender);
        }

        emit StakeAdded(msg.sender, amount, _agents[msg.sender].stake);
    }

    /// @notice Withdraw stake, provided the remainder stays >= minimumStake (or withdrawing all)
    function withdrawStake(uint256 amount) external nonReentrant {
        AgentInfo storage agent = _agents[msg.sender];
        if (!agent.registered)  revert NotRegistered();
        if (amount == 0)        revert ZeroAmount();
        if (amount > agent.stake) revert WithdrawalExceedsStake();

        uint256 remaining = agent.stake - amount;
        // Partial withdrawal is allowed only if remaining >= minimumStake (or full withdrawal to 0)
        if (remaining > 0 && remaining < minimumStake) revert WithdrawalWouldDeactivate();

        bool wasActive = agent.stake >= minimumStake;
        agent.stake = remaining;

        if (wasActive && remaining < minimumStake) {
            emit AgentDeactivated(msg.sender);
        }

        usdc.safeTransfer(msg.sender, amount);
        emit StakeWithdrawn(msg.sender, amount, remaining);
    }

    /// @notice Update the capability hash (IPFS CID) for an agent
    function updateCapabilityHash(string calldata newHash) external {
        if (!_agents[msg.sender].registered) revert NotRegistered();
        _agents[msg.sender].capabilityHash = newHash;
        emit CapabilityHashUpdated(msg.sender, newHash);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Escrow-only actions
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice Slash an agent's stake. 50% sent to buyer, 50% to treasury.
    ///         Capped at available stake; auto-deactivates if stake < minimumStake after slash.
    function slash(address agent, uint256 amount, address buyer)
        external
        override
        onlyAuthorizedEscrow
    {
        AgentInfo storage info = _agents[agent];
        if (!info.registered) revert NotRegistered();

        // Cap slash at available stake so we never underflow
        uint256 slashAmount = amount > info.stake ? info.stake : amount;
        bool wasActive = info.stake >= minimumStake;
        info.stake -= slashAmount;

        uint256 toBuyer    = slashAmount / 2;
        uint256 toTreasury = slashAmount - toBuyer; // absorbs rounding remainder

        if (wasActive && info.stake < minimumStake) {
            emit AgentDeactivated(agent);
        }

        if (toBuyer    > 0) usdc.safeTransfer(buyer,    toBuyer);
        if (toTreasury > 0) usdc.safeTransfer(treasury, toTreasury);

        emit AgentSlashed(agent, slashAmount, buyer, toBuyer, toTreasury);
    }

    /// @notice Record payment earnings for an agent (called by Escrow on settlement)
    function recordEarnings(address agent, uint256 amount)
        external
        override
        onlyAuthorizedEscrow
    {
        if (!_agents[agent].registered) revert NotRegistered();
        _agents[agent].earnings += amount;
        emit EarningsRecorded(agent, amount, _agents[agent].earnings);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Owner administration
    // ────────────────────────────────────────────────────────────────────────────

    function authorizeEscrow(address escrow) external onlyOwner {
        if (escrow == address(0)) revert ZeroAddress();
        _authorizedEscrows[escrow] = true;
        emit EscrowAuthorized(escrow);
    }

    function revokeEscrow(address escrow) external onlyOwner {
        _authorizedEscrows[escrow] = false;
        emit EscrowRevoked(escrow);
    }

    function setMinimumStake(uint256 newMin) external onlyOwner {
        emit MinimumStakeUpdated(minimumStake, newMin);
        minimumStake = newMin;
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // View functions
    // ────────────────────────────────────────────────────────────────────────────

    function getStake(address agent) external view override returns (uint256) {
        return _agents[agent].stake;
    }

    function getEarnings(address agent) external view override returns (uint256) {
        return _agents[agent].earnings;
    }

    /// @notice Returns true if the agent is registered and has stake >= minimumStake.
    ///         Computed dynamically so it always reflects the current minimumStake.
    function isActive(address agent) external view override returns (bool) {
        AgentInfo storage info = _agents[agent];
        return info.registered && info.stake >= minimumStake;
    }

    function isAuthorizedEscrow(address escrow) external view override returns (bool) {
        return _authorizedEscrows[escrow];
    }

    function getAgentInfo(address agent) external view returns (AgentInfo memory) {
        return _agents[agent];
    }
}
