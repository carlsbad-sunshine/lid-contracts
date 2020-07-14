const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")
const LidPresale = contract.fromArtifact("LidPresale")

const owner = accounts[0]
const buyers = [accounts[1],accounts[2],accounts[3],accounts[4]]
const notWhitelisted = accounts[5]
const devfundAccount = accounts[6]
const buybackAccount = accounts[7]

describe("LidPresale", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const presaleParams = config.LidPresale

    this.lidToken = await LidToken.new()
    this.lidStaking = await LidStaking.new()
    this.lidPresale = await LidPresale.new()

    await this.lidToken.initialize(
      tokenParams.name,
      tokenParams.symbol,
      tokenParams.decimals,
      owner,
      tokenParams.taxBP,
      this.lidStaking.address
    )

    await this.lidToken.mint(
      this.lidPresale.address,
      presaleParams.totalPresaleTokens.add(presaleParams.totalUniswapTokens),
      {from: owner}
    )

    await this.lidPresale.initialize(
      presaleParams.buybackBP,
      presaleParams.devfundBP,
      presaleParams.maxBuyPerAddress,
      ether("12"),
      presaleParams.requiresWhitelisting,
      presaleParams.totalPresaleTokens,
      presaleParams.totalUniswapTokens,
      owner,
      this.lidToken.address
    )
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
  })



  describe("State: Before Presale Start", function() {
    describe("#deposit", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.deposit({from:buyer}),
          "Presale not yet started."
        )
      })
    })
    describe("#redeem", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.redeem({from:buyer}),
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
    describe("#withdrawFromDevfund", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.withdrawFromDevfund(ether("1"),owner,{from:owner}),
          "Presale not yet started."
        )
      })
    })
    describe("#withdrawFromBuyback", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.withdrawFromBuyback(ether("1"),owner,{from:owner}),
          "Presale not yet started."
        )
      })
    })
  })



  describe("State: Presale Active", function() {
    before(async function() {
      await this.lidPresale.setStartTime((Math.floor(Date.now()/1000) - 60).toString(),{from:owner})
    })
    describe("#redeem", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.redeem({from:buyer}),
          "Presale has not yet ended."
        )
      })
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
    describe("#withdrawFromDevfund", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.withdrawFromDevfund(ether("1"),owner,{from:owner}),
          "Presale has not yet ended."
        )
      })
    })
    describe("#withdrawFromBuyback", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.withdrawFromBuyback(ether("1"),owner,{from:owner}),
          "Presale has not yet ended."
        )
      })
    })
    describe("#deposit", function() {
      it("Should revert if not on whitelist", async function() {
        await expectRevert(
          this.lidPresale.deposit({from:notWhitelisted}),
          "Address is not whitelisted for this private presale."
        )
      })
      it("Should revert if buy higher than max", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress.add(new BN(1))}),
          "Deposit exceeds max buy per address."
        )
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress.add(ether("10000000000000"))}),
          "Deposit exceeds max buy per address."
        )
      })
    })
    it("Should revert if less than 1 wei", async function() {
      const buyer = buyers[0]
      await expectRevert(
        this.lidPresale.deposit({from:buyer,value:"0"}),
        "Must purchase at least 1 wei."
      )
    })
    describe("On buyer1 success", function(){
      before(async function(){
        const buyer = buyers[0]
        this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress})
      })
      it("Should increase Devfund pool by BP of value.", async function() {
        const buyer = buyers[0]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolDevfund()
        const expected = value.mul(new BN(config.LidPresale.devfundBP)).div(new BN(10000))
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase Buyback pool by BP of value.", async function() {
        const buyer = buyers[0]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolBuyback()
        const expected = value.mul(new BN(config.LidPresale.buybackBP)).div(new BN(10000))
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase Uniswap pool by value - devfund - buyback.", async function() {
        const buyer = buyers[0]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolUniswap()
        const buyback = await this.lidPresale.etherPoolBuyback()
        const devfund = await this.lidPresale.etherPoolDevfund()
        const expected = value.sub(devfund).sub(buyback)
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase depositAccounts(sender) by value.", async function() {
        const buyer = buyers[0]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.depositAccounts(buyer)
        const expected = value
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase totalPresaleEther by value.", async function() {
        const buyer = buyers[0]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.totalPresaleEther()
        const expected = value
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
    })
    describe("On buyer2 success", function(){
      before(async function(){
        const buyer = buyers[1]
        this.lidPresale.deposit({from:buyer,value:config.LidPresale.maxBuyPerAddress})
      })
      it("Should increase Devfund pool by BP of value.", async function() {
        const buyer = buyers[1]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolDevfund()
        const expected = value.mul(new BN(config.LidPresale.devfundBP)).div(new BN(10000)).mul(new BN(2))
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase Buyback pool by BP of value.", async function() {
        const buyer = buyers[1]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolBuyback()
        const expected = value.mul(new BN(config.LidPresale.buybackBP)).div(new BN(10000)).mul(new BN(2))
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase Uniswap pool by value - devfund - buyback.", async function() {
        const buyer = buyers[1]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.etherPoolUniswap()
        const buyback = await this.lidPresale.etherPoolBuyback()
        const devfund = await this.lidPresale.etherPoolDevfund()
        const expected = value.mul(new BN(2)).sub(devfund).sub(buyback)
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase depositAccounts(sender) by value.", async function() {
        const buyer = buyers[1]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.depositAccounts(buyer)
        const expected = value
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
      it("Should increase totalPresaleEther by value.", async function() {
        const buyer = buyers[1]
        const value = config.LidPresale.maxBuyPerAddress
        const actual = await this.lidPresale.totalPresaleEther()
        const expected = value.mul(new BN(2))
        expect(actual.toString()).to.not.equal("0")
        expect(actual.toString()).to.equal(expected.toString())
      })
    })
    describe("On final buyer attempts", function(){
      it("Should revert if greater than maxBuyPerAddress", async function() {
        const buyer = buyers[2]
        const value = config.LidPresale.maxBuyPerAddress
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:value}),
          "Purchase exceeds presale maximum."
        )
      })
      it("Should revert if closed", async function() {
        const buyer = buyers[2]
        const value = ether("2")
        await this.lidPresale.setIsClosedByOwner(true,{from:owner})
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:value}),
          "Presale has ended."
        )
      })
      it("Should revert if time is after endtime.", async function() {
        await this.lidPresale.setEndTime((Math.floor(Date.now()/1000) - 30).toString(),{from:owner})
        await this.lidPresale.setIsClosedByOwner(false,{from:owner})
        const buyer = buyers[2]
        const value = config.LidPresale.maxBuyPerAddress
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:value}),
          "Presale has ended."
        )
      })
      it("Should succeed if sending value to maxcap.", async function() {
        await this.lidPresale.setEndTime("0",{from:owner})
        const buyer = buyers[2]
        const startPresaleEther = await this.lidPresale.totalPresaleEther()
        const maxPresaleEther = await this.lidPresale.maximumPresaleEther()
        const value = maxPresaleEther.sub(startPresaleEther)
        await this.lidPresale.deposit({from:buyer,value:value})
        const finalPresaleEther = await this.lidPresale.totalPresaleEther()
        expect(finalPresaleEther.toString()).to.equal(maxPresaleEther.toString())
      })
      it("Should revert after cap exceeded", async function() {
        const buyer = buyers[2]
        const value = new BN(1)
        await expectRevert(
          this.lidPresale.deposit({from:buyer,value:value}),
          "Presale has ended."
        )
      })
    })
  })



  describe("State: Presale Ended", function() {
    before(async function (){
      await this.lidPresale.setHasSentToUniswap(true,{from:owner})
    })
    describe("#deposit", function() {
      it("Should revert", async function() {
        const buyer = buyers[0]
        await expectRevert(
          this.lidPresale.deposit({from:buyer}),
          "Presale has ended."
        )
      })
    })
    describe("#redeem", function() {
      it("Should revert if not a buyer", async function() {
        const buyer = buyers[3]
        await expectRevert(
          this.lidPresale.redeem({from:buyer}),
          "No redemption available."
        )
      })
      describe("On successful redemption", function(){
        before(async function() {
          const buyer = buyers[0]
          this.lidPresale.redeem({from:buyer})
        })
        it("Should revert if attempted again", async function() {
          const buyer = buyers[0]
          await expectRevert(
            this.lidPresale.redeem({from:buyer}),
            "No redemption available."
          )
        })
        it("Should increase buyer's tokens by rate", async function() {
          const buyer = buyers[0]
          const rate = await this.lidPresale.calculateRate()
          const actual = await this.lidToken.balanceOf(buyer)
          const expected = rate.mul(new BN(config.LidPresale.maxBuyPerAddress))
          expect(actual.toString()).to.not.equal("0")
          expect(actual.toString()).to.equal(expected.toString())
        })
      })
    })
    describe("#withdrawFromDevfund", function() {
      it("Should increase ether balance of receiver", async function() {
        const initialBal = new BN((await web3.eth.getBalance(buybackAccount)).toString())
        const devFundPool = await this.lidPresale.etherPoolDevfund()
        await this.lidPresale.withdrawFromDevfund(devFundPool,devfundAccount,{from: owner})
        const finalBal = new BN((await web3.eth.getBalance(devfundAccount)).toString())
        expect(finalBal.sub(initialBal).toString()).to.equal(devFundPool.toString())
      })
      it("Should revert after empty", async function() {
        await expectRevert(
          this.lidPresale.withdrawFromDevfund(new BN(1),owner,{from:owner}),
          "Amount exceeds pool."
        )
      })
    })
    describe("#withdrawFromBuyback", function() {
      it("Should increase ether balance of receiver", async function() {
        const initialBal = new BN((await web3.eth.getBalance(buybackAccount)).toString())
        const buybackPool = await this.lidPresale.etherPoolBuyback()
        await this.lidPresale.withdrawFromBuyback(buybackPool,buybackAccount,{from: owner})
        const finalBal = new BN((await web3.eth.getBalance(buybackAccount)).toString())
        expect(finalBal.sub(initialBal).toString()).to.equal(buybackPool.toString())
      })
      it("Should revert after empty", async function() {
        await expectRevert(
          this.lidPresale.withdrawFromBuyback(new BN(1),owner,{from:owner}),
          "Amount exceeds pool."
        )
      })
    })
  })
})
