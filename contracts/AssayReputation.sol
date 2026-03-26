// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IAssayReputation.sol";
import "./interfaces/IAssayStakeRegistry.sol";

/// @title AssayReputation
/// @notice Fully on-chain, algorithmic Assay Score (0–10000) computed from objective
///         transaction data recorded by authorized escrow contracts.
///
///   Score weights:
///     - Completion rate          30%  (3000 pts)
///     - Delivery speed           15%  (1500 pts)
///     - Quality score            30%  (3000 pts)
///     - Consecutive success streak 10% (1000 pts)
///     - Stake-to-earnings ratio  15%  (1500 pts)
///
///   Time decay: score is multiplied by (100 − inactivePeriods × 5) / 100
///   per 30-day period of inactivity, reaching zero after 20 inactive periods.
///
///   Minimum 3 recorded transactions before the score activates (returns > 0).
contract AssayReputation is IAssayReputation, Ownable {

    // ────────────────────────────────────────────────────────────────────────────
    // Constants
    // ────────────────────────────────────────────────────────────────────────────

    uint256 public constant PERIOD_DURATION   = 30 days;
    uint256 public constant MIN_JOBS_FOR_SCORE = 3;

    /// @dev Decay: 5% per inactive 30-day period, floor at 20 periods (100%)
    uint256 public constant DECAY_PER_PERIOD  = 5;   // percent
    uint256 public constant MAX_DECAY_PERIODS = 20;  // 20 × 5% = 100%

    /// @dev Streak cap: 20 consecutive successes = full 1000-pt streak component
    uint256 public constant STREAK_CAP = 20;

    // ────────────────────────────────────────────────────────────────────────────
    // State
    // ────────────────────────────────────────────────────────────────────────────

    IAssayStakeRegistry public immutable stakeRegistry;

    struct AgentStats {
        uint256 totalJobs;            // all recorded jobs (success + failure)
        uint256 completedJobs;        // verified-success jobs
        uint256 totalSpeedScore;      // sum of speedScores (0–10000 each) for completed jobs
        uint256 totalQualityScore;    // sum of qualityScores (0–100 each) for completed jobs
        uint256 currentStreak;        // current consecutive-success count
        uint256 lastActivityPeriod;   // period index (timestamp / PERIOD_DURATION) of last record
    }

    mapping(address => AgentStats) private _stats;
    mapping(address => bool)       private _authorizedCallers;

    // ────────────────────────────────────────────────────────────────────────────
    // Events
    // ────────────────────────────────────────────────────────────────────────────

    event OutcomeRecorded(
        address indexed agent,
        bool    success,
        uint256 speedScore,
        uint256 qualityScore,
        uint256 newScore
    );
    event CallerAuthorized(address indexed caller);
    event CallerRevoked(address indexed caller);

    // ────────────────────────────────────────────────────────────────────────────
    // Errors
    // ────────────────────────────────────────────────────────────────────────────

    error NotAuthorizedCaller();
    error ZeroAddress();

    // ────────────────────────────────────────────────────────────────────────────
    // Constructor
    // ────────────────────────────────────────────────────────────────────────────

    constructor(address _stakeRegistry) Ownable(msg.sender) {
        if (_stakeRegistry == address(0)) revert ZeroAddress();
        stakeRegistry = IAssayStakeRegistry(_stakeRegistry);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Record outcomes (called by AssayEscrow)
    // ────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAssayReputation
    function recordOutcome(
        address agent,
        bool    success,
        uint256 speedScore,
        uint256 qualityScore,
        uint256 /*paymentAmount*/  // reserved for future weighting
    ) external override {
        if (!_authorizedCallers[msg.sender]) revert NotAuthorizedCaller();

        AgentStats storage stats = _stats[agent];

        stats.totalJobs++;

        if (success) {
            stats.completedJobs++;
            // Cap inputs to their declared ranges
            uint256 clampedSpeed   = speedScore   > 10_000 ? 10_000 : speedScore;
            uint256 clampedQuality = qualityScore > 100    ? 100    : qualityScore;
            stats.totalSpeedScore   += clampedSpeed;
            stats.totalQualityScore += clampedQuality;
            // Cap at STREAK_CAP at write time to keep storage bounded
            if (stats.currentStreak < STREAK_CAP) stats.currentStreak++;
        } else {
            // Break the streak on any failure
            stats.currentStreak = 0;
        }

        stats.lastActivityPeriod = _currentPeriod();

        uint256 newScore = _computeScore(agent, stats);

        emit OutcomeRecorded(agent, success, speedScore, qualityScore, newScore);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Score computation
    // ────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAssayReputation
    function getScore(address agent) external view override returns (uint256) {
        return _computeScore(agent, _stats[agent]);
    }

    /// @dev Computes the current Assay Score for an agent from their stored stats.
    ///      Pure integer arithmetic; no external calls except to stakeRegistry.
    function _computeScore(address agent, AgentStats storage stats)
        internal
        view
        returns (uint256)
    {
        // Minimum 3 transactions before score activates
        if (stats.totalJobs < MIN_JOBS_FOR_SCORE) return 0;

        // ── 1. Completion rate (30% = 3000 pts) ──────────────────────────────
        uint256 completionComponent = (stats.completedJobs * 3_000) / stats.totalJobs;

        // ── 2. Delivery speed (15% = 1500 pts) ───────────────────────────────
        // Average speed score across completed jobs, mapped to 0–1500.
        // totalSpeedScore is the sum of per-job scores (0–10000).
        uint256 speedComponent = 0;
        if (stats.completedJobs > 0) {
            uint256 avgSpeed = stats.totalSpeedScore / stats.completedJobs; // 0–10000
            speedComponent   = (avgSpeed * 1_500) / 10_000;
        }

        // ── 3. Quality score (30% = 3000 pts) ────────────────────────────────
        // Average quality across completed jobs (0–100), mapped to 0–3000.
        uint256 qualityComponent = 0;
        if (stats.completedJobs > 0) {
            uint256 avgQuality = stats.totalQualityScore / stats.completedJobs; // 0–100
            qualityComponent   = (avgQuality * 3_000) / 100;
        }

        // ── 4. Consecutive streak (10% = 1000 pts) ───────────────────────────
        // Capped at STREAK_CAP (20) for full 1000 pts.
        uint256 streak = stats.currentStreak > STREAK_CAP ? STREAK_CAP : stats.currentStreak;
        uint256 streakComponent = (streak * 1_000) / STREAK_CAP;

        // ── 5. Stake-to-earnings ratio (15% = 1500 pts) ──────────────────────
        // Full score when stake >= 2× lifetime earnings (skin in the game).
        uint256 stakeComponent = _stakeComponent(agent);

        // ── Raw score ─────────────────────────────────────────────────────────
        uint256 rawScore = completionComponent
            + speedComponent
            + qualityComponent
            + streakComponent
            + stakeComponent;

        // ── Time decay ────────────────────────────────────────────────────────
        // 5% decay per inactive 30-day period; zeroes out after 20 periods.
        uint256 currentPeriod = _currentPeriod();
        uint256 inactivePeriods = currentPeriod > stats.lastActivityPeriod
            ? currentPeriod - stats.lastActivityPeriod
            : 0;

        if (inactivePeriods == 0) {
            return rawScore;
        }
        if (inactivePeriods >= MAX_DECAY_PERIODS) {
            return 0;
        }

        uint256 decayFactor = 100 - (inactivePeriods * DECAY_PER_PERIOD); // e.g. 1 period → 95
        return (rawScore * decayFactor) / 100;
    }

    /// @dev Stake-to-earnings component (0–1500 pts).
    ///      Full 1500 when stake >= 2× lifetime earnings.
    ///      750 baseline if agent is staked but has no earnings yet.
    function _stakeComponent(address agent) internal view returns (uint256) {
        uint256 stake    = stakeRegistry.getStake(agent);
        uint256 earnings = stakeRegistry.getEarnings(agent);

        if (stake == 0) return 0;
        if (earnings == 0) return 750; // staked but unproven → 50% credit

        // Ratio scaled ×10000: 20000 means stake = 2× earnings (full score)
        uint256 ratio = (stake * 20_000) / earnings;
        if (ratio >= 20_000) return 1_500;
        return (ratio * 1_500) / 20_000;
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Owner administration
    // ────────────────────────────────────────────────────────────────────────────

    function authorizeCaller(address caller) external onlyOwner {
        if (caller == address(0)) revert ZeroAddress();
        _authorizedCallers[caller] = true;
        emit CallerAuthorized(caller);
    }

    function revokeCaller(address caller) external onlyOwner {
        _authorizedCallers[caller] = false;
        emit CallerRevoked(caller);
    }

    // ────────────────────────────────────────────────────────────────────────────
    // View functions
    // ────────────────────────────────────────────────────────────────────────────

    /// @inheritdoc IAssayReputation
    function isAuthorizedCaller(address caller) external view override returns (bool) {
        return _authorizedCallers[caller];
    }

    function getAgentStats(address agent) external view returns (AgentStats memory) {
        return _stats[agent];
    }

    // ────────────────────────────────────────────────────────────────────────────
    // Internal helpers
    // ────────────────────────────────────────────────────────────────────────────

    function _currentPeriod() internal view returns (uint256) {
        return block.timestamp / PERIOD_DURATION;
    }
}
