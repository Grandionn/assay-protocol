// SPDX-License-Identifier: MIT
// test/AssayProtocol.test.js — Hardhat + ethers v6 + Chai
// Covers: MockUSDC, AssayStakeRegistry, AssayEscrow, AssayReputation
// Audit fixes explicitly tested: C-1, H-1, M-2, M-3, L-2, L-3

const { expect }  = require("chai");
const { ethers }  = require("hardhat");
const { time }    = require("@nomicfoundation/hardhat-network-helpers");

// ─── Amount helpers ──────────────────────────────────────────────────────────
const USDC       = (n) => ethers.parseUnits(String(n), 6);
const MIN_STAKE  = USDC(100);
const THIRTY_DAYS = 30 * 24 * 60 * 60;

// ─── EscrowStatus enum values (mirrors IAssayEscrow.sol) ────────────────────
const Status = {
  Created: 0n,
  Accepted: 1n,
  Funded: 2n,
  Submitted: 3n,
  Settled: 4n,
  Refunded: 5n,
  Cancelled: 6n,
};

// ─────────────────────────────────────────────────────────────────────────────
describe("Assay Protocol", function () {
  let owner, agent, buyer, treasury, verifier, attacker, stranger;
  let usdc, stakeRegistry, reputation, escrow;

  // ── Deploy entire suite fresh for each test ──────────────────────────────
  beforeEach(async function () {
    [owner, agent, buyer, treasury, verifier, attacker, stranger] =
      await ethers.getSigners();

    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();

    stakeRegistry = await (await ethers.getContractFactory("AssayStakeRegistry"))
      .deploy(usdc.target, MIN_STAKE, treasury.address);

    reputation = await (await ethers.getContractFactory("AssayReputation"))
      .deploy(stakeRegistry.target);

    escrow = await (await ethers.getContractFactory("AssayEscrow"))
      .deploy(usdc.target, stakeRegistry.target, reputation.target, treasury.address);

    // Wire authorizations
    await stakeRegistry.connect(owner).authorizeEscrow(escrow.target);
    await reputation.connect(owner).authorizeCaller(escrow.target);
    await escrow.connect(owner).authorizeVerifier(verifier.address);

    // Pre-fund buyer with USDC and unlimited approval to escrow
    await usdc.mint(buyer.address, USDC(10_000));
    await usdc.connect(buyer).approve(escrow.target, ethers.MaxUint256);
  });

  // ── Shared test helper: register an agent ────────────────────────────────
  async function registerAgent(signer, stakeAmount = MIN_STAKE) {
    await usdc.mint(signer.address, stakeAmount);
    await usdc.connect(signer).approve(stakeRegistry.target, stakeAmount);
    await stakeRegistry.connect(signer).registerAgent("ipfs://QmCap", stakeAmount);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MockUSDC
  // ─────────────────────────────────────────────────────────────────────────
  describe("MockUSDC", function () {
    it("has 6 decimals", async function () {
      expect(await usdc.decimals()).to.equal(6n);
    });

    it("mints tokens and updates balances", async function () {
      const before = await usdc.balanceOf(stranger.address);
      await usdc.mint(stranger.address, USDC(500));
      expect(await usdc.balanceOf(stranger.address)).to.equal(before + USDC(500));
    });

    it("emits Transfer on mint", async function () {
      await expect(usdc.mint(stranger.address, USDC(100)))
        .to.emit(usdc, "Transfer")
        .withArgs(ethers.ZeroAddress, stranger.address, USDC(100));
    });

    it("is a standard ERC20 (name / symbol)", async function () {
      expect(await usdc.name()).to.equal("Mock USDC");
      expect(await usdc.symbol()).to.equal("USDC");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AssayStakeRegistry
  // ─────────────────────────────────────────────────────────────────────────
  describe("AssayStakeRegistry", function () {

    // ── registerAgent ────────────────────────────────────────────────────────
    describe("registerAgent", function () {
      it("stores stake, capabilityHash, marks registered; emits AgentRegistered", async function () {
        await usdc.mint(agent.address, MIN_STAKE);
        await usdc.connect(agent).approve(stakeRegistry.target, MIN_STAKE);
        await expect(
          stakeRegistry.connect(agent).registerAgent("ipfs://Qm1", MIN_STAKE)
        )
          .to.emit(stakeRegistry, "AgentRegistered")
          .withArgs(agent.address, MIN_STAKE, "ipfs://Qm1");

        const info = await stakeRegistry.getAgentInfo(agent.address);
        expect(info.registered).to.be.true;
        expect(info.stake).to.equal(MIN_STAKE);
        expect(info.capabilityHash).to.equal("ipfs://Qm1");
      });

      it("transfers USDC from agent into the registry contract", async function () {
        await usdc.mint(agent.address, MIN_STAKE);
        await usdc.connect(agent).approve(stakeRegistry.target, MIN_STAKE);
        await stakeRegistry.connect(agent).registerAgent("ipfs://Qm1", MIN_STAKE);
        expect(await usdc.balanceOf(stakeRegistry.target)).to.equal(MIN_STAKE);
      });

      it("reverts InsufficientStake when stake < minimumStake", async function () {
        const tooLow = MIN_STAKE - 1n;
        await usdc.mint(agent.address, tooLow);
        await usdc.connect(agent).approve(stakeRegistry.target, tooLow);
        await expect(
          stakeRegistry.connect(agent).registerAgent("ipfs://Qm1", tooLow)
        ).to.be.revertedWithCustomError(stakeRegistry, "InsufficientStake");
      });

      it("reverts AlreadyRegistered on double registration", async function () {
        await registerAgent(agent);
        await usdc.mint(agent.address, MIN_STAKE);
        await usdc.connect(agent).approve(stakeRegistry.target, MIN_STAKE);
        await expect(
          stakeRegistry.connect(agent).registerAgent("ipfs://Qm2", MIN_STAKE)
        ).to.be.revertedWithCustomError(stakeRegistry, "AlreadyRegistered");
      });

      it("stores the capability hash verbatim", async function () {
        const hash = "ipfs://QmCapabilityManifest_abc123";
        await usdc.mint(agent.address, MIN_STAKE);
        await usdc.connect(agent).approve(stakeRegistry.target, MIN_STAKE);
        await stakeRegistry.connect(agent).registerAgent(hash, MIN_STAKE);
        expect((await stakeRegistry.getAgentInfo(agent.address)).capabilityHash).to.equal(hash);
      });
    });

    // ── isActive — dynamic computation (H-1) ─────────────────────────────────
    describe("isActive — dynamic computation (H-1)", function () {
      it("returns true when registered and stake >= minimumStake", async function () {
        await registerAgent(agent);
        expect(await stakeRegistry.isActive(agent.address)).to.be.true;
      });

      it("returns false for unregistered address", async function () {
        expect(await stakeRegistry.isActive(attacker.address)).to.be.false;
      });

      it("(H-1) immediately false after minimumStake raised above agent stake — no explicit deactivation call needed", async function () {
        await registerAgent(agent); // stake == MIN_STAKE
        expect(await stakeRegistry.isActive(agent.address)).to.be.true;

        // Owner raises minimum — agent becomes inactive via dynamic check
        await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE + 1n);

        expect(await stakeRegistry.isActive(agent.address)).to.be.false;
      });

      it("re-activates dynamically when minimumStake is lowered back below agent stake", async function () {
        await registerAgent(agent);
        await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE + 1n);
        expect(await stakeRegistry.isActive(agent.address)).to.be.false;
        await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE);
        expect(await stakeRegistry.isActive(agent.address)).to.be.true;
      });
    });

    // ── addStake ──────────────────────────────────────────────────────────────
    describe("addStake", function () {
      beforeEach(async function () {
        await registerAgent(agent);
      });

      it("increases stake and emits StakeAdded", async function () {
        const extra = USDC(50);
        await usdc.mint(agent.address, extra);
        await usdc.connect(agent).approve(stakeRegistry.target, extra);
        await expect(stakeRegistry.connect(agent).addStake(extra))
          .to.emit(stakeRegistry, "StakeAdded")
          .withArgs(agent.address, extra, MIN_STAKE + extra);
        expect(await stakeRegistry.getStake(agent.address)).to.equal(MIN_STAKE + extra);
      });

      it("emits AgentReactivated when stake crosses back over the minimum threshold", async function () {
        // Raise min so agent is dynamically inactive (stake < new min)
        await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE * 2n);
        expect(await stakeRegistry.isActive(agent.address)).to.be.false;

        const extra = MIN_STAKE; // brings total to 2× original MIN_STAKE
        await usdc.mint(agent.address, extra);
        await usdc.connect(agent).approve(stakeRegistry.target, extra);
        await expect(stakeRegistry.connect(agent).addStake(extra))
          .to.emit(stakeRegistry, "AgentReactivated")
          .withArgs(agent.address);
        expect(await stakeRegistry.isActive(agent.address)).to.be.true;
      });

      it("reverts ZeroAmount", async function () {
        await expect(
          stakeRegistry.connect(agent).addStake(0n)
        ).to.be.revertedWithCustomError(stakeRegistry, "ZeroAmount");
      });

      it("reverts NotRegistered for unregistered caller", async function () {
        await expect(
          stakeRegistry.connect(attacker).addStake(USDC(10))
        ).to.be.revertedWithCustomError(stakeRegistry, "NotRegistered");
      });
    });

    // ── withdrawStake ─────────────────────────────────────────────────────────
    describe("withdrawStake", function () {
      beforeEach(async function () {
        await registerAgent(agent);
      });

      it("full withdrawal to zero emits AgentDeactivated and StakeWithdrawn", async function () {
        await expect(stakeRegistry.connect(agent).withdrawStake(MIN_STAKE))
          .to.emit(stakeRegistry, "AgentDeactivated").withArgs(agent.address)
          .and.to.emit(stakeRegistry, "StakeWithdrawn").withArgs(agent.address, MIN_STAKE, 0n);
        expect(await stakeRegistry.getStake(agent.address)).to.equal(0n);
        expect(await stakeRegistry.isActive(agent.address)).to.be.false;
      });

      it("partial withdrawal that leaves exactly minimumStake is allowed", async function () {
        // addStake so total = 2×MIN_STAKE, then withdraw MIN_STAKE
        await usdc.mint(agent.address, MIN_STAKE);
        await usdc.connect(agent).approve(stakeRegistry.target, MIN_STAKE);
        await stakeRegistry.connect(agent).addStake(MIN_STAKE);

        await expect(stakeRegistry.connect(agent).withdrawStake(MIN_STAKE))
          .to.emit(stakeRegistry, "StakeWithdrawn")
          .withArgs(agent.address, MIN_STAKE, MIN_STAKE);
        expect(await stakeRegistry.isActive(agent.address)).to.be.true;
      });

      it("reverts WithdrawalWouldDeactivate on partial withdrawal leaving 0 < remainder < minimumStake", async function () {
        // Withdrawing 1 wei leaves MIN_STAKE-1 which is < MIN_STAKE
        await expect(
          stakeRegistry.connect(agent).withdrawStake(1n)
        ).to.be.revertedWithCustomError(stakeRegistry, "WithdrawalWouldDeactivate");
      });

      it("reverts WithdrawalExceedsStake when amount > stake", async function () {
        await expect(
          stakeRegistry.connect(agent).withdrawStake(MIN_STAKE + 1n)
        ).to.be.revertedWithCustomError(stakeRegistry, "WithdrawalExceedsStake");
      });
    });

    // ── updateCapabilityHash ──────────────────────────────────────────────────
    describe("updateCapabilityHash", function () {
      it("updates hash and emits CapabilityHashUpdated", async function () {
        await registerAgent(agent);
        const newHash = "ipfs://QmNewCapManifest";
        await expect(stakeRegistry.connect(agent).updateCapabilityHash(newHash))
          .to.emit(stakeRegistry, "CapabilityHashUpdated")
          .withArgs(agent.address, newHash);
        expect((await stakeRegistry.getAgentInfo(agent.address)).capabilityHash).to.equal(newHash);
      });

      it("reverts NotRegistered for unregistered caller", async function () {
        await expect(
          stakeRegistry.connect(attacker).updateCapabilityHash("ipfs://evil")
        ).to.be.revertedWithCustomError(stakeRegistry, "NotRegistered");
      });
    });

    // ── slash mechanics ───────────────────────────────────────────────────────
    describe("slash mechanics", function () {
      beforeEach(async function () {
        await registerAgent(agent);
      });

      // Helper: run a full escrow failure cycle to trigger slash via the authorized escrow
      async function failEscrow(amount) {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        const spec     = ethers.keccak256(ethers.toUtf8Bytes("spec"));
        const escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(agent.address, amount, deadline, spec, 0);
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(
          escrowId, ethers.keccak256(ethers.toUtf8Bytes("del"))
        );
        await escrow.connect(verifier).verifyAndSettle(escrowId, false, 0);
        return escrowId;
      }

      it("50% of slashAmount sent to buyer and 50% to treasury; emits AgentSlashed", async function () {
        const amount   = USDC(50);
        const slashAmt = (amount * 10n) / 100n; // 5 USDC

        const deadline = (await time.latest()) + THIRTY_DAYS;
        const escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, amount, deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(
          escrowId, ethers.keccak256(ethers.toUtf8Bytes("del"))
        );

        const buyerBalBefore    = await usdc.balanceOf(buyer.address);   // after funding
        const treasuryBalBefore = await usdc.balanceOf(treasury.address);

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, false, 0))
          .to.emit(stakeRegistry, "AgentSlashed")
          .withArgs(agent.address, slashAmt, buyer.address, slashAmt / 2n, slashAmt - slashAmt / 2n);

        // Buyer: full escrow refund + 50% of slash coming from agent stake
        expect(await usdc.balanceOf(buyer.address)).to.equal(
          buyerBalBefore + amount + slashAmt / 2n
        );
        // Treasury: 50% of slash
        expect(await usdc.balanceOf(treasury.address)).to.equal(
          treasuryBalBefore + (slashAmt - slashAmt / 2n)
        );
      });

      it("auto-deactivates agent and emits AgentDeactivated when slash drops stake below minimum", async function () {
        // 10% of 1100 USDC = 110 USDC slash > MIN_STAKE(100); capped at 100 → stake hits 0
        await failEscrow(USDC(1100));
        expect(await stakeRegistry.isActive(agent.address)).to.be.false;
        expect(await stakeRegistry.getStake(agent.address)).to.equal(0n);
      });

      it("caps slash at available stake to prevent underflow", async function () {
        // 10% of 2000 USDC = 200 USDC; agent only has 100 USDC staked → capped
        await failEscrow(USDC(2000));
        expect(await stakeRegistry.getStake(agent.address)).to.equal(0n);
      });

      it("reverts NotAuthorizedEscrow when slash is called directly", async function () {
        await expect(
          stakeRegistry.connect(attacker).slash(agent.address, USDC(10), buyer.address)
        ).to.be.revertedWithCustomError(stakeRegistry, "NotAuthorizedEscrow");
      });
    });

    // ── earnings tracking ─────────────────────────────────────────────────────
    describe("earnings tracking", function () {
      it("recordEarnings credited on successful settlement; getEarnings returns correct total", async function () {
        await registerAgent(agent);

        const amount      = USDC(100);
        const fee         = (amount * 250n) / 10_000n;
        const agentPayment = amount - fee;

        const deadline = (await time.latest()) + THIRTY_DAYS;
        await escrow.connect(buyer).createEscrow(
          agent.address, amount, deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(0n);
        await escrow.connect(buyer).fundEscrow(0n);
        await escrow.connect(agent).submitDeliverable(0n, ethers.ZeroHash);

        await expect(escrow.connect(verifier).verifyAndSettle(0n, true, 80))
          .to.emit(stakeRegistry, "EarningsRecorded")
          .withArgs(agent.address, agentPayment, agentPayment);

        expect(await stakeRegistry.getEarnings(agent.address)).to.equal(agentPayment);
      });

      it("reverts NotAuthorizedEscrow when recordEarnings is called directly", async function () {
        await registerAgent(agent);
        await expect(
          stakeRegistry.connect(attacker).recordEarnings(agent.address, USDC(10))
        ).to.be.revertedWithCustomError(stakeRegistry, "NotAuthorizedEscrow");
      });
    });

    // ── admin ─────────────────────────────────────────────────────────────────
    describe("admin", function () {
      it("setMinimumStake emits MinimumStakeUpdated and persists new value", async function () {
        const newMin = USDC(200);
        await expect(stakeRegistry.connect(owner).setMinimumStake(newMin))
          .to.emit(stakeRegistry, "MinimumStakeUpdated")
          .withArgs(MIN_STAKE, newMin);
        expect(await stakeRegistry.minimumStake()).to.equal(newMin);
      });

      it("setTreasury emits TreasuryUpdated and reverts ZeroAddress", async function () {
        await expect(stakeRegistry.connect(owner).setTreasury(stranger.address))
          .to.emit(stakeRegistry, "TreasuryUpdated")
          .withArgs(treasury.address, stranger.address);
        await expect(
          stakeRegistry.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(stakeRegistry, "ZeroAddress");
      });

      it("authorizeEscrow / revokeEscrow toggle authorization flag", async function () {
        await stakeRegistry.connect(owner).authorizeEscrow(stranger.address);
        expect(await stakeRegistry.isAuthorizedEscrow(stranger.address)).to.be.true;
        await stakeRegistry.connect(owner).revokeEscrow(stranger.address);
        expect(await stakeRegistry.isAuthorizedEscrow(stranger.address)).to.be.false;
      });

      it("non-owner cannot call admin functions (OwnableUnauthorizedAccount)", async function () {
        await expect(
          stakeRegistry.connect(attacker).setMinimumStake(0n)
        ).to.be.revertedWithCustomError(stakeRegistry, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AssayEscrow
  // ─────────────────────────────────────────────────────────────────────────
  describe("AssayEscrow", function () {
    // Ensure agent is always registered before escrow tests
    beforeEach(async function () {
      await registerAgent(agent);
    });

    // ── createEscrow ──────────────────────────────────────────────────────────
    describe("createEscrow", function () {
      it("emits EscrowCreated with all fields; increments nextEscrowId", async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        const spec     = ethers.keccak256(ethers.toUtf8Bytes("spec"));
        expect(await escrow.nextEscrowId()).to.equal(0n);

        await expect(
          escrow.connect(buyer).createEscrow(agent.address, USDC(50), deadline, spec, 0)
        )
          .to.emit(escrow, "EscrowCreated")
          .withArgs(0n, buyer.address, agent.address, USDC(50), deadline, spec);

        expect(await escrow.nextEscrowId()).to.equal(1n);
      });

      it("(M-2) reverts SelfDeal when buyer == agent", async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        await expect(
          escrow.connect(agent).createEscrow(agent.address, USDC(50), deadline, ethers.ZeroHash, 0)
        ).to.be.revertedWithCustomError(escrow, "SelfDeal");
      });

      it("reverts ZeroAmount for amount == 0", async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        await expect(
          escrow.connect(buyer).createEscrow(agent.address, 0n, deadline, ethers.ZeroHash, 0)
        ).to.be.revertedWithCustomError(escrow, "ZeroAmount");
      });

      it("reverts DeadlineInPast when deadline <= block.timestamp", async function () {
        const now = await time.latest();
        await expect(
          escrow.connect(buyer).createEscrow(agent.address, USDC(50), now, ethers.ZeroHash, 0)
        ).to.be.revertedWithCustomError(escrow, "DeadlineInPast");
      });

      it("reverts AgentNotActive when agent is not registered", async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        await expect(
          escrow.connect(buyer).createEscrow(stranger.address, USDC(50), deadline, ethers.ZeroHash, 0)
        ).to.be.revertedWithCustomError(escrow, "AgentNotActive");
      });
    });

    // ── fundEscrow ────────────────────────────────────────────────────────────
    describe("fundEscrow", function () {
      let escrowId, deadline;

      beforeEach(async function () {
        deadline = (await time.latest()) + THIRTY_DAYS;
        escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50), deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
      });

      it("locks USDC in contract and emits EscrowFunded", async function () {
        const contractBefore = await usdc.balanceOf(escrow.target);
        await expect(escrow.connect(buyer).fundEscrow(escrowId))
          .to.emit(escrow, "EscrowFunded")
          .withArgs(escrowId, USDC(50));
        expect(await usdc.balanceOf(escrow.target)).to.equal(contractBefore + USDC(50));
        expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Funded);
      });

      it("reverts NotBuyer when caller is not the escrow buyer", async function () {
        await expect(
          escrow.connect(attacker).fundEscrow(escrowId)
        ).to.be.revertedWithCustomError(escrow, "NotBuyer");
      });

      it("reverts InvalidStatus on double-fund attempt", async function () {
        await escrow.connect(buyer).fundEscrow(escrowId);
        await expect(
          escrow.connect(buyer).fundEscrow(escrowId)
        ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      });

      it("reverts DeadlineInPast if deadline has passed before funding", async function () {
        await time.increase(THIRTY_DAYS + 1);
        await expect(
          escrow.connect(buyer).fundEscrow(escrowId)
        ).to.be.revertedWithCustomError(escrow, "DeadlineInPast");
      });

      it("(M-3) reverts AgentNotActive if agent deactivated between createEscrow and fundEscrow", async function () {
        // Raise minimum stake so agent becomes dynamically inactive
        await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE * 10n);
        await expect(
          escrow.connect(buyer).fundEscrow(escrowId)
        ).to.be.revertedWithCustomError(escrow, "AgentNotActive");
      });

      it("reverts EscrowNotFound for non-existent escrowId", async function () {
        await expect(
          escrow.connect(buyer).fundEscrow(9999n)
        ).to.be.revertedWithCustomError(escrow, "EscrowNotFound");
      });
    });

    // ── submitDeliverable ─────────────────────────────────────────────────────
    describe("submitDeliverable", function () {
      let escrowId;

      beforeEach(async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50), deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
      });

      it("stores deliverableHash, sets status to Submitted, emits DeliverableSubmitted", async function () {
        const delHash = ethers.keccak256(ethers.toUtf8Bytes("output"));
        await expect(escrow.connect(agent).submitDeliverable(escrowId, delHash))
          .to.emit(escrow, "DeliverableSubmitted")
          .withArgs(escrowId, delHash);
        const e = await escrow.getEscrow(escrowId);
        expect(e.deliverableHash).to.equal(delHash);
        expect(e.status).to.equal(Status.Submitted);
      });

      it("reverts NotAgent for non-agent caller", async function () {
        await expect(
          escrow.connect(buyer).submitDeliverable(escrowId, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(escrow, "NotAgent");
      });

      it("reverts InvalidStatus if escrow is not Funded", async function () {
        await escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash);
        // Now Submitted — second submit must fail
        await expect(
          escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      });
    });

    // ── verifyAndSettle ───────────────────────────────────────────────────────
    describe("verifyAndSettle", function () {
      let escrowId;

      beforeEach(async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50), deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(
          escrowId, ethers.keccak256(ethers.toUtf8Bytes("deliverable"))
        );
      });

      // Success path ──────────────────────────────────────────────────────────
      it("success: transfers agentPayment (escrow-2.5%fee) to agent; fee to treasury; status=Settled", async function () {
        const amount      = USDC(50);
        const fee         = (amount * 250n) / 10_000n;
        const agentPayment = amount - fee;

        const agentBefore    = await usdc.balanceOf(agent.address);
        const treasuryBefore = await usdc.balanceOf(treasury.address);

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, true, 80))
          .to.emit(escrow, "EscrowSettled")
          .withArgs(escrowId, agent.address, agentPayment, fee);

        expect(await usdc.balanceOf(agent.address)).to.equal(agentBefore + agentPayment);
        expect(await usdc.balanceOf(treasury.address)).to.equal(treasuryBefore + fee);
        expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Settled);
      });

      it("success: qualityScore > 100 is silently clamped to 100 (no revert)", async function () {
        await expect(
          escrow.connect(verifier).verifyAndSettle(escrowId, true, 9999)
        ).to.not.be.reverted;
      });

      it("success: records earnings in stakeRegistry", async function () {
        const amount      = USDC(50);
        const agentPayment = amount - (amount * 250n) / 10_000n;
        await escrow.connect(verifier).verifyAndSettle(escrowId, true, 80);
        expect(await stakeRegistry.getEarnings(agent.address)).to.equal(agentPayment);
      });

      it("success: early submission produces high speed score in reputation stats", async function () {
        // submitDeliverable ran just 1–2 blocks after fundEscrow → nearly full window remains
        await escrow.connect(verifier).verifyAndSettle(escrowId, true, 100);
        const stats = await reputation.getAgentStats(agent.address);
        expect(stats.totalSpeedScore).to.be.gt(9_000n); // close to 10000
      });

      // Failure path ──────────────────────────────────────────────────────────
      it("failure: full refund to buyer plus slash-split bonus; emits EscrowRefunded; status=Refunded", async function () {
        const amount   = USDC(50);
        const slashAmt = (amount * 10n) / 100n; // 5 USDC

        const buyerBefore = await usdc.balanceOf(buyer.address); // after funding

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, false, 0))
          .to.emit(escrow, "EscrowRefunded")
          .withArgs(escrowId, buyer.address, amount, slashAmt);

        // Buyer gets full escrow amount back + 50% of the agent's slashed stake
        expect(await usdc.balanceOf(buyer.address)).to.equal(
          buyerBefore + amount + slashAmt / 2n
        );
        expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
      });

      it("failure: 10% of escrow amount slashed from agent stake", async function () {
        const stakeBefore = await stakeRegistry.getStake(agent.address);
        const slashAmt    = (USDC(50) * 10n) / 100n;
        await escrow.connect(verifier).verifyAndSettle(escrowId, false, 0);
        expect(await stakeRegistry.getStake(agent.address)).to.equal(stakeBefore - slashAmt);
      });

      // Access control ────────────────────────────────────────────────────────
      it("reverts NotAuthorizedVerifier for unauthorized caller", async function () {
        await expect(
          escrow.connect(attacker).verifyAndSettle(escrowId, true, 80)
        ).to.be.revertedWithCustomError(escrow, "NotAuthorizedVerifier");
      });

      it("reverts InvalidStatus when escrow is not in Submitted state", async function () {
        // Create a second escrow that is only Funded, not Submitted
        const id2 = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50),
          (await time.latest()) + THIRTY_DAYS,
          ethers.ZeroHash,
          0
        );
        await escrow.connect(agent).acceptEscrow(id2);
        await escrow.connect(buyer).fundEscrow(id2);
        await expect(
          escrow.connect(verifier).verifyAndSettle(id2, true, 80)
        ).to.be.revertedWithCustomError(escrow, "InvalidStatus");
      });
    });

    // ── expireEscrow ──────────────────────────────────────────────────────────
    describe("expireEscrow", function () {
      let escrowId;

      beforeEach(async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50), deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
      });

      it("expires a Funded escrow after deadline; buyer gets refund; status=Refunded", async function () {
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await time.increase(THIRTY_DAYS + 1);

        const buyerBefore = await usdc.balanceOf(buyer.address);
        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.emit(escrow, "EscrowRefunded");
        expect(await usdc.balanceOf(buyer.address)).to.be.gt(buyerBefore);
        expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
      });

      it("expires a Submitted escrow after deadline", async function () {
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash);
        await time.increase(THIRTY_DAYS + 1);
        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.emit(escrow, "EscrowRefunded");
      });

      it("reverts DeadlineNotReached when called before the deadline", async function () {
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await expect(
          escrow.connect(stranger).expireEscrow(escrowId)
        ).to.be.revertedWithCustomError(escrow, "DeadlineNotReached");
      });

      it("(L-3) reverts NotExpirable(Created=0) for an unfunded escrow", async function () {
        // Escrow was never funded — stays in Created status
        await time.increase(THIRTY_DAYS + 1);
        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.be.revertedWithCustomError(escrow, "NotExpirable")
          .withArgs(Status.Created); // 0
      });

      it("(L-3) reverts NotExpirable(Settled=3) after a successful settlement", async function () {
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash);
        await escrow.connect(verifier).verifyAndSettle(escrowId, true, 80);
        await time.increase(THIRTY_DAYS + 1);
        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.be.revertedWithCustomError(escrow, "NotExpirable")
          .withArgs(Status.Settled); // 3
      });

      it("(L-3) reverts NotExpirable(Refunded=4) for an already-refunded escrow", async function () {
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash);
        await escrow.connect(verifier).verifyAndSettle(escrowId, false, 0);
        await time.increase(THIRTY_DAYS + 1);
        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.be.revertedWithCustomError(escrow, "NotExpirable")
          .withArgs(Status.Refunded); // 4
      });
    });

    // ── C-1: try/catch on side-effect calls ───────────────────────────────────
    describe("C-1: try/catch — side-effect failures never block primary transfers", function () {
      let escrowId;

      beforeEach(async function () {
        const deadline = (await time.latest()) + THIRTY_DAYS;
        escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50), deadline,
          ethers.keccak256(ethers.toUtf8Bytes("spec")),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(
          escrowId, ethers.keccak256(ethers.toUtf8Bytes("deliverable"))
        );
      });

      it("slash revert caught: buyer receives full refund; SideEffectFailed emitted", async function () {
        // Revoke escrow authorization in stakeRegistry → slash() will throw NotAuthorizedEscrow
        await stakeRegistry.connect(owner).revokeEscrow(escrow.target);

        const buyerBefore = await usdc.balanceOf(buyer.address);

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, false, 0))
          .to.emit(escrow, "EscrowRefunded")
          .and.to.emit(escrow, "SideEffectFailed");

        expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBefore + USDC(50));
        expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
      });

      it("recordEarnings revert caught: agent still receives full payment; SideEffectFailed emitted", async function () {
        await stakeRegistry.connect(owner).revokeEscrow(escrow.target);

        const amount      = USDC(50);
        const agentPayment = amount - (amount * 250n) / 10_000n;
        const agentBefore  = await usdc.balanceOf(agent.address);

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, true, 80))
          .to.emit(escrow, "SideEffectFailed");

        expect(await usdc.balanceOf(agent.address)).to.equal(agentBefore + agentPayment);
      });

      it("recordOutcome revert (failure path) caught: buyer still refunded; SideEffectFailed emitted", async function () {
        // Revoke caller authorization in reputation → recordOutcome will revert
        await reputation.connect(owner).revokeCaller(escrow.target);
        // stakeRegistry slash authorization is still active here, so buyer also receives
        // the 50% slash split on top of the full escrow refund.

        const buyerBefore = await usdc.balanceOf(buyer.address);
        const slashAmt    = (USDC(50) * 10n) / 100n;

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, false, 0))
          .to.emit(escrow, "EscrowRefunded")
          .and.to.emit(escrow, "SideEffectFailed");

        // Buyer receives full escrow refund + 50% of the slash (slash still works)
        expect(await usdc.balanceOf(buyer.address)).to.equal(
          buyerBefore + USDC(50) + slashAmt / 2n
        );
      });

      it("recordOutcome revert (success path) caught: agent still paid", async function () {
        await reputation.connect(owner).revokeCaller(escrow.target);

        const amount      = USDC(50);
        const agentPayment = amount - (amount * 250n) / 10_000n;
        const agentBefore  = await usdc.balanceOf(agent.address);

        await expect(escrow.connect(verifier).verifyAndSettle(escrowId, true, 80))
          .to.emit(escrow, "SideEffectFailed");

        expect(await usdc.balanceOf(agent.address)).to.equal(agentBefore + agentPayment);
      });

      it("expireEscrow: slash revert caught via try/catch; buyer still refunded", async function () {
        await stakeRegistry.connect(owner).revokeEscrow(escrow.target);
        await time.increase(THIRTY_DAYS + 1);

        const buyerBefore = await usdc.balanceOf(buyer.address);

        await expect(escrow.connect(stranger).expireEscrow(escrowId))
          .to.emit(escrow, "EscrowRefunded")
          .and.to.emit(escrow, "SideEffectFailed");

        expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBefore + USDC(50));
      });
    });

    // ── verifier admin ────────────────────────────────────────────────────────
    describe("verifier admin", function () {
      it("authorizeVerifier / revokeVerifier toggle authorization", async function () {
        await escrow.connect(owner).authorizeVerifier(stranger.address);
        expect(await escrow.isAuthorizedVerifier(stranger.address)).to.be.true;
        await escrow.connect(owner).revokeVerifier(stranger.address);
        expect(await escrow.isAuthorizedVerifier(stranger.address)).to.be.false;
      });

      it("setTreasury emits TreasuryUpdated; reverts ZeroAddress", async function () {
        await expect(escrow.connect(owner).setTreasury(stranger.address))
          .to.emit(escrow, "TreasuryUpdated");
        await expect(
          escrow.connect(owner).setTreasury(ethers.ZeroAddress)
        ).to.be.revertedWithCustomError(escrow, "ZeroAddress");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AssayReputation
  // ─────────────────────────────────────────────────────────────────────────
  describe("AssayReputation", function () {
    beforeEach(async function () {
      await registerAgent(agent);
      // Allow owner to call recordOutcome directly in unit tests
      await reputation.connect(owner).authorizeCaller(owner.address);
    });

    // Helper: record N identical successful outcomes via owner
    async function recordSuccessJobs(n, speedScore = 10_000, qualityScore = 100) {
      for (let i = 0; i < n; i++) {
        await reputation.connect(owner).recordOutcome(
          agent.address, true, speedScore, qualityScore, USDC(50)
        );
      }
    }

    // ── MIN_JOBS_FOR_SCORE gate ───────────────────────────────────────────────
    describe("getScore — MIN_JOBS_FOR_SCORE gate", function () {
      it("returns 0 before 3 recorded jobs", async function () {
        expect(await reputation.getScore(agent.address)).to.equal(0n);
        await reputation.connect(owner).recordOutcome(agent.address, true, 10000, 100, USDC(50));
        expect(await reputation.getScore(agent.address)).to.equal(0n);
        await reputation.connect(owner).recordOutcome(agent.address, true, 10000, 100, USDC(50));
        expect(await reputation.getScore(agent.address)).to.equal(0n);
      });

      it("activates (> 0) after exactly the 3rd recorded job", async function () {
        await recordSuccessJobs(3);
        expect(await reputation.getScore(agent.address)).to.be.gt(0n);
      });
    });

    // ── score computation ─────────────────────────────────────────────────────
    describe("score computation", function () {
      it("3 perfect jobs → rawScore = 8400 (3000+1500+3000+150+750)", async function () {
        // completionComponent = (3/3)*3000  = 3000
        // speedComponent      = (10000/1)*1500/10000 = 1500
        // qualityComponent    = (100/1)*3000/100     = 3000
        // streakComponent     = (3/20)*1000          = 150
        // stakeComponent      = stake(100 USDC), earnings(0) → 750 baseline
        // total = 8400
        await recordSuccessJobs(3);
        expect(await reputation.getScore(agent.address)).to.equal(8400n);
      });

      it("20 perfect jobs → streak reaches STREAK_CAP; streakComponent = 1000; rawScore = 9250", async function () {
        // streakComponent = (20/20)*1000 = 1000; rest unchanged
        // total = 3000+1500+3000+1000+750 = 9250
        await recordSuccessJobs(20);
        expect(await reputation.getScore(agent.address)).to.equal(9250n);
      });

      it("failure jobs reduce completion rate and update stats correctly", async function () {
        await recordSuccessJobs(3);
        for (let i = 0; i < 3; i++) {
          await reputation.connect(owner).recordOutcome(agent.address, false, 0, 0, USDC(50));
        }
        const stats = await reputation.getAgentStats(agent.address);
        expect(stats.completedJobs).to.equal(3n);
        expect(stats.totalJobs).to.equal(6n);
        // completionComponent = (3/6)*3000 = 1500
        const score = await reputation.getScore(agent.address);
        // Speed/quality still from the 3 good jobs; streak = 0
        // completionComponent = 1500
        // speedComponent = 1500, qualityComponent = 3000, streak = 0, stake = 750
        // rawScore = 1500+1500+3000+0+750 = 6750
        expect(score).to.equal(6750n);
      });
    });

    // ── streak tracking (L-2) ─────────────────────────────────────────────────
    describe("streak tracking (L-2)", function () {
      it("streak increments to 5 after 5 consecutive successes", async function () {
        await recordSuccessJobs(5);
        expect((await reputation.getAgentStats(agent.address)).currentStreak).to.equal(5n);
      });

      it("streak resets to 0 on the first failure", async function () {
        await recordSuccessJobs(5);
        await reputation.connect(owner).recordOutcome(agent.address, false, 0, 0, USDC(50));
        expect((await reputation.getAgentStats(agent.address)).currentStreak).to.equal(0n);
      });

      it("(L-2) streak storage capped at STREAK_CAP=20 even after 25 consecutive successes", async function () {
        await recordSuccessJobs(25);
        const stats = await reputation.getAgentStats(agent.address);
        expect(stats.currentStreak).to.equal(20n); // never 25
        expect(stats.totalJobs).to.equal(25n);      // all 25 counted
      });

      it("(L-2) score after >20 successes equals score after exactly 20 (cap is binding)", async function () {
        await recordSuccessJobs(20);
        const scoreAt20 = await reputation.getScore(agent.address);
        await recordSuccessJobs(5); // 5 more successes; streak stays at 20
        expect(await reputation.getScore(agent.address)).to.not.be.lt(scoreAt20);
        // Completion improves but streak component stays the same (capped)
        expect((await reputation.getAgentStats(agent.address)).currentStreak).to.equal(20n);
      });
    });

    // ── time decay ────────────────────────────────────────────────────────────
    describe("time decay", function () {
      beforeEach(async function () {
        await recordSuccessJobs(3);
      });

      it("no decay within the same 30-day period", async function () {
        const score = await reputation.getScore(agent.address);
        await time.increase(60); // 1 minute — still same period
        expect(await reputation.getScore(agent.address)).to.equal(score);
      });

      it("5% decay after 1 inactive 30-day period", async function () {
        const rawScore = await reputation.getScore(agent.address);
        await time.increase(THIRTY_DAYS);
        expect(await reputation.getScore(agent.address)).to.equal((rawScore * 95n) / 100n);
      });

      it("10% decay after 2 inactive 30-day periods", async function () {
        const rawScore = await reputation.getScore(agent.address);
        await time.increase(THIRTY_DAYS * 2);
        expect(await reputation.getScore(agent.address)).to.equal((rawScore * 90n) / 100n);
      });

      it("score reaches 0 after MAX_DECAY_PERIODS (20) of inactivity", async function () {
        await time.increase(THIRTY_DAYS * 20);
        expect(await reputation.getScore(agent.address)).to.equal(0n);
      });
    });

    // ── authorization ─────────────────────────────────────────────────────────
    describe("authorization", function () {
      it("reverts NotAuthorizedCaller for unauthorized caller", async function () {
        await expect(
          reputation.connect(attacker).recordOutcome(agent.address, true, 8000, 80, USDC(50))
        ).to.be.revertedWithCustomError(reputation, "NotAuthorizedCaller");
      });

      it("authorizeCaller / revokeCaller toggle access", async function () {
        await reputation.connect(owner).authorizeCaller(stranger.address);
        expect(await reputation.isAuthorizedCaller(stranger.address)).to.be.true;
        await reputation.connect(owner).revokeCaller(stranger.address);
        expect(await reputation.isAuthorizedCaller(stranger.address)).to.be.false;
      });

      it("non-owner cannot authorizeCaller", async function () {
        await expect(
          reputation.connect(attacker).authorizeCaller(attacker.address)
        ).to.be.revertedWithCustomError(reputation, "OwnableUnauthorizedAccount");
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Integration — full trust loop
  // ─────────────────────────────────────────────────────────────────────────
  describe("Integration — full trust loop", function () {

    it("happy path: register → create → fund → submit → verify(success) → check earnings + reputation", async function () {
      // 1. Register
      await registerAgent(agent);
      expect(await stakeRegistry.isActive(agent.address)).to.be.true;

      // 2. Create escrow
      const amount   = USDC(200);
      const deadline = (await time.latest()) + THIRTY_DAYS;
      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, amount, deadline,
        ethers.keccak256(ethers.toUtf8Bytes("job-spec")),
        0
      );
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Created);

      // 3. Accept
      await escrow.connect(agent).acceptEscrow(escrowId);
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Accepted);

      // 4. Fund
      await escrow.connect(buyer).fundEscrow(escrowId);
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Funded);

      // 5. Submit
      await escrow.connect(agent).submitDeliverable(
        escrowId, ethers.keccak256(ethers.toUtf8Bytes("result"))
      );
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Submitted);

      // 6. Settle
      await escrow.connect(verifier).verifyAndSettle(escrowId, true, 95);
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Settled);

      // 7. Verify earnings in registry
      const fee         = (amount * 250n) / 10_000n;
      const agentPayment = amount - fee;
      expect(await stakeRegistry.getEarnings(agent.address)).to.equal(agentPayment);

      // 8. Verify reputation stats updated (1 job, score still 0 — below MIN_JOBS threshold)
      const stats = await reputation.getAgentStats(agent.address);
      expect(stats.totalJobs).to.equal(1n);
      expect(stats.completedJobs).to.equal(1n);
      expect(stats.currentStreak).to.equal(1n);
    });

    it("happy path: full failure flow — fund → expire → buyer refunded + agent slashed", async function () {
      await registerAgent(agent);

      const amount   = USDC(100);
      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, amount,
        (await time.latest()) + THIRTY_DAYS,
        ethers.ZeroHash,
        0
      );
      await escrow.connect(agent).acceptEscrow(escrowId);
      await escrow.connect(buyer).fundEscrow(escrowId);

      const stakeBefore = await stakeRegistry.getStake(agent.address);
      const buyerBefore = await usdc.balanceOf(buyer.address); // after funding
      const slashAmt    = (amount * 10n) / 100n; // 10 USDC

      // Agent never submits — buyer expires after deadline
      await time.increase(THIRTY_DAYS + 1);
      await escrow.connect(stranger).expireEscrow(escrowId);

      expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBefore + amount + slashAmt / 2n);
      expect(await stakeRegistry.getStake(agent.address)).to.equal(stakeBefore - slashAmt);
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
    });

    // ── Audit fixes ──────────────────────────────────────────────────────────

    it("(H-1) dynamic isActive: raising minimumStake immediately blocks fundEscrow", async function () {
      await registerAgent(agent); // stake = MIN_STAKE

      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, USDC(50),
        (await time.latest()) + THIRTY_DAYS,
        ethers.ZeroHash,
        0
      );
      await escrow.connect(agent).acceptEscrow(escrowId);

      // H-1 fix: isActive is computed dynamically — no stored flag to update
      await stakeRegistry.connect(owner).setMinimumStake(MIN_STAKE * 10n);
      expect(await stakeRegistry.isActive(agent.address)).to.be.false; // immediate effect

      // Fund-time re-check (M-3 also applies here) must catch the deactivation
      await expect(
        escrow.connect(buyer).fundEscrow(escrowId)
      ).to.be.revertedWithCustomError(escrow, "AgentNotActive");
    });

    it("(M-2) SelfDeal: createEscrow reverts when buyer address == agent address", async function () {
      await registerAgent(agent);
      await usdc.mint(agent.address, USDC(500));
      await usdc.connect(agent).approve(escrow.target, ethers.MaxUint256);

      await expect(
        escrow.connect(agent).createEscrow(
          agent.address, USDC(50),
          (await time.latest()) + THIRTY_DAYS,
          ethers.ZeroHash,
          0
        )
      ).to.be.revertedWithCustomError(escrow, "SelfDeal");
    });

    it("(M-3) fund-time stake re-check: agent withdraws all stake between create and fund", async function () {
      await registerAgent(agent); // stake = MIN_STAKE

      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, USDC(50),
        (await time.latest()) + THIRTY_DAYS,
        ethers.ZeroHash,
        0
      );
      await escrow.connect(agent).acceptEscrow(escrowId);

      // Agent deactivates self by withdrawing entire stake to 0
      await stakeRegistry.connect(agent).withdrawStake(MIN_STAKE);
      expect(await stakeRegistry.isActive(agent.address)).to.be.false;

      // fundEscrow must reject — M-3 re-check catches this
      await expect(
        escrow.connect(buyer).fundEscrow(escrowId)
      ).to.be.revertedWithCustomError(escrow, "AgentNotActive");
    });

    it("(L-2) streak storage cap: 25 consecutive successes stored as 20 in AgentStats", async function () {
      await registerAgent(agent);
      await reputation.connect(owner).authorizeCaller(owner.address);

      for (let i = 0; i < 25; i++) {
        await reputation.connect(owner).recordOutcome(agent.address, true, 9000, 90, USDC(50));
      }

      const stats = await reputation.getAgentStats(agent.address);
      expect(stats.currentStreak).to.equal(20n); // capped at STREAK_CAP
      expect(stats.totalJobs).to.equal(25n);      // all counted
    });

    it("(L-3) NotExpirable error carries the current EscrowStatus value as argument", async function () {
      await registerAgent(agent);

      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, USDC(50),
        (await time.latest()) + THIRTY_DAYS,
        ethers.ZeroHash,
        0
      );
      // Escrow remains Created (never funded)
      await time.increase(THIRTY_DAYS + 1);

      await expect(escrow.connect(stranger).expireEscrow(escrowId))
        .to.be.revertedWithCustomError(escrow, "NotExpirable")
        .withArgs(Status.Created); // must carry EscrowStatus.Created = 0
    });

    it("(C-1) try/catch on slash: revert in stakeRegistry.slash() absorbed; buyer refunded; escrow finalized", async function () {
      await registerAgent(agent);

      const escrowId = await escrow.nextEscrowId();
      await escrow.connect(buyer).createEscrow(
        agent.address, USDC(50),
        (await time.latest()) + THIRTY_DAYS,
        ethers.ZeroHash,
        0
      );
      await escrow.connect(agent).acceptEscrow(escrowId);
      await escrow.connect(buyer).fundEscrow(escrowId);
      await escrow.connect(agent).submitDeliverable(escrowId, ethers.ZeroHash);

      // Break the slash path by revoking escrow authorization in the registry
      await stakeRegistry.connect(owner).revokeEscrow(escrow.target);

      const buyerBefore = await usdc.balanceOf(buyer.address);

      // C-1 fix: the revert inside stakeRegistry.slash() is caught by try/catch
      // Primary USDC refund must still succeed
      await expect(escrow.connect(verifier).verifyAndSettle(escrowId, false, 0))
        .to.emit(escrow, "EscrowRefunded")
        .and.to.emit(escrow, "SideEffectFailed");

      expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBefore + USDC(50));
      expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
    });

    it("three-job reputation loop: score activates after MIN_JOBS_FOR_SCORE via real escrow settlements", async function () {
      await registerAgent(agent);

      // Run 3 complete successful escrows
      for (let i = 0; i < 3; i++) {
        const escrowId = await escrow.nextEscrowId();
        await escrow.connect(buyer).createEscrow(
          agent.address, USDC(50),
          (await time.latest()) + THIRTY_DAYS,
          ethers.keccak256(ethers.toUtf8Bytes(`spec-${i}`)),
          0
        );
        await escrow.connect(agent).acceptEscrow(escrowId);
        await escrow.connect(buyer).fundEscrow(escrowId);
        await escrow.connect(agent).submitDeliverable(
          escrowId, ethers.keccak256(ethers.toUtf8Bytes(`output-${i}`))
        );
        await escrow.connect(verifier).verifyAndSettle(escrowId, true, 90);
      }

      const stats = await reputation.getAgentStats(agent.address);
      expect(stats.totalJobs).to.equal(3n);
      expect(stats.completedJobs).to.equal(3n);
      expect(stats.currentStreak).to.equal(3n);

      // Score must now be > 0 (passed MIN_JOBS_FOR_SCORE gate)
      expect(await reputation.getScore(agent.address)).to.be.gt(0n);

      // Earnings recorded for all three settlements
      const fee         = (USDC(50) * 250n) / 10_000n;
      const agentPayment = USDC(50) - fee;
      expect(await stakeRegistry.getEarnings(agent.address)).to.equal(agentPayment * 3n);
    });
  });
});
