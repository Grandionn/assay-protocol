const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const USDC = (value) => ethers.parseUnits(String(value), 6);
const MIN_STAKE = USDC(100);
const THIRTY_DAYS = 30 * 24 * 60 * 60;

const Status = {
  Created: 0n,
  Accepted: 1n,
  Funded: 2n,
  Submitted: 3n,
  Settled: 4n,
  Refunded: 5n,
  Cancelled: 6n,
};

describe("AssayEscrow acceptance flow", function () {
  let owner;
  let agent;
  let buyer;
  let treasury;
  let verifier;
  let stranger;
  let usdc;
  let stakeRegistry;
  let reputation;
  let escrow;

  beforeEach(async function () {
    [owner, agent, buyer, treasury, verifier, stranger] = await ethers.getSigners();

    usdc = await (await ethers.getContractFactory("MockUSDC")).deploy();

    stakeRegistry = await (await ethers.getContractFactory("AssayStakeRegistry")).deploy(
      usdc.target,
      MIN_STAKE,
      treasury.address,
    );

    reputation = await (await ethers.getContractFactory("AssayReputation")).deploy(
      stakeRegistry.target,
    );

    escrow = await (await ethers.getContractFactory("AssayEscrow")).deploy(
      usdc.target,
      stakeRegistry.target,
      reputation.target,
      treasury.address,
    );

    await stakeRegistry.connect(owner).authorizeEscrow(escrow.target);
    await reputation.connect(owner).authorizeCaller(escrow.target);
    await escrow.connect(owner).authorizeVerifier(verifier.address);

    await usdc.mint(buyer.address, USDC(10_000));
    await usdc.connect(buyer).approve(escrow.target, ethers.MaxUint256);

    await registerAgent(agent);
  });

  async function registerAgent(signer, stakeAmount = MIN_STAKE) {
    await usdc.mint(signer.address, stakeAmount);
    await usdc.connect(signer).approve(stakeRegistry.target, stakeAmount);
    await stakeRegistry.connect(signer).registerAgent("ipfs://QmCap", stakeAmount);
  }

  async function createEscrow(amount = USDC(50)) {
    const deadline = (await time.latest()) + THIRTY_DAYS;
    const escrowId = await escrow.nextEscrowId();
    const specHash = ethers.keccak256(ethers.toUtf8Bytes("spec"));

    await escrow.connect(buyer).createEscrow(agent.address, amount, deadline, specHash);

    return { escrowId, deadline, amount, specHash };
  }

  it("prevents slashing an agent through an escrow they never accepted", async function () {
    const { escrowId, deadline } = await createEscrow();
    const stakeBefore = await stakeRegistry.getStake(agent.address);

    await expect(escrow.connect(buyer).fundEscrow(escrowId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(Status.Created, Status.Accepted);

    await time.increaseTo(deadline + 1);

    await expect(escrow.connect(stranger).expireEscrow(escrowId))
      .to.be.revertedWithCustomError(escrow, "NotExpirable")
      .withArgs(Status.Created);

    expect(await stakeRegistry.getStake(agent.address)).to.equal(stakeBefore);
  });

  it("acceptEscrow transitions an escrow from Created to Accepted", async function () {
    const { escrowId } = await createEscrow();

    await expect(escrow.connect(agent).acceptEscrow(escrowId))
      .to.emit(escrow, "EscrowAccepted")
      .withArgs(escrowId, agent.address);

    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Accepted);
  });

  it("fundEscrow requires Accepted status instead of Created", async function () {
    const { escrowId, amount } = await createEscrow();

    await expect(escrow.connect(buyer).fundEscrow(escrowId))
      .to.be.revertedWithCustomError(escrow, "InvalidStatus")
      .withArgs(Status.Created, Status.Accepted);

    await escrow.connect(agent).acceptEscrow(escrowId);

    await expect(escrow.connect(buyer).fundEscrow(escrowId))
      .to.emit(escrow, "EscrowFunded")
      .withArgs(escrowId, amount);

    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Funded);
  });

  it("cancelEscrow works for both Created and Accepted escrows", async function () {
    const firstEscrow = await createEscrow();

    await expect(escrow.connect(buyer).cancelEscrow(firstEscrow.escrowId))
      .to.emit(escrow, "EscrowCancelled")
      .withArgs(firstEscrow.escrowId);

    expect((await escrow.getEscrow(firstEscrow.escrowId)).status).to.equal(Status.Cancelled);

    const secondEscrow = await createEscrow(USDC(75));
    await escrow.connect(agent).acceptEscrow(secondEscrow.escrowId);

    await expect(escrow.connect(buyer).cancelEscrow(secondEscrow.escrowId))
      .to.emit(escrow, "EscrowCancelled")
      .withArgs(secondEscrow.escrowId);

    expect((await escrow.getEscrow(secondEscrow.escrowId)).status).to.equal(Status.Cancelled);
  });

  it("supports the full happy path after acceptance", async function () {
    const { escrowId } = await createEscrow();
    const deliverableHash = ethers.keccak256(ethers.toUtf8Bytes("deliverable"));

    await escrow.connect(agent).acceptEscrow(escrowId);
    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Accepted);

    await escrow.connect(buyer).fundEscrow(escrowId);
    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Funded);

    await escrow.connect(agent).submitDeliverable(escrowId, deliverableHash);
    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Submitted);

    await escrow.connect(verifier).verifyAndSettle(escrowId, true, 95);
    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Settled);
  });

  it("expireEscrow still refunds and slashes after acceptance and funding", async function () {
    const { escrowId, deadline, amount } = await createEscrow();
    const buyerBalanceBefore = await usdc.balanceOf(buyer.address);
    const stakeBefore = await stakeRegistry.getStake(agent.address);
    const expectedSlash = (amount * 10n) / 100n;

    await escrow.connect(agent).acceptEscrow(escrowId);
    await escrow.connect(buyer).fundEscrow(escrowId);

    await time.increaseTo(deadline + 1);

    await expect(escrow.connect(stranger).expireEscrow(escrowId))
      .to.emit(escrow, "EscrowRefunded")
      .withArgs(escrowId, buyer.address, amount, expectedSlash);

    expect((await escrow.getEscrow(escrowId)).status).to.equal(Status.Refunded);
    expect(await usdc.balanceOf(buyer.address)).to.equal(buyerBalanceBefore + expectedSlash / 2n);
    expect(await stakeRegistry.getStake(agent.address)).to.equal(stakeBefore - expectedSlash);
  });
});
