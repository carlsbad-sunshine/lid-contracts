const { ether } = require("@openzeppelin/test-helpers")

let config = {}

config.LidToken = {
  name:"Lidbar Network",
  symbol:"LID",
  decimals:18,
  taxBP:100
}

config.LidStaking = {
  stakingTaxBP: 100,
  unstakingTaxBP: 100,
  startTime: 1593918000
}

config.LidPresale = {
  buybackBP: 1500,
  devfundBP: 1000,
  maxBuyPerAddress: ether("5"),
  maximumPresaleEther: ether("200"),
  requiresWhitelisting: true,
  totalPresaleTokens: ether("40000000"),
  totalUniswapTokens: ether("24000000")
}

config.LidStakingRewardPool = {
  releaseBP: 1000,
  releaseInterval: 86400*30,
  cycleStart: 1594387800,
  size: ether("26000000")
}

config.LidPromoFund = {
  size: ether("10000000"),
  authorizor: "0xF142e06408972508619ee93C2b8bff15ef7c2cb3",
  releaser: "0xd04371F7b83a317Ff92DF60915Ca1C7037a01a4c"
}

config.LidTeamLock = {
  releaseAmount:ether("2500000"),
  releaseInterval:86400*30,
  releaseStart:1593955800,
  teamMembers:[
    "0xd04371F7b83a317Ff92DF60915Ca1C7037a01a4c",
    "0x4771a883088CD7BEae45f7d84CFbFDCF18f726c5",
    "0xFD9fc91e1Bc8fBBa21ef3EbFd07EAB1247aF8B41",
    "0xF142e06408972508619ee93C2b8bff15ef7c2cb3"
  ],
  size: ether("10000000")
}

config.LidDevFund = {
  releaseAmount:ether("2500000"),
  releaseInterval:86400*30,
  releaseStart:1593955800,
  size: ether("30000000"),
  authorizor: "0xF142e06408972508619ee93C2b8bff15ef7c2cb3",
  releaser: "0xd04371F7b83a317Ff92DF60915Ca1C7037a01a4c"
}

config.Launch = {
  startTime: 1593696600
}
module.exports = config
