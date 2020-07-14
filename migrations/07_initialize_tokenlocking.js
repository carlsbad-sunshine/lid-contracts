const { scripts, ConfigManager } = require('@openzeppelin/cli');
const { add, push, create } = scripts;
const {publicKey} = require("../privatekey")

const config = require("../config")

const LidToken = artifacts.require("LidToken")
const LidStaking = artifacts.require("LidStaking")

const LidDevfund = artifacts.require("LidDevfund")
const LidPromoFund = artifacts.require("LidPromoFund")
const LidTeamLock = artifacts.require("LidTeamLock")

async function initialize(accounts,networkName){
    let owner = accounts[0]

    const devfundParams = config.LidDevFund
    const promoParams = config.LidPromoFund
    const teamLockParams = config.LidTeamLock

    const lidToken =   await LidToken.deployed()
    const lidStaking = await LidStaking.deployed()

    const lidDevfund =   await LidDevfund.deployed()
    const lidPromoFund =   await LidPromoFund.deployed()
    const lidTeamLock = await LidTeamLock.deployed()

    await lidDevfund.initialize(
      devfundParams.releaseAmount,
      devfundParams.releaseInterval,
      devfundParams.releaseStart,
      devfundParams.authorizor,
      devfundParams.releaser,
      lidToken.address,
      lidStaking.address
    )

    await lidPromoFund.initialize(
      promoParams.authorizor,
      promoParams.releaser,
      lidToken.address
    )

    await lidTeamLock.initialize(
      teamLockParams.releaseAmount,
      teamLockParams.releaseInterval,
      teamLockParams.releaseStart,
      teamLockParams.teamMembers,
      lidToken.address
    )

    lidToken.mint(lidDevfund.address,devfundParams.size,{from:owner})
    lidToken.mint(lidPromoFund.address,promoParams.size,{from:owner})
    lidToken.mint(lidTeamLock.address,teamLockParams.size,{from:owner})

}

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    await initialize(accounts,networkName)
  })
}
