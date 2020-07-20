const { accounts, contract, web3 } = require("@openzeppelin/test-environment")
const { expectRevert, time, BN, ether, balance } = require("@openzeppelin/test-helpers")
const {expect} = require("chai")
const config = require("../config")

const LidCertifiedPresaleTimer = contract.fromArtifact("LidCertifiedPresaleTimer")

const owner = accounts[0]

const SECONDS_PER_HOUR = 3600

describe("LidCertifiedPresaleTimer", function() {
  before(async function() {
    const timerParams = config.LidPresaleTimer
    this.timerParams = timerParams
    this.lidTimer = await LidCertifiedPresaleTimer.new()
    await this.lidTimer.initialize(
      timerParams.startTime,
      timerParams.baseTimer,
      timerParams.deltaTimer,
      owner
    )
  })

  describe("#isStarted", function() {
    it("should be true in the past", async function() {
      await this.lidTimer.setStartTime("1", {from: owner})
      const result = await this.lidTimer.isStarted()
      expect(result).to.equal(true)
    })
    it("should be false with default param", async function() {
      await this.lidTimer.setStartTime(this.timerParams.startTime, {from: owner})
      const result = await this.lidTimer.isStarted()
      expect(result).to.equal(false)
    })
  })

  describe("#getEndTime", function() {
    it("should be baseTimer after start time at 0", async function() {
      const result = await this.lidTimer.getEndTime("0")
      expect(result.toString()).to.equal((this.timerParams.baseTimer+this.timerParams.startTime).toString())
    })
    it("should be deltaTime * 7 at 799 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("799"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*7
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 10 at 1301 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("1301"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(10)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 14 at 5999 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("5999"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(14)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 18 at 9101 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("9101"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(18)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 24 at 59999 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("59999"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(24)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 34 at 599999 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("599999"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(34)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 44 at 5999999 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("5999999"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(44)
      expect(actual.toString()).to.equal(expected.toString())
    })
    it("should be deltaTime * 44 at 59999999 eth", async function() {
      const actual = await this.lidTimer.getEndTime(ether("59999999"))
      const expected = this.timerParams.baseTimer+this.timerParams.startTime + this.timerParams.deltaTimer*(54)
      expect(actual.toString()).to.equal(expected.toString())
    })
  })

})
