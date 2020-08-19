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
const distributionAccount = accounts[8]

describe("LidStakingV2", function() {
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

    // Start the staking period
    await time.advanceBlock()
    let latest = await time.latest()
    await time.increase(SECONDS_PER_DAY*30)

    // Have all the stakers send an initial stake
    for (const i = 0; i < stakers.length; ++i) {
      const staker = stakers[i]
      const value = ether("21000")
      await this.lidStaking.stake(value,{from:staker})
    }
  })

  describe("TODO", function() {
    it("TODO", async function() {

    })
  })
})

/*
TODO:
- Validate that the existing staking contract is initialized properly
- Upgrade the staking contract to LidStakingV2
- initialize (only owner)
- regular stake + unstake works
- history tracking works (total staked + stakers)
*/
