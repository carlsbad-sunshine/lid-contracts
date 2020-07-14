const { scripts, ConfigManager } = require('@openzeppelin/cli');
const { add, push, create } = scripts;
const {publicKey} = require("../privatekey")

const config = require("../config")

const LidToken = artifacts.require("LidToken")
const LidStaking = artifacts.require("LidStaking")

const LidDevfund = artifacts.require("LidDevfund")
const LidPromoFund = artifacts.require("LidPromoFund")
const LidTeamLock = artifacts.require("LidTeamLock")

async function deploy(options) {
  add({ contractsData: [
    { name: 'LidDevfund', alias: 'LidDevfund' },
    { name: 'LidPromoFund', alias: 'LidPromoFund' },
    { name: 'LidTeamLock', alias: 'LidTeamLock' }
  ] });
  await push(options);
  await create(Object.assign({ contractAlias: 'LidDevfund' }, options));
  await create(Object.assign({ contractAlias: 'LidPromoFund' }, options));
  await create(Object.assign({ contractAlias: 'LidTeamLock' }, options));
}

module.exports = function(deployer, networkName, accounts) {
  deployer.then(async () => {
    let account = accounts[0]
    const { network, txParams } = await ConfigManager.initNetworkConfiguration({ network: networkName, from: account })
    await deploy({ network, txParams })
  })
}
