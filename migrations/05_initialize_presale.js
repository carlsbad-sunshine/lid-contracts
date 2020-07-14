const { scripts, ConfigManager } = require("@openzeppelin/cli")
const { add, push, create } = scripts
const {publicKey} = require("../privatekey")

const config = require("../config")

const LidToken = artifacts.require("LidToken")
const LidStaking = artifacts.require("LidStaking")
const LidPresale = artifacts.require("LidPresale")

async function initialize(accounts,networkName) {
  let owner = accounts[0]

  const tokenParams =   config.LidToken
  const stakingParams = config.LidStaking
  const presaleParams = config.LidPresale
  const launchParams =  config.Launch

  const lidToken =   await LidToken.deployed()
  const lidStaking = await LidStaking.deployed()
  const lidPresale = await LidPresale.deployed()

  await lidToken.initialize(
    tokenParams.name,
    tokenParams.symbol,
    tokenParams.decimals,
    owner,
    tokenParams.taxBP,
    lidStaking.address
  )

  await lidStaking.initialize(
    stakingParams.stakingTaxBP,
    stakingParams.unstakingTaxBP,
    owner,
    lidToken.address
  )

  await lidToken.mint(
    lidPresale.address,
    presaleParams.totalPresaleTokens.add(presaleParams.totalUniswapTokens)
  )

  await lidPresale.initialize(
    presaleParams.buybackBP,
    presaleParams.devfundBP,
    presaleParams.maxBuyPerAddress,
    presaleParams.maximumPresaleEther,
    presaleParams.requiresWhitelisting,
    presaleParams.totalPresaleTokens,
    presaleParams.totalUniswapTokens,
    owner,
    lidToken.address
  )

  lidPresale.setStartTime(launchParams.startTime.toString(),{from:owner})

}

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    await initialize(accounts,networkName)
  })
}
