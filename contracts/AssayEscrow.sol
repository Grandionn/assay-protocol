// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IAssayStakeRegistry.sol";
import "./interfaces/IAssayReputation.sol";
import "./interfaces/IAssayEscrow.sol";

/// @title AssayEscrow
/// @notice Full escrow lifecycle for agent service transactions.
///
///   Flow:
///     1. Buyer calls createEscrow()  → status: Created
///     2. Buyer calls fundEscrow()    → status: Funded   (USDC locked)
///     3. Agent calls submitDeliverable() → status: Submitted
///     4a. Verifier calls verifyAndSettle(success=true)  → status: Settled
///         → agent receives payment minus 2.5% fee; earnings + reputation recorded
///     4b. Verifier calls verifyAndSettle(success=false) → status: Refunded
///         → buyer refunded; 10% of payment slashed from agent stake
///     5.  Anyone calls expireEscrow() after deadline    → status: Refunded
///         → buyer refunded; 10% of payment slashed from agent stake
contract AssayEscrow is IAssayEscrow, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ────────────────────────────────────────────────────────────────────────────
    // Constants
    // ────────────────────────────────────────────────────────────────────────────

    /// @dev Protocol fee in basis points: 250 = 2.5%
    uint256 public constant PROTOCOL_FEE_BPS = 250;

    /// @dev Slash amount as a percentage of escrow payment on failure/expiry: 10%
    uint256 public constant SLASH_PCT = 10;

    uint256 private constant BPS_DENOMINATOR = 10_000;

    // ────────────────────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IAssayStakeRegistry public immutable stakeRegistry;
    IAssayReputation    public immutable reputation;

    /// @notice Protocol fee recipient
    address public treasury;

    uint256 private _nextEscrowId;

    struct Escrow {
        address buyer;
        address agent;
        uint256 amount;             // USDC amount locked (6 decimals)
        uint256 deadline;           // unix timestamp: must settle/expire before this
        bytes32 specHash;           // keccak256 of service specification document
        bytes32 deliverableHash;    // keccak256 of delivered output (set by agent)
        EscrowStatus status;
        uint256 createdAt;
        uint256 fundedAt;
        uint256 submittedAt;
    }

    mapping(uint256 => Escrow)  private _escrows;
    mapping(address => bool)    private _authorizedVerifiers;

    // ────────────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────────────

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed buyer,
        address indexed agent,
        uint256 amount,
        uint256 deadline,
        bytes32 specHash
    );
    event EscrowFunded(uint256 indexed escrowId, uint256 amount);
    event DeliverableSubmitted(uint256 indexed escrowId, bytes32 deliverableHash);
    event EscrowSettled(
        uint256 indexed escrowId,
        address indexed agent,
        uint256 agentPayment,
        uint256 protocolFee
    );
    event EscrowRefunded(
        uint256 indexed escrowId,
        address indexed buyer,
        uint256 refundAmount,
        uint256 slashAmount
    );
    event VerifierAuthorized(address indexed verifier);
    event VerifierRevoked(address indexed verifier);
    event TreasuryUpdated(address oldTreasury, address newTreasury);

    // ────────────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────────────

    error EscrowNotFound();
    error NotBuyer();
    error NotAgent();
    error NotAuthorizedVerifier();
    error InvalidStatus(EscrowStatus current, EscrowStatus expected);
    error DeadlineInPast();
    error DeadlineNotReached();
    error ZeroAmount();
    error ZeroAddress();
    error AgentNotActive();

    // ────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────────────

    constructor(
        address _usdc,
        address _stakeRegistry,
        address _reputation,
        address _treasury
    ) Ownable(msg.sender) {
        if (_usdc == address(0) || _stakeRegistry == address(0) ||
            _reputation == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        usdc          = IERC20(_usdc);
        stakeRegistry = IAssayStakeRegistry(_stakeRegistry);
        reputation    = IAssayReputation(_reputation);
        treasury      = _treasury;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Escrow lifecycle
    // ────────────────────────────────────────────────────────────────────────────

    /// @notice Create an escrow agreement (no USDC transferred yet)
    /// @param agent    The service agent's address (must be registered and active)
    /// @param amount   USDC amount (6 decimals) to be paid on success
    /// @param deadline Unix timestamp by which the job must be settled
    /// @param specHash keccak256 of the off-chain service specification
    /// @return escrowId The new escrow identifier
    function createEscrow(
        address agent,
        uint256 amount,
        uint256 deadline,
        bytes32 specHash
    ) external returns (uint256 escrowId) {
        if (amount == 0)                       revert ZeroAmount();
        if (deadline <= block.timestamp)       revert DeadlineInPast();
        if (!stakeRegistry.isActive(agent))    revert AgentNotActive();

        escrowId = _nextEscrowId++;

        _escrows[escrowId] = Escrow({
            buyer:           msg.sender,
            agent:           agent,
            amount:          amount,
            deadline:        deadline,
            specHash:        specHash,
            deliverableHash: bytes32(0),
            status:          EscrowStatus.Created,
            createdAt:       block.timestamp,
            fundedAt:        0,
            submittedAt:     0
        });

        emit EscrowCreated(escrowId, msg.sender, agent, amount, deadline, specHash);
    }

    /// @notice Fund an existing escrow (transfers USDC from buyer to this contract)
    /// @dev Buyer must have approved this contract for at least `escrow.amount` USDC
    function fundEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        if (msg.sender != escrow.buyer)           revert NotBuyer();
        if (escrow.status != EscrowStatus.Created) {
            revert InvalidStatus(escrow.status, EscrowStatus.Created);
        }
        if (block.timestamp >= escrow.deadline)   revert DeadlineInPast();

        escrow.status   = EscrowStatus.Funded;
        escrow.fundedAt = block.timestamp;

        usdc.safeTransferFrom(msg.sender, address(this), escrow.amount);

        emit EscrowFunded(escrowId, escrow.amount);
    }

    /// @notice Agent submits the deliverable hash (content-addressed reference to output)
    /// @param deliverableHash keccak256 (or IPFS CID as bytes32) of the delivered work
    function submitDeliverable(uint256 escrowId, bytes32 deliverableHash) external {
        Escrow storage escrow = _getEscrow(escrowId);

        if (msg.sender != escrow.agent)          revert NotAgent();
        if (escrow.status != EscrowStatus.Funded) {
            revert InvalidStatus(escrow.status, EscrowStatus.Funded);
        }
        // Agent can still submit after deadline — verifier/buyer decides outcome
        escrow.status          = EscrowStatus.Submitted;
        escrow.deliverableHash = deliverableHash;
        escrow.submittedAt     = block.timestamp;

        emit DeliverableSubmitted(escrowId, deliverableHash);
    }

    /// @notice Authorized verifier settles or fails the escrow
    /// @param success      True → release payment; False → refund + slash
    /// @param qualityScore Verifier-assigned quality score 0–100 (ignored / set to 0 on failure)
    function verifyAndSettle(
        uint256 escrowId,
        bool    success,
        uint256 qualityScore
    ) external nonReentrant {
        if (!_authorizedVerifiers[msg.sender]) revert NotAuthorizedVerifier();

        Escrow storage escrow = _getEscrow(escrowId);

        if (escrow.status != EscrowStatus.Submitted) {
            revert InvalidStatus(escrow.status, EscrowStatus.Submitted);
        }

        if (success) {
            _settle(escrowId, escrow, qualityScore);
        } else {
            _refundAndSlash(escrowId, escrow, 0);
        }
    }

    /// @notice Anyone may expire an escrow after the deadline if it was never settled
    /// @dev Valid for Funded (agent never delivered) or Submitted (verifier never acted)
    function expireEscrow(uint256 escrowId) external nonReentrant {
        Escrow storage escrow = _getEscrow(escrowId);

        if (block.timestamp < escrow.deadline) revert DeadlineNotReached();

        if (escrow.status != EscrowStatus.Funded &&
            escrow.status != EscrowStatus.Submitted) {
            // Nothing to do — already settled/refunded/created-unfunded
            revert InvalidStatus(escrow.status, EscrowStatus.Funded);
        }

        _refundAndSlash(escrowId, escrow, 0);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Internal settlement logic
    // ────────────────────────────────────────────────────────────────────────────

    function _settle(uint256 escrowId, Escrow storage escrow, uint256 qualityScore) internal {
        escrow.status = EscrowStatus.Settled;

        uint256 fee         = (escrow.amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
        uint256 agentPayment = escrow.amount - fee;

        // Speed score: proportion of the funded→deadline window remaining at submission
        // Range 0–10000. If submitted after deadline: 0.
        uint256 speedScore = 0;
        uint256 window = escrow.deadline > escrow.fundedAt
            ? escrow.deadline - escrow.fundedAt
            : 0;
        if (window > 0 && escrow.submittedAt <= escrow.deadline) {
            uint256 remaining = escrow.deadline - escrow.submittedAt;
            speedScore = (remaining * 10_000) / window;
        }

        // Cap quality at 100
        uint256 clampedQuality = qualityScore > 100 ? 100 : qualityScore;

        // Record to external contracts
        stakeRegistry.recordEarnings(escrow.agent, agentPayment);
        reputation.recordOutcome(
            escrow.agent,
            true,
            speedScore,
            clampedQuality,
            escrow.amount
        );

        // Transfer funds
        usdc.safeTransfer(escrow.agent,  agentPayment);
        usdc.safeTransfer(treasury,      fee);

        emit EscrowSettled(escrowId, escrow.agent, agentPayment, fee);
    }

    function _refundAndSlash(uint256 escrowId, Escrow storage escrow, uint256 qualityScore) internal {
        escrow.status = EscrowStatus.Refunded;

        uint256 slashAmount = (escrow.amount * SLASH_PCT) / 100;

        // Record failed outcome (speed = 0, quality = 0)
        reputation.recordOutcome(
            escrow.agent,
            false,
            0,
            qualityScore,
            escrow.amount
        );

        // Refund full payment to buyer
        usdc.safeTransfer(escrow.buyer, escrow.amount);

        // Slash 10% of payment from agent's stake (50% → buyer, 50% → treasury via StakeRegistry)
        if (slashAmount > 0) {
            stakeRegistry.slash(escrow.agent, slashAmount, escrow.buyer);
        }

        emit EscrowRefunded(escrowId, escrow.buyer, escrow.amount, slashAmount);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Owner administration
    // ────────────────────────────────────────────────────────────────────────────

    function authorizeVerifier(address verifier) external onlyOwner {
        if (verifier == address(0)) revert ZeroAddress();
        _authorizedVerifiers[verifier] = true;
        emit VerifierAuthorized(verifier);
    }

    function revokeVerifier(address verifier) external onlyOwner {
        _authorizedVerifiers[verifier] = false;
        emit VerifierRevoked(verifier);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // View functions
    // ────────────────────────────────────────────────────────────────────────────

    function getEscrowStatus(uint256 escrowId) external view override returns (EscrowStatus) {
        return _escrows[escrowId].status;
    }

    function getEscrow(uint256 escrowId) external view returns (Escrow memory) {
        return _escrows[escrowId];
    }

    function isAuthorizedVerifier(address verifier) external view returns (bool) {
        return _authorizedVerifiers[verifier];
    }

    function nextEscrowId() external view returns (uint256) {
        return _nextEscrowId;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ────────────────────────────────────────────────────────────────────────────

    function _getEscrow(uint256 escrowId) internal view returns (Escrow storage) {
        Escrow storage escrow = _escrows[escrowId];
        if (escrow.createdAt == 0) revert EscrowNotFound();
        return escrow;
    }
}
