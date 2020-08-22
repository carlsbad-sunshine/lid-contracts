const { encodeCall } = require("@openzeppelin/upgrades")
const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")
const LidStakingV2 = contract.fromArtifact("LidStakingV2")
const LidCertifiedPresale = contract.fromArtifact("LidCertifiedPresale")
const LidDaoFund = contract.fromArtifact("LidDaoLock")
const AdminUpgradeabilityProxyABI = require("@openzeppelin/upgrades/build/contracts/AdminUpgradeabilityProxy.json")
const AdminUpgradeabilityProxy = contract.fromABI(
  AdminUpgradeabilityProxyABI.abi,
  AdminUpgradeabilityProxyABI.bytecode
)
const ProxyAdminABI = require("@openzeppelin/upgrades/build/contracts/ProxyAdmin.json")
const ProxyAdmin = contract.fromABI(
  ProxyAdminABI.abi, ProxyAdminABI.bytecode
)

SECONDS_PER_DAY = 86400

const owner = accounts[0]
const stakers = [accounts[1],accounts[2],accounts[3],accounts[4]]
const nonstaker = accounts[5]
const distributionAccount = accounts[8]

let staked = {}
let history = {}
let totalStaked = new BN(0)
let totalStakedHistory = []

describe("LidStakingV2", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking

    // Create the token instance
    this.lidToken = await LidToken.new()

    // Stand up an upgradeable LidStaking instance
    this.lidStakingLogic = await LidStaking.new()
    this.lidStakingAdmin = await ProxyAdmin.new({ from: owner })
    this.lidStaking = await AdminUpgradeabilityProxy.new(
      this.lidStakingLogic.address,
      this.lidStakingAdmin.address,
      encodeCall(
        'initialize',
        [
          'uint256', 'uint256', 'uint256',
          'uint256', 'address', 'address'
        ],
        [
          stakingParams.stakingTaxBP.toString(),
          stakingParams.unstakingTaxBP.toString(),
          stakingParams.registrationFeeWithReferrer.toString(),
          stakingParams.registrationFeeWithoutReferrer.toString(),
          owner,
          this.lidToken.address
        ]
      )
    );

    // "cast" this.lidStaking to a LidStaking contract
    this.lidStaking = contract.fromArtifact("LidStaking", this.lidStaking.address);

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

    await this.lidStaking.setStartTime(
      latest.add(new BN(SECONDS_PER_DAY)), {from:owner}
    )

    // Start the staking period
    await time.advanceBlock()
    latest = await time.latest()
    await time.increase(SECONDS_PER_DAY*30)

    // Have all the stakers send an initial stake + registration
    for (const staker of stakers) {
      const value = ether("21000")
      await this.lidStaking.registerAndStake(value,{from:staker})

      if (!staked[staker]) {
        staked[staker] = new BN(0)
      }

      const tax = await this.lidStaking.stakingTaxBP();
      const taxAmount = await this.lidStaking.findTaxAmount(value, tax)
      const regFee = await this.lidStaking.registrationFeeWithoutReferrer()
      const result = value.sub(taxAmount).sub(regFee)
      staked[staker] = staked[staker].add(result)
      totalStaked = totalStaked.add(result)
    }
  })

  describe("LidStaking", function() {
    it("sanity check", async function() {
      const stakers = Object.keys(staked);
      for (const staker of stakers) {
        const value = await this.lidStaking.stakeValue(staker)
        expect(value.toString())
          .to.equal(staked[staker].toString())
      }
    })

    describe("LidStakingV2", function() {
      it("Upgrade LidStaking to V2", async function() {
        this.lidStakingLogicV2 = await LidStakingV2.new()
        await this.lidStakingAdmin.upgrade(
          this.lidStaking.address,
          this.lidStakingLogicV2.address,
          {from: owner}
        )

        expect(await this.lidStakingAdmin.getProxyImplementation(
          this.lidStaking.address
        )).to.equal(this.lidStakingLogicV2.address)

        // "cast" this.lidStaking to LidStakingV2
        this.lidStaking = contract.fromArtifact(
          "LidStakingV2",
          this.lidStaking.address
        )
      })

      it("Initialize V2", async function() {
        await this.lidStaking.v2Initialize(
          this.lidToken.address,
          {from: owner}
        )

        await expectRevert(
          this.lidStaking.v2Initialize(owner, {from: owner}),
          "V2 Contract instance has already been initialized"
        )
      })

      it("V2 Stake History Fresh Upgrade", async function() {
        const result = await this.lidStaking.totalStakedAt(
          await time.latestBlock()
        )

        expect(result.toString())
          .to.equal(totalStaked.toString())

        for (const staker of stakers) {
          const value = staked[staker]
          const result = await this.lidStaking.stakeValueAt(
            staker, await time.latestBlock()
          );

          expect(result.toString())
            .to.equal(value.toString())
        }
      })

      it("V2 Stake History Is Correct After Stake & Unstake", async function() {

        const exec = async (method, addOrSub, staker, eth) => {
          const stakeInput = ether(eth)
          const tax = await this.lidStaking.stakingTaxBP()
          const taxAmount = await this.lidStaking.findTaxAmount(stakeInput, tax)
          const result = stakeInput.sub(taxAmount)
          staked[staker] = staked[staker][addOrSub](result)
          totalStaked = totalStaked[addOrSub](result)

          const tx = await this.lidStaking[method](
            stakeInput, {from: staker}
          )

          if (!history[staker]) {
            history[staker] = []
          }

          history[staker].push({
            value: staked[staker],
            block: tx.receipt.blockNumber
          })

          totalStakedHistory.push({
            value: totalStaked,
            block: tx.receipt.blockNumber
          })
        }

        const stake = async (staker, eth) => {
          await exec("stake", "add", staker, eth)
        }

        const unstake = async (staker, eth) => {
          await exec("unstake", "sub", staker, eth)
        }

        for (const staker of stakers) {
          const rand = () => Math.floor(1000 + Math.random() * 100).toString()
          await stake(staker, rand())
          await stake(staker, rand())
          await unstake(staker, rand())
          await stake(staker, rand())
          await unstake(staker, rand())
        }

        for (const staker of stakers) {
          const stakeHistory = history[staker]

          // Verify latest block
          await time.advanceBlock()
          const latestResult = await this.lidStaking.stakeValueAt(
            staker, await time.latestBlock()
          )

          expect(latestResult.toString())
            .to.equal(staked[staker].toString())

          // Verify all stake history
          for (const checkpoint of stakeHistory) {
            const { value, block } = checkpoint
            const result = await this.lidStaking.stakeValueAt(staker, block)

            expect(result.toString())
              .to.equal(value.toString())
          }
        }

        // Verify all "total staked" history
        for (const checkpoint of totalStakedHistory) {
          const { value, block } = checkpoint
          const result = await this.lidStaking.totalStakedAt(block)

          expect(result.toString())
            .to.equal(value.toString())
        }
      })
    })
  })
})
