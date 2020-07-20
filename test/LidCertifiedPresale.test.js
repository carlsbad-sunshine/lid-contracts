const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")
const LidTeamLock = contract.fromArtifact("LidTeamLock")
const LidDaoLock = contract.fromArtifact("LidDaoLock")
const LidPromoFund = contract.fromArtifact("LidPromoFund")
const LidCertifiedPresale = contract.fromArtifact("LidCertifiedPresale")
const LidCertifiedPresaleTimer = contract.fromArtifact("LidCertifiedPresaleTimer")


const owner = accounts[0]
const buyers = [accounts[1],accounts[2],accounts[3],accounts[4]]
const notWhitelisted = accounts[5]

describe("LidPresale", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking
    const presaleParams = config.LidPresale
    const timerParams = config.LidPresaleTimer

    this.lidToken = await LidToken.new()
    this.lidStaking = await LidStaking.new()
    this.lidTeamFund = await LidTeamLock.new()
    this.lidPromoFund = await LidPromoFund.new()
    this.lidDaoFund = await LidPromoFund.new()
    this.lidPresale = await LidCertifiedPresale.new()
    this.lidTimer = await LidCertifiedPresaleTimer.new()


    await this.lidToken.initialize(
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      owner,
      tokenParams.taxBP,
      tokenParams.daoTaxBP,
      this.lidDaoFund.address,
      this.lidStaking.address,
      this.lidPresale.address
    )
    await this.lidToken.addMinter(this.lidPresale.address,{from:owner})
    await this.lidStaking.initialize(
      stakingParams.stakingTaxBP,
      stakingParams.unstakingTaxBP,
      owner,
      this.lidToken.address
    )
    await this.lidTimer.initialize(
      timerParams.startTime,
      timerParams.baseTimer,
      timerParams.deltaTimer,
      owner
    )
    await this.lidPresale.initialize(
      presaleParams.maxBuyPerAddressBase,
      presaleParams.maxBuyPerAddressBP,
      presaleParams.maxBuyWithoutWhitelisting,
      presaleParams.redeemBP,
      presaleParams.redeemInterval,
      presaleParams.referralBP,
      presaleParams.startingPrice,
      presaleParams.multiplierPrice,
      owner,
      this.lidTimer.address,
      this.lidToken.address
    )

    await this.lidPresale.setEtherPools(
      [
        this.lidPromoFund.address,
        this.lidTeamFund.address
      ],
      [
        presaleParams.etherPools.promoFund,
        presaleParams.etherPools.teamFund
      ],
      {from: owner}
    )

    await this.lidPresale.setTokenPools(
      [
        this.lidPromoFund.address,
        this.lidStaking.address,
        this.lidTeamFund.address,
        this.lidDaoFund.address
      ],
      [
        presaleParams.tokenPools.promoFund,
        presaleParams.tokenPools.stakingFund,
        presaleParams.tokenPools.teamFund,
        presaleParams.tokenPools.daoFund,
      ],
      {from: owner}
    )

    await this.lidStaking.setStartTime(new BN(1),{from:owner})


  })

  describe("Stateless", function() {
    describe("#setWhitelist", function() {
      it("Should revert from non owner", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.setWhitelist(buyer,true,{from:buyer}),
          "Ownable: caller is not the owner"
        )
      })
      it("Should whitelist non whitelisted account", async function() {
        const buyer = buyers[0]
        const initialWhitelist = await this.lidPresale.whitelist(buyer)
        await this.lidPresale.setWhitelist(buyer,true,{from:owner})
        const finalWhitelist = await this.lidPresale.whitelist(buyer)
        expect(initialWhitelist).to.equal(false)
        expect(finalWhitelist).to.equal(true)
      })
      it("Should unwhitelist account", async function() {
        const buyer = buyers[0]
        const initialWhitelist = await this.lidPresale.whitelist(buyer)
        await this.lidPresale.setWhitelist(buyer,false,{from:owner})
        const finalWhitelist = await this.lidPresale.whitelist(buyer)
        expect(initialWhitelist).to.equal(true)
        expect(finalWhitelist).to.equal(false)
      })
    })
    describe("#setWhitelistForAll", function() {
      it("Should whitelist all addresses", async function() {
        await this.lidPresale.setWhitelistForAll(buyers,true,{from:owner})
        let whitelistVals = await Promise.all(buyers.map((buyer)=>{
          return this.lidPresale.whitelist(buyer)
        }))
        expect(whitelistVals.reduce((acc,val)=>{
          return acc && val
        })).to.equal(true)
      })
    })
    describe("#getMaxWhitelistedDeposit", function() {
      it("Should be base at deposit 0 eth.", async function() {
        const actualMax = await this.lidPresale.getMaxWhitelistedDeposit("0")
        const expectMax = config.LidPresale.maxBuyPerAddressBase
        expect(expectMax.toString()).to.equal(actualMax.toString())
      })
      it("Should be base + bp*val at deposit val eth.", async function() {
        const val = ether("1302.13")
        const actualMax = await this.lidPresale.getMaxWhitelistedDeposit(val)
        const expectMax = new BN(config.LidPresale.maxBuyPerAddressBase.toString()).add(
          val.mul(new BN(config.LidPresale.maxBuyPerAddressBP.toString())).div(new BN("10000"))
        )
        expect(expectMax.toString()).to.equal(actualMax.toString())
      })
    })
  })


  describe("State: Before Presale Start", function() {
    describe("#deposit", function() {
      it("Should revert", async function() {
        const startTime = await this.lidTimer.startTime()
        const isStarted = await this.lidTimer.isStarted()
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.deposit({from:buyer}),
          "Presale not yet started."
        )
      })
    })
    describe("#sendToUniswap", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.sendToUniswap({from:buyer}),
          "Presale not yet started."
        )
      })
    })
  })



  describe("State: Presale Active", function() {
    before(async function() {
      await this.lidTimer.setStartTime((Math.floor(Date.now()/1000) - 60).toString(),{from:owner})
    })
    describe("#sendToUniswap", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.sendToUniswap({from:buyer}),
          "Presale has not yet ended."
        )
      })
    })
    describe("#deposit", function() {
      it("Should not allow more than nonWhitelisted max buy if not on whitelist.", async function() {
        await expectRevert(
          this.lidPresale.deposit({from:notWhitelisted,value:config.LidPresale.maxBuyWithoutWhitelisting.add(new BN(1))}),
          "Deposit exceeds max buy per address for non-whitelisted addresses."
        )
      })
      it("Should revert if buy higher than max", async function() {
        const buyer = buyers[0]
        const totalDeposit = await web3.eth.getBalance(this.lidPresale.address)
        const max = new BN(await this.lidPresale.getMaxWhitelistedDeposit(totalDeposit))

        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:max.add(new BN(1))}),
          "Deposit exceeds max buy per address for whitelisted addresses."
        )
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:max.add(ether("10000000000000"))}),
          "Deposit exceeds max buy per address for whitelisted addresses."
        )
      })
    })
    it("Should revert if less than 0.01 ether", async function() {
      const buyer = buyers[0]
      await expectRevert(
        this.lidPresale.deposit({from:buyer,value:"0"}),
        "Must purchase at least 0.01 ether."
      )
    })
    describe("On buyer1 success", function(){
      before(async function(){
        const buyer = buyers[0]
        this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress})
      })
    })
    describe("On buyer2 success", function(){
      before(async function(){
        const buyer = buyers[1]
        this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress})
      })
    })
    describe("On final buyer attempts", function(){
      it("Should revert if greater than max", async function() {
        const buyer = buyers[2]

        const totalDeposit = await web3.eth.getBalance(this.lidPresale.address)
        const max = new BN(await this.lidPresale.getMaxWhitelistedDeposit(totalDeposit))

        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:max.add(new BN(1))}),
          "Deposit exceeds max buy per address for whitelisted addresses."
        )
      })
      it("Should revert if time is after endtime.", async function() {
        await this.lidTimer.setStartTime("1",{from:owner})
        const buyer = buyers[2]

        const totalDeposit = await web3.eth.getBalance(this.lidPresale.address)
        const max = new BN(await this.lidPresale.getMaxWhitelistedDeposit(totalDeposit))
        const endTime = await this.lidTimer.getEndTime(totalDeposit)

        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:max}),
          "Presale has ended."
        )
      })
    })
  })



  describe("State: Presale Ended", function() {
    describe("#deposit", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.deposit({from:buyer}),
          "Presale has ended."
        )
      })
    })
  })
})
