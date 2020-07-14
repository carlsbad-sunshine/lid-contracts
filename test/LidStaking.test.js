const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")

const SECONDS_PER_DAY = 86400

const owner = accounts[0]
const stakers = [accounts[1],accounts[2],accounts[3],accounts[4]]
const nonStakerAccount = accounts[5]
const distributionAccount = accounts[6]

describe("LidStaking", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking


    await time.advanceBlock()
    const latest = await time.latest()

    this.lidToken = await LidToken.new()
    this.lidStaking = await LidStaking.new()

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

    await this.lidStaking.setStartTime(latest.add(new BN(SECONDS_PER_DAY*1)),{from:owner})

    await Promise.all([
      this.lidToken.mint(stakers[0],ether('25'),{from: owner}),
      this.lidToken.mint(stakers[1],ether('25'),{from: owner}),
      this.lidToken.mint(stakers[2],ether('25'),{from: owner}),
      this.lidToken.mint(stakers[3],ether('25'),{from: owner}),
      this.lidToken.mint(nonStakerAccount,ether('25'),{from: owner}),
      this.lidToken.mint(distributionAccount,ether('25'),{from: owner}),
    ])
  })

  describe("Stateles", function() {
    describe("#findTaxAmount", function(){
      it("Should return taxBP/10000 of value passed.", async function() {
        const taxBP = config.LidStaking.stakingTaxBP
        const tax = await this.lidStaking.findTaxAmount(ether("1"),new BN(taxBP))
        const expectedTax = ether("1").mul(new BN(taxBP)).div(new BN(10000))
        expect(tax.toString()).to.equal(expectedTax.toString())
      })
    })
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

    describe("#stake", function(){
      it("Should revert if less than 1 token", async function() {
        const staker = stakers[0]
        await expectRevert(
          this.lidStaking.stake(ether("1").sub(new BN(1)),{from:staker}),
          "Must stake at least one LID."
        )
        await expectRevert(
          this.lidStaking.stake(0,{from:staker}),
          "Must stake at least one LID."
        )
        await expectRevert(
          this.lidStaking.stake(new BN(1),{from:staker}),
          "Must stake at least one LID."
        )
      })
      it("Should increase totalStakers by 1", async function() {
        const staker = stakers[0]
        const initialTotalStakers = await this.lidStaking.totalStakers()
        await this.lidStaking.stake(ether("2"),{from:staker})
        const finalTotalStakers = await this.lidStaking.totalStakers()
        expect(finalTotalStakers.toString())
          .to.equal(initialTotalStakers.add(new BN(1)).toString())
      })
      it("Should revert if staking more tokens than held", async function() {
        const staker = stakers[0]
        const balance = await this.lidToken.balanceOf(staker)
        expect(balance.toString()).to.not.equal(new BN(0),{from:staker})
        await expectRevert(
          this.lidStaking.stake(balance.add(new BN(1)),{from:staker}),
          "Cannot stake more LID than you hold unstaked."
        )
        await expectRevert(
          this.lidStaking.stake(balance.add(ether("1000000000")),{from:staker}),
          "Cannot stake more LID than you hold unstaked."
        )
      })
      it("Should decrease stakers balance by value", async function() {
        const staker = stakers[0]
        const value = ether("2.1")
        const initialStakersTokens = await this.lidToken.balanceOf(staker)
        await this.lidStaking.stake(value,{from:staker})
        const finalStakersTokens = await this.lidToken.balanceOf(staker)
        expect(finalStakersTokens.toString())
          .to.equal(initialStakersTokens.sub(value).toString())
      })
      it("Should not change totalStakers", async function() {
        const staker = stakers[0]
        const initialTotalStakers = await this.lidStaking.totalStakers()
        await this.lidStaking.stake(ether("2"),{from:staker})
        const finalTotalStakers = await this.lidStaking.totalStakers()
        expect(finalTotalStakers.toString())
          .to.equal(initialTotalStakers.toString())
      })
      it("Should increase totalStaked by value minus tax", async function() {
        const staker = stakers[0]
        const value = ether("2.1")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.stake(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.add(value).sub(tax).toString())
      })
      it("Should increase sender's staked amount by value minus tax", async function() {
        const staker = stakers[0]
        const value = ether("2.1")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.stake(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.add(value).sub(tax).toString())
      })
      it("For single staker, dividends+stakeValue[staker] should be contract balance.", async function() {
        const staker = stakers[0]
        const balance = await this.lidToken.balanceOf(this.lidStaking.address)
        const stake = await this.lidStaking.stakeValue(staker)
        const divis = await this.lidStaking.dividendsOf(staker)
        expect(stake.add(divis).toString())
          .to.equal(balance.sub(new BN(1)).toString())
      })
      it("When second staker doubles total staked, first stakers dividends should increase by half of tax.", async function() {
        const stakerFirst = stakers[0]
        const stakerSecond = stakers[1]
        const totalStaked = await this.lidStaking.totalStaked()
        const initialDivis = await this.lidStaking.dividendsOf(stakerFirst)
        const value = totalStaked.mul(new BN(10000)).div((new BN(10000)).sub(new BN(config.LidStaking.stakingTaxBP)))
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        await this.lidStaking.stake(value,{from:stakerSecond})
        const finalDivis = await this.lidStaking.dividendsOf(stakerFirst)
        const stakerSecondDivis = await this.lidStaking.dividendsOf(stakerSecond)
        expect(finalDivis.sub(initialDivis).toString())
          .to.equal(tax.div(new BN(2)).toString())
        expect(stakerSecondDivis.toString())
          .to.equal(tax.div(new BN(2)).sub(new BN(1)).toString())
      })
      it("When third staker increases total staked by 50%, others stakers dividends should increase by third of tax.", async function() {
        const staker1 = stakers[0]
        const staker2 = stakers[1]
        const staker3 = stakers[2]
        const totalStaked = await this.lidStaking.totalStaked()
        const initialDivisStaker1 = await this.lidStaking.dividendsOf(staker1)
        const initialDivisStaker2 = await this.lidStaking.dividendsOf(staker2)
        const value = totalStaked.div(new BN(2)).mul(new BN(10000)).div((new BN(10000)).sub(new BN(config.LidStaking.stakingTaxBP)))
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        await this.lidStaking.stake(value,{from:staker3})
        const finalDivisStaker1 = await this.lidStaking.dividendsOf(staker1)
        const finalDivisStaker2 = await this.lidStaking.dividendsOf(staker2)
        const finalDivisStaker3 = await this.lidStaking.dividendsOf(staker3)
        expect(finalDivisStaker1.sub(initialDivisStaker1).toString())
          .to.equal(tax.div(new BN(3)).toString())
        expect(finalDivisStaker2.sub(initialDivisStaker2).toString())
          .to.equal(tax.div(new BN(3)).toString())
        expect(finalDivisStaker3.toString())
          .to.equal(tax.div(new BN(3)).sub(new BN(1)).toString())
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
          this.lidStaking.unstake(balance.add(ether("1000000000")),{from:staker}),
          "Cannot unstake more LID than you have staked."
        )
      })
      it("Should decrease totalStaked balance by value", async function() {
        const staker = stakers[0]
        const value = ether("1")
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.unstake(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.sub(value).toString())
      })
      it("Should increase stakers balance by value minus tax", async function() {
        const staker = stakers[0]
        const value = ether("1")
        const tax = await this.lidStaking.findTaxAmount(value,new BN(config.LidStaking.unstakingTaxBP))
        const initialStakerBalance = await this.lidToken.balanceOf(staker)
        await this.lidStaking.unstake(value,{from:staker})
        const finalStakerBalance = await this.lidToken.balanceOf(staker)
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.add(value).sub(tax).toString())
      })
      it("Should decrease sender's staked amount by value", async function() {
        const staker = stakers[0]
        const value = ether("1")
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.unstake(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        const staker1DivisQ = await this.lidStaking.dividendsOf(stakers[0])
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.sub(value).toString())
      })
      describe("Unstake All", function() {
        it("Should decrease totalStakers by 1 & Should increase stakers dividends by %owned * tax",async function() {
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
          expect(finalStakerDivis.sub(initialStakerDivis).toString())
            .to.equal(stakerValue.mul(tax).div(stakerValue).toString())
        })


      })
      it("Should increase other stakers dividends by tax/totalStaked * stakeValue", async function() {
        const staker = stakers[1]
        const unstaker = stakers[2]
        const value = ether("1")
        const tax = await this.lidStaking.findTaxAmount(value,new BN(config.LidStaking.unstakingTaxBP))
        const stakerShares = await this.lidStaking.stakeValue(staker)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.unstake(ether("1"),{from:unstaker})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        expect(tax.mul(stakerShares).div(totalStaked).toString())
          .to.equal(finalStakerDivis.sub(initialStakerDivis).toString())
      })
    })

    describe("#distribution", function(){
      before(async function() {
        await this.lidStaking.stake(ether("1"),{from:stakers[0]})
        await this.lidStaking.stake(ether("1.5"),{from:stakers[1]})
        await this.lidStaking.stake(ether("1.2"),{from:stakers[2]})
        await this.lidStaking.stake(ether("9.1"),{from:stakers[3]})
      })
      it("Should revert if distributing more than sender's balance", async function() {
        const balance = await this.lidToken.balanceOf(distributionAccount)
        await expectRevert(
          this.lidStaking.distribute(balance.add(new BN(1)),{from: distributionAccount}),
          "Cannot distribute more LID than you hold unstaked."
        )
      })
      it("Should increase totalDistributions by value", async function(){
        const value = ether("1")
        const totalDistributionsInitial = await this.lidStaking.totalDistributions()
        await this.lidStaking.distribute(value,{from: distributionAccount})
        const totalDistributionsFinal = await this.lidStaking.totalDistributions()
        expect(totalDistributionsFinal.toString())
          .to.equal(totalDistributionsInitial.add(value).toString())
      })
      it("Should increase other stakers dividends by distribution/totalStaked * stakeValue", async function() {
        const staker = stakers[1]
        const value = ether("1")
        const stakerShares = await this.lidStaking.stakeValue(staker)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.distribute(value,{from:distributionAccount})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        expect(value.mul(stakerShares).div(totalStaked).toString())
          .to.equal(finalStakerDivis.sub(initialStakerDivis).sub(new BN(1)).toString())
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
        const value = ether("0.1")
        const staker = stakers[0]
        const balanceInitial = await this.lidToken.balanceOf(staker)
        this.lidStaking.withdraw(value,{from: staker})
        const balanceFinal = await this.lidToken.balanceOf(staker)
        expect(balanceFinal.sub(balanceInitial).toString())
          .to.equal(value.toString())
      })
      it("Should decrease senders dividends by value.", async function() {
        const value = ether("0.1")
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
      it("Should decrease stakers dividends by value but add tax/totalStaked * stakeValue.", async function() {
        const staker = stakers[1]
        const value = ether("0.1")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.reinvest(value,{from:staker})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        const stakerShares = await this.lidStaking.stakeValue(staker)
        expect(initialStakerDivis.sub(finalStakerDivis).toString())
          .to.equal(value.sub(tax.mul(stakerShares).div(totalStaked)).toString())
      })
      it("Should increase totalStaked by value minus tax", async function() {
        const staker = stakers[1]
        const value = ether("0.1")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const initialTotalStaked = await this.lidStaking.totalStaked()
        await this.lidStaking.reinvest(value,{from:staker})
        const finalTotalStaked = await this.lidStaking.totalStaked()
        expect(finalTotalStaked.toString())
          .to.equal(initialTotalStaked.add(value).sub(tax).toString())
      })
      it("Should increase sender's staked amount by value minus tax", async function() {
        const staker = stakers[1]
        const value = ether("0.01")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const initialStakerBalance = await this.lidStaking.stakeValue(staker)
        await this.lidStaking.reinvest(value,{from:staker})
        const finalStakerBalance = await this.lidStaking.stakeValue(staker)
        expect(finalStakerBalance.toString())
          .to.equal(initialStakerBalance.add(value).sub(tax).toString())
      })
      it("Should increase other stakers dividends by tax/totalStaked * stakeValue", async function() {
        const reinvester = stakers[1]
        const staker = stakers[2]
        const value = ether("0.1")
        const tax = await this.lidStaking.findTaxAmount(value,config.LidStaking.stakingTaxBP)
        const stakerShares = await this.lidStaking.stakeValue(staker)
        const initialStakerDivis = await this.lidStaking.dividendsOf(staker)
        await this.lidStaking.reinvest(value,{from:reinvester})
        const finalStakerDivis = await this.lidStaking.dividendsOf(staker)
        const totalStaked = await this.lidStaking.totalStaked()
        expect(tax.mul(stakerShares).div(totalStaked).toString())
          .to.equal(finalStakerDivis.sub(initialStakerDivis).toString())
      })
    })
  })
})
