const { scripts, ConfigManager } = require("@openzeppelin/cli")
const { add, push, create } = scripts
const {publicKey} = require("../privatekey")

const config = require("../config")

const LidToken = artifacts.require("LidToken")
const LidStaking = artifacts.require("LidStaking")
const LidStakingRewardPool = artifacts.require("LidStakingRewardPool")

async function initialize(accounts,networkName) {
  let owner = accounts[0]

  const tokenParams =   config.LidToken
  const stakingParams = config.LidStaking
  const stakingRewardPoolParams = config.LidStakingRewardPool

  const lidToken =   await LidToken.deployed()
  const lidStaking = await LidStaking.deployed()
  const lidStakingRewardPool = await LidStakingRewardPool.deployed()

  await lidStakingRewardPool.initialize(
    stakingRewardPoolParams.releaseBP,
    stakingRewardPoolParams.releaseInterval,
    stakingRewardPoolParams.cycleStart,
    owner,
    lidToken.address,
    lidStaking.address
  )

  await lidToken.setTaxExemptStatus(lidStakingRewardPool.address,true,{from:owner})
  await lidToken.mint(lidStakingRewardPool.address,stakingRewardPoolParams.size,{from: owner})
  await lidStaking.registerStakeHandler(lidStakingRewardPool.address,{from:owner})
}

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    await initialize(accounts,networkName)
  })
}
