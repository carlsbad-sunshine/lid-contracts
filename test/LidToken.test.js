const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidToken = contract.fromArtifact("LidToken")
const LidStaking = contract.fromArtifact("LidStaking")


const owner = accounts[0]
const transferFromAccounts = [accounts[1],accounts[2],accounts[3],accounts[9]]
const transferToAccounts = [accounts[4],accounts[5],accounts[6],accounts[10]]
const emptyAccount = accounts[7]
const approvedSender = accounts[8]

describe("LidToken", function() {
  before(async function() {
    const tokenParams = config.LidToken
    const stakingParams = config.LidStaking

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

    await this.lidStaking.setStartTime(new BN(1),{from:owner})

    await Promise.all([
      await this.lidToken.mint(transferFromAccounts[0],ether('10'),{from: owner}),
      await this.lidToken.mint(transferFromAccounts[1],ether('10'),{from: owner}),
      await this.lidToken.mint(transferFromAccounts[2],ether('10'),{from: owner})
    ])


  })



  describe("Stateless", function(){
    describe("#taxBP", function(){
      it("Should be taxBP.", async function() {
        let taxBP = await this.lidToken.taxBP()
        expect(taxBP.toString()).to.equal(config.LidToken.taxBP.toString())
      })
    })
    describe("#findTaxAmount", function(){
      it("Should return taxBP/10000 of value passed.", async function() {
        let tax = await this.lidToken.findTaxAmount(ether("1"))
        let expectedTax = ether("1").mul(new BN(config.LidToken.taxBP)).div(new BN(10000))
        expect(tax.toString()).to.equal(expectedTax.toString())
      })
    })
  })



  describe("State: isTaxActive=false", function(){
    describe("#isTaxActive", function(){
      it("Should be false.", async function() {
        let isTaxActive = await this.lidToken.isTaxActive()
        expect(isTaxActive).to.equal(false)
      })
    })
    describe("#transfer", function(){
      it("Should revert if msg.sender sends more than their balance", async function() {
        await expectRevert(
          this.lidToken.transfer(transferToAccounts[0],ether("10").add(new BN(1)),{from:transferFromAccounts[0]}),
          "ERC20: transfer amount exceeds balance"
        )
      })
      it("Should increase receiver by value", async function() {
        const receiver = transferToAccounts[0]
        const sender = transferFromAccounts[0]
        const receiverInitialBalance = await this.lidToken.balanceOf(receiver)
        await this.lidToken.transfer(receiver,ether("1"),{from:sender})
        const receiverFinalBalance = await this.lidToken.balanceOf(receiver)
        expect(receiverFinalBalance.toString()).to.equal(receiverInitialBalance.add(ether("1")).toString())
      })
      it("Should decrease sender by value", async function() {
        const receiver = transferToAccounts[0]
        const sender = transferFromAccounts[0]
        const senderInitialBalance = await this.lidToken.balanceOf(sender)
        await this.lidToken.transfer(receiver,ether("1"),{from:sender})
        const senderFinalBalance = await this.lidToken.balanceOf(sender)
        expect(senderFinalBalance.toString()).to.equal(senderInitialBalance.sub(ether("1")).toString())
      })
    })
    describe("#transferFrom", function(){
      before(async function() {
        await this.lidToken.approve(approvedSender,ether("2"),{from:transferFromAccounts[1]})
      })
      it("Should revert if msg.sender does not have enough approved", async function() {
          const receiver = transferToAccounts[1]
          const sender = transferFromAccounts[1]
        await expectRevert(
          this.lidToken.transferFrom(sender,receiver,ether("5").add(new BN(1)),{from:approvedSender}),
          "Transfer amount exceeds allowance"
        )
      })
      it("Should increase receiver by value", async function() {
        const receiver = transferToAccounts[1]
        const sender = transferFromAccounts[1]
        const receiverInitialBalance = await this.lidToken.balanceOf(receiver)
        await this.lidToken.transferFrom(sender,receiver,ether("1"),{from:approvedSender})
        const receiverFinalBalance = await this.lidToken.balanceOf(receiver)
        expect(receiverFinalBalance.toString()).to.equal(receiverInitialBalance.add(ether("1")).toString())
      })
      it("Should decrease sender by value", async function() {
        const receiver = transferToAccounts[1]
        const sender = transferFromAccounts[1]
        const senderInitialBalance = await this.lidToken.balanceOf(sender)
        await this.lidToken.transferFrom(sender,receiver,ether("1"),{from:approvedSender})
        const senderFinalBalance = await this.lidToken.balanceOf(sender)
        expect(senderFinalBalance.toString()).to.equal(senderInitialBalance.sub(ether("1")).toString())
      })
    })
  })



  describe("State: isTaxActive=true", function(){
    before(async function() {
      await this.lidToken.setIsTaxActive(true,{from:owner})
    })
    describe("#isTaxActive", function(){
      it("Should be true.", async function() {
        let isTaxActive = await this.lidToken.isTaxActive()
        expect(isTaxActive).to.equal(true)
      })
    })
    describe("#transfer", function(){
      it("Should revert if msg.sender sends more than their balance", async function() {
        await expectRevert(
          this.lidToken.transfer(transferToAccounts[0],ether("10").add(new BN(1)),{from:transferFromAccounts[0]}),
          "ERC20: transfer amount exceeds balance"
        )
      })
      it("Should increase receiver by value minus tax.", async function() {
        let tax = await this.lidToken.findTaxAmount(ether("1"))
        const receiver = transferToAccounts[0]
        const sender = transferFromAccounts[0]
        const receiverInitialBalance = await this.lidToken.balanceOf(receiver)
        await this.lidToken.transfer(receiver,ether("1"),{from:sender})
        const receiverFinalBalance = await this.lidToken.balanceOf(receiver)
        expect(receiverFinalBalance.toString()).to.equal(receiverInitialBalance.add(ether("1")).sub(tax).toString())
      })
      it("Should decrease sender by value", async function() {
        const receiver = transferToAccounts[0]
        const sender = transferFromAccounts[0]
        const senderInitialBalance = await this.lidToken.balanceOf(sender)
        await this.lidToken.transfer(receiver,ether("1"),{from:sender})
        const senderFinalBalance = await this.lidToken.balanceOf(sender)
        expect(senderFinalBalance.toString()).to.equal(senderInitialBalance.sub(ether("1")).toString())
      })
      it("Should increase staking contract by tax", async function() {
        const receiver = transferToAccounts[0]
        const sender = transferFromAccounts[0]
        const stakingInitialBalance = await this.lidToken.balanceOf(this.lidStaking.address);
        await this.lidToken.transfer(receiver,ether("1"),{from:sender})
        const tax = await this.lidToken.findTaxAmount(ether("1"));
        const stakingFinalBalance = await this.lidToken.balanceOf(this.lidStaking.address);
        expect(stakingFinalBalance.toString()).to.equal(stakingInitialBalance.add(tax).toString())
      })
    })
    describe("#transferFrom", function(){
      before(async function() {
        await this.lidToken.approve(approvedSender,ether("3"),{from:transferFromAccounts[1]})
      })
      it("Should revert if msg.sender does not have enough approved", async function() {
          const receiver = transferToAccounts[1]
          const sender = transferFromAccounts[1]
        await expectRevert(
          this.lidToken.transferFrom(sender,receiver,ether("5").add(new BN(1)),{from:approvedSender}),
          "Transfer amount exceeds allowance"
        )
      })
      it("Should increase receiver by value minus tax", async function() {
        let tax = await this.lidToken.findTaxAmount(ether("1"))
        const receiver = transferToAccounts[1]
        const sender = transferFromAccounts[1]
        const receiverInitialBalance = await this.lidToken.balanceOf(receiver)
        await this.lidToken.transferFrom(sender,receiver,ether("1"),{from:approvedSender})
        const receiverFinalBalance = await this.lidToken.balanceOf(receiver)
        expect(receiverFinalBalance.toString()).to.equal(receiverInitialBalance.add(ether("1")).sub(tax).toString())
      })
      it("Should decrease sender by value", async function() {
        const receiver = transferToAccounts[1]
        const sender = transferFromAccounts[1]
        const senderInitialBalance = await this.lidToken.balanceOf(sender)
        await this.lidToken.transferFrom(sender,receiver,ether("1"),{from:approvedSender})
        const senderFinalBalance = await this.lidToken.balanceOf(sender)
        expect(senderFinalBalance.toString()).to.equal(senderInitialBalance.sub(ether("1")).toString())
      })
      it("Should increase staking contract by tax", async function() {
        const receiver = transferToAccounts[1]
        const sender = transferFromAccounts[1]
        const stakingInitialBalance = await this.lidToken.balanceOf(this.lidStaking.address);
        await this.lidToken.transferFrom(sender,receiver,ether("1"),{from:approvedSender})
        const tax = await this.lidToken.findTaxAmount(ether("1"));
        const stakingFinalBalance = await this.lidToken.balanceOf(this.lidStaking.address);
        expect(stakingFinalBalance.toString()).to.equal(stakingInitialBalance.add(tax).toString())
      })
    })
  })
})
