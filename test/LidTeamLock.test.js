const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")
const LidTeamLock = contract.fromArtifact("LidTeamLock")

const owner = accounts[0]
const team = [accounts[1],accounts[2],accounts[3],accounts[4]]
const unauthorized = accounts[5]

const SECONDS_PER_DAY = 86400

describe("LidTeamLock", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking
    const teamLockParams = config.LidTeamLock

    this.lidToken = await LidToken.new()
    this.lidStaking = await LidStaking.new()
    this.lidTeamLock = await LidTeamLock.new()

    await this.lidToken.initialize(
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      owner,
      tokenParams.taxBP,
      this.lidStaking.address
    )
    await this.lidStaking.initialize(
      stakingParams.stakingTaxBP,
      stakingParams.unstakingTaxBP,
      owner,
      this.lidToken.address
    )
    await time.advanceBlock()
    let latest = await time.latest()

    await this.lidTeamLock.initialize(
      teamLockParams.releaseAmount,
      teamLockParams.releaseInterval,
      latest.toNumber() + 86400,
      team,
      this.lidToken.address
    )

    this.lidToken.mint(this.lidTeamLock.address,teamLockParams.size,{from:owner})

  })
  describe("State: Cycle 0", function() {
    describe("#getCurrentCycleCount", function(){
      it("Should be 0", async function() {
        const cycle = await this.lidTeamLock.getCurrentCycleCount()
        expect("0").to.equal(cycle.toString())
      })
    })
    describe("#claim", function(){
      it("Should revert when called by unauthorized", async function() {
        await expectRevert(
          this.lidTeamLock.claim({from:unauthorized}),
         "Can only be called by team members."
        )
      })
      it("Should not change receiver balance.", async function() {
        const receiver = team[0]
        let first = await this.lidTeamLock.teamMembers[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(ether("0").toString()).to.equal(bal.toString())
      })
      it("Should not change teamMemberClaimed.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidTeamLock.teamMemberClaimed(receiver);
        expect(ether("0").toString()).to.equal(bal.toString())
      })
    })
  })
  describe("State: Cycle 1", function() {
    before(async function() {
      await time.increase(SECONDS_PER_DAY*30)
      await time.advanceBlock()
    })
    describe("#getCurrentCycleCount", function(){
      it("Should be 1", async function() {
        const cycle = await this.lidTeamLock.getCurrentCycleCount()
        expect("1").to.equal(cycle.toString())
      })
    })
    describe("#claim", function(){
      it("Should revert when called by unauthorized", async function() {
        await expectRevert(
          this.lidTeamLock.claim({from:unauthorized}),
         "Can only be called by team members."
        )
      })
      it("Should increase receiver balance.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.toString()).to.equal(bal.toString())
      })
      it("Should increase teamMemberClaimed.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidTeamLock.teamMemberClaimed(receiver);
        expect(config.LidTeamLock.releaseAmount.toString()).to.equal(bal.toString())
      })
      it("Should not change receiver balance if called again.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.toString()).to.equal(bal.toString())
      })
    })
  })
  describe("State: Cycle 2", function() {
    before(async function() {
      await time.increase(SECONDS_PER_DAY*30)
      await time.advanceBlock()
    })
    describe("#getCurrentCycleCount", function(){
      it("Should be 2", async function() {
        const cycle = await this.lidTeamLock.getCurrentCycleCount()
        expect("2").to.equal(cycle.toString())
      })
    })
    describe("#claim", function(){
      it("Should revert when called by unauthorized", async function() {
        await expectRevert(
          this.lidTeamLock.claim({from:unauthorized}),
         "Can only be called by team members."
        )
      })
      it("Should increase receiver balance.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.mul(new BN(2)).toString()).to.equal(bal.toString())
      })
      it("Should increase teamMemberClaimed.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidTeamLock.teamMemberClaimed(receiver);
        expect(config.LidTeamLock.releaseAmount.mul(new BN(2)).toString()).to.equal(bal.toString())
      })
      it("Should not change receiver balance if called again.", async function() {
        const receiver = team[0]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.mul(new BN(2)).toString()).to.equal(bal.toString())
      })
      it("Should increase receiver2 balance by 2x.", async function() {
        const receiver = team[1]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.mul(new BN(2)).toString()).to.equal(bal.toString())
      })
      it("Should not change receiver2 balance if called again.", async function() {
        const receiver = team[1]
        await this.lidTeamLock.claim({from:receiver})
        const bal = await this.lidToken.balanceOf(receiver);
        expect(config.LidTeamLock.releaseAmount.mul(new BN(2)).toString()).to.equal(bal.toString())
      })
    })
  })
})
