const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")
const LidCertifiedPresale = contract.fromArtifact("LidCertifiedPresale")
const LidDaoFund = contract.fromArtifact("LidDaoLock")

SECONDS_PER_DAY = 86400

const owner = accounts[0]
const stakers = [accounts[1],accounts[2],accounts[3],accounts[4]]
const nonstaker = accounts[5]
const emptyAccount = accounts[7]
const distributionAccount = accounts[8]

describe("LidToken", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking

    this.lidToken = await LidToken.new()
    this.lidStaking = await LidStaking.new()
    this.lidCertifiedPresale = await LidCertifiedPresale.new()
    this.lidDaoFund = await LidDaoFund.new()

    await this.lidToken.initialize(
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      owner,
      tokenParams.taxBP,
      tokenParams.daoTaxBP,
      this.lidDaoFund.address,
      this.lidStaking.address,
      this.lidCertifiedPresale.address
    )
    await this.lidStaking.initialize(
      stakingParams.stakingTaxBP,
      stakingParams.unstakingTaxBP,
      stakingParams.registrationFeeWithReferrer,
      stakingParams.registrationFeeWithoutReferrer,
      owner,
      this.lidToken.address
    )


    await Promise.all([
      await this.lidToken.mint(stakers[0],ether('100000'),{from: owner}),
      await this.lidToken.mint(stakers[1],ether('100000'),{from: owner}),
      await this.lidToken.mint(stakers[2],ether('100000'),{from: owner}),
      await this.lidToken.mint(stakers[3],ether('100000'),{from: owner}),
      await this.lidToken.mint(nonstaker,ether('100000'),{from: owner}),
      await this.lidToken.mint(distributionAccount,ether('130000'),{from: owner}),

    ])

    await this.lidToken.setIsTransfersActive(true,{from:owner})
    await this.lidToken.setIsTaxActive(true,{from:owner})

    await time.advanceBlock()
    let latest = await time.latest()

    await this.lidStaking.setStartTime(latest.add(new BN(SECONDS_PER_DAY)),{from:owner})

  })

  describe("State: Staking Inactive", function() {
    describe("#stake", function(){
      it("Should revert", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.stake(ether("1"),{from:staker}),
          "Staking not yet started."
        )
      })
    })
    describe("#unstake", function(){
      it("Should revert", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.unstake(ether("1"),{from:staker}),
          "Staking not yet started."
        )
      })
    })
    describe("#withdraw", function(){
      it("Should revert", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.withdraw(ether("1"),{from:staker}),
          "Staking not yet started."
        )
      })
    })
    describe("#reinvest", function(){
      it("Should revert", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.reinvest(ether("1"),{from:staker}),
          "Staking not yet started."
        )
      })
    })
  })
  describe("State: Staking Active", function() {
    before(async function() {
      await time.advanceBlock()
      let latest = await time.latest()
      await time.increase(SECONDS_PER_DAY*30)
    })

    describe("#registerAndStake", function(){
      it("Should revert if less than registrationfee", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.registerAndStake(ether("1").sub(new BN(1)),{from:staker}),
          "Must send at least enough LID to pay registration fee."
        )
        await expectRevert(
          this.lidStaking.registerAndStake(0,{from:staker}),
          "Must send at least enough LID to pay registration fee."
        )
        await expectRevert(
          this.lidStaking.registerAndStake(new BN(1),{from:staker}),
          "Must send at least enough LID to pay registration fee."
        )
      })
      it("Should increase totalStakers by 1", async function() {
        const staker = stakers[0]
        const initialTotalStakers = await this.lidStaking.totalStakers()
        await this.lidStaking.registerAndStake(ether("500"),{from:staker})
        const finalTotalStakers = await this.lidStaking.totalStakers()
        expect(finalTotalStakers.toString())
          .to.equal(initialTotalStakers.add(new BN(1)).toString())
      })
    })

    describe("#stake", function(){
      it("Should revert if staking more tokens than held", async function() {
        const staker = stakers[0]
        const balance = await this.lidToken.balanceOf(staker)
        expect(balance.toString()).to.not.equal(new BN(0),{from:staker})
        await expectRevert(
          this.lidStaking.stake(balance.add(new BN(1)),{from:staker}),
          "Cannot stake more LID than you hold unstaked."
        )
        await expectRevert(
          this.lidStaking.stake(balance.add(ether("10000000000000")),{from:staker}),
          "Cannot stake more LID than you hold unstaked."
        )
      })
      it("Should decrease stakers balance by value", async function() {
        const staker = stakers[0]
        const value = ether("21000")
        const initialStakersTokens = await this.lidToken.balanceOf(staker)
        await this.lidStaking.stake(value,{from:staker})
        const finalStakersTokens = await this.lidToken.balanceOf(staker)
        expect(finalStakersTokens.toString())
          .to.equal(initialStakersTokens.sub(value).toString())
      })
      it("Should not change totalStakers", async function() {
        const staker = stakers[0]
        const initialTotalStakers = await this.lidStaking.totalStakers()
        await this.lidStaking.stake(ether("20000"),{from:staker})
        const finalTotalStakers = await this.lidStaking.totalStakers()
        expect(finalTotalStakers.toString())
          .to.equal(initialTotalStakers.toString())
      })
      it("Should increase totalStaked by value", async function() {
        const staker = stakers[0]
        const value = ether("21000")
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.stake(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.add(value).toString())
      })
      it("Should increase sender's staked amount by value", async function() {
        const staker = stakers[0]
        const value = ether("21000")
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.stake(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.add(value).toString())
      })
    })

    describe("#unstake", function(){
      it("Should revert if less than 1 token", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.unstake(ether("1").sub(new BN(1)),{from:staker}),
          "Must unstake at least one LID."
        )
        await expectRevert(
          this.lidStaking.unstake(0,{from:staker}),
          "Must unstake at least one LID."
        )
        await expectRevert(
          this.lidStaking.unstake(new BN(1),{from:staker}),
          "Must unstake at least one LID."
        )
      })
      it("Should revert if unstaking more tokens than staked", async function() {
        const staker = stakers[0]
        const balance = await this.lidStaking.stakeValue(staker)
        expect(balance.toString()).to.not.equal(new BN(0),{from:staker})
        await expectRevert(
          this.lidStaking.unstake(balance.add(new BN(1)),{from:staker}),
          "Cannot unstake more LID than you have staked."
        )
        await expectRevert(
          this.lidStaking.unstake(balance.add(ether("10000000000000")),{from:staker}),
          "Cannot unstake more LID than you have staked."
        )
      })
      it("Should decrease totalStaked balance by value", async function() {
        const staker = stakers[0]
        const value = ether("10000")
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.unstake(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.sub(value).toString())
      })
      it("Should increase totalStaked by value", async function() {
        const staker = stakers[0]
        const value = ether("10000")
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.stake(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.add(value).toString())
      })
      it("Should decrease sender's staked amount by value", async function() {
        const staker = stakers[0]
        const value = ether("10000")
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.unstake(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        const staker1DivisQ = await this.lidStaking.dividendsOf(stakers[0])
        console.log("staker1DivisQ",staker1DivisQ.toString())
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.sub(value).toString())
      })
      describe("Unstake All", function() {
        it("Should decrease totalStakers by 1 & Should keep stakers dividends the same",async function() {
          const staker = stakers[0]
          const totalStaked = await this.lidStaking.totalStaked()
          const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
          const stakerValue = await this.lidStaking.stakeValue(staker)
          const initialTotalStakers = await this.lidStaking.totalStakers()
          const tax = await this.lidStaking.findTaxAmount(stakerValue,new BN(config.LidStaking.unstakingTaxBP))
          await this.lidStaking.unstake(stakerValue,{from:staker})
          const finalTotalStakers = await this.lidStaking.totalStakers()
          const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
          expect(finalTotalStakers.toString())
            .to.equal(initialTotalStakers.sub(new BN(1)).toString())
          console.log("stakerValue",stakerValue.toString())
          console.log("tax",tax.toString())
          console.log("finaldivis",finalStakerDivis.toString())
          console.log('initialdivis',initialStakerDivis.toString())
          expect(finalStakerDivis.sub(initialStakerDivis).toString())
            .to.equal("0")
        })


      })
    })

    describe("#distribution", function(){
      before(async function() {
        await this.lidStaking.stake(ether("10000"),{from:stakers[0]})
        await this.lidStaking.registerAndStake(ether("15000"),{from:stakers[1]})
        await this.lidStaking.registerAndStake(ether("12000"),{from:stakers[2]})
        await this.lidStaking.registerAndStake(ether("91000"),{from:stakers[3]})
      })
      it("Should revert if distributing more than sender's balance", async function() {
        const balance = await this.lidToken.balanceOf(distributionAccount)
        await expectRevert(
          this.lidStaking.distribute(balance.add(new BN(1)),{from: distributionAccount}),
          "Cannot distribute more LID than you hold unstaked."
        )
      })
      it("Should increase totalDistributions by value", async function(){
        const value = ether("10000")
        const totalDistributionsInitial = await this.lidStaking.totalDistributions()
        await this.lidStaking.distribute(value,{from: distributionAccount})
        const totalDistributionsFinal = await this.lidStaking.totalDistributions()
        expect(totalDistributionsFinal.toString())
          .to.equal(totalDistributionsInitial.add(value).toString())
      })
      it("Should increase other stakers dividends by distribution/totalStaked * stakeValue", async function() {
        const staker = stakers[1]
        const value = ether("10000")
        const stakerShares = await this.lidStaking.stakeValue(staker)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.distribute(value,{from:distributionAccount})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        expect(value.mul(stakerShares).div(totalStaked).div(new BN("10000")).toString())
          .to.equal(finalStakerDivis.sub(initialStakerDivis).div(new BN("10000")).toString())
      })
    })
    describe("#withdraw", function(){
      it("Should revert if withdrawing more than sender's dividends", async function() {
        const staker = stakers[0]
        const balance = await this.lidStaking.dividendsOf(staker)
        await expectRevert(
          this.lidStaking.withdraw(balance.add(new BN(1)),{from: staker}),
          "Cannot withdraw more dividends than you have earned."
        )
      })
      it("Should increase senders balance by value.", async function() {
        const value = ether("1000")
        const staker = stakers[0]
        const balanceInitial = await this.lidToken.balanceOf(staker)
        this.lidStaking.withdraw(value,{from: staker})
        const balanceFinal = await this.lidToken.balanceOf(staker)
        expect(balanceFinal.sub(balanceInitial).toString())
          .to.equal(value.toString())
      })
      it("Should decrease senders dividends by value.", async function() {
        const value = ether("1000")
        const staker = stakers[3]
        const divisInitial = await this.lidStaking.dividendsOf(staker)
        this.lidStaking.withdraw(value,{from: staker})
        const divisFinal = await this.lidStaking.dividendsOf(staker)
        expect(divisInitial.sub(divisFinal).toString())
          .to.equal(value.toString())
      })
    })

    describe("#reinvest", function(){
      it("Should revert if staking more tokens than in dividends", async function() {
        const staker = stakers[1]
        const divis = await this.lidStaking.dividendsOf(staker)
        expect(divis.toString()).to.not.equal(new BN(0),{from:staker})
        await expectRevert(
          this.lidStaking.reinvest(divis.add(new BN(1)),{from:staker}),
          "Cannot reinvest more dividends than you have earned."
        )
        await expectRevert(
          this.lidStaking.reinvest(divis.add(ether("1000000000")),{from:staker}),
          "Cannot reinvest more dividends than you have earned."
        )
      })
      it("Should decrease stakers dividends by value and add stakeValue.", async function() {
        const staker = stakers[1]
        const value = ether("1000")
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.reinvest(value,{from:staker})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        const stakerShares = await this.lidStaking.stakeValue(staker)
        expect(initialStakerDivis.sub(finalStakerDivis).toString())
          .to.equal(value.sub(stakerShares.div(totalStaked)).toString())
      })
      it("Should increase totalStaked by value", async function() {
        const staker = stakers[1]
        const value = ether("1000")
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.reinvest(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.add(value).toString())
      })
      it("Should increase sender's staked amount by value minus tax", async function() {
        const staker = stakers[1]
        const value = ether("100")
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.reinvest(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.add(value).toString())
      })
      it("Should not change other stakers dividends", async function() {
        const reinvester = stakers[1]
        const staker = stakers[2]
        const value = ether("50")
        const stakerShares = await this.lidStaking.stakeValue(staker)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.reinvest(value,{from:reinvester})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        expect(stakerShares.div(totalStaked).toString())
          .to.equal(finalStakerDivis.sub(initialStakerDivis).toString())
      })
    })
  })
})
