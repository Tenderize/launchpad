import * as anchor from "@project-serum/anchor";
import { LaunchpadTester } from "./launchpad_tester";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import * as spl from "@solana/spl-token";
import { expect, assert } from "chai";
import { BN } from "bn.js";

describe("launchpad", () => {
  let lpd = new LaunchpadTester();
  lpd.printErrors = true;
  let launchpadExpected;
  let multisigExpected;
  let auctionExpected;
  let auctionParams;

  it("init", async () => {
    await lpd.init_fixture();
    await lpd.init();

    let err = await lpd.ensureFails(lpd.init());
    assert(err.logs[3].includes("already in use"));

    launchpadExpected = {
      permissions: {
        allowNewAuctions: true,
        allowAuctionUpdates: true,
        allowNewBids: true,
        allowWithdrawals: true,
      },
      fees: {
        newAuction: { numerator: "1", denominator: "100" },
        auctionUpdate: { numerator: "1", denominator: "100" },
        invalidBid: { numerator: "1", denominator: "100" },
        trade: { numerator: "1", denominator: "100" },
      },
      collectedFees: {
        newAuctionSol: "0",
        auctionUpdateSol: "0",
        invalidBidUsdc: "0",
        tradeUsdc: "0",
      },
      transferAuthorityBump: lpd.authority[1],
      launchpadBump: lpd.multisig[1],
    };

    multisigExpected = {
      numSigners: 2,
      numSigned: 0,
      minSignatures: 2,
      instructionAccountsLen: 0,
      instructionDataLen: 0,
      instructionHash: new anchor.BN(0),
      signers: [
        lpd.admins[0].publicKey,
        lpd.admins[1].publicKey,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
        PublicKey.default,
      ],
      signed: [false, false, false, false, false, false],
      bump: lpd.multisig[1],
    };

    let multisig = await lpd.program.account.multisig.fetch(lpd.multisig[0]);
    expect(JSON.stringify(multisig)).to.equal(JSON.stringify(multisigExpected));

    let launchpad = await lpd.program.account.launchpad.fetch(lpd.launchpad[0]);
    expect(JSON.stringify(launchpad)).to.equal(
      JSON.stringify(launchpadExpected)
    );
  });

  it("setAdminSigners", async () => {
    await lpd.setAdminSigners(1);

    let multisig = await lpd.program.account.multisig.fetch(lpd.multisig[0]);
    multisigExpected.minSignatures = 1;
    expect(JSON.stringify(multisig)).to.equal(JSON.stringify(multisigExpected));
  });

  it("setFees", async () => {
    launchpadExpected.fees = {
      newAuction: { numerator: new BN(1), denominator: new BN(1000) },
      auctionUpdate: { numerator: new BN(1), denominator: new BN(1000) },
      invalidBid: { numerator: new BN(1), denominator: new BN(1000) },
      trade: { numerator: new BN(1), denominator: new BN(1000) },
    };
    await lpd.setFees(launchpadExpected.fees);

    let launchpad = await lpd.program.account.launchpad.fetch(lpd.launchpad[0]);
    expect(JSON.stringify(launchpad)).to.equal(
      JSON.stringify(launchpadExpected)
    );
  });

  it("setPermissions", async () => {
    launchpadExpected.permissions = {
      allowNewAuctions: false,
      allowAuctionUpdates: false,
      allowNewBids: false,
      allowWithdrawals: false,
    };
    await lpd.setPermissions(launchpadExpected.permissions);

    let launchpad = await lpd.program.account.launchpad.fetch(lpd.launchpad[0]);
    expect(JSON.stringify(launchpad)).to.equal(
      JSON.stringify(launchpadExpected)
    );
  });

  it("initCustodies", async () => {
    let config = {
      maxOraclePriceError: 1,
      maxOraclePriceAgeSec: 60,
      oracleType: { test: {} },
      oracleAccount: lpd.pricingCustody.oracleAccount,
    };
    await lpd.initCustody(config, lpd.pricingCustody);

    config.oracleAccount = lpd.paymentCustody.oracleAccount;
    await lpd.initCustody(config, lpd.paymentCustody);

    let custody = await lpd.program.account.custody.fetch(
      lpd.pricingCustody.custody
    );
    let custodyExpected = {
      tokenAccount: lpd.pricingCustody.tokenAccount,
      collectedFees: new BN(0),
      mint: lpd.pricingCustody.mint.publicKey,
      decimals: lpd.pricingCustody.decimals,
      maxOraclePriceError: config.maxOraclePriceError,
      maxOraclePriceAgeSec: config.maxOraclePriceAgeSec,
      oracleType: config.oracleType,
      oracleAccount: lpd.pricingCustody.oracleAccount,
      bump: custody.bump,
    };
    expect(JSON.stringify(custody)).to.equal(JSON.stringify(custodyExpected));
  });

  it("setOracleConfig", async () => {
    let config = {
      maxOraclePriceError: 123,
      maxOraclePriceAgeSec: 900,
      oracleType: { test: {} },
      oracleAccount: lpd.paymentCustody.oracleAccount,
    };
    let custodyExpected = await lpd.program.account.custody.fetch(
      lpd.paymentCustody.custody
    );
    custodyExpected.maxOraclePriceError = config.maxOraclePriceError;
    custodyExpected.maxOraclePriceAgeSec = config.maxOraclePriceAgeSec;
    custodyExpected.oracleType = config.oracleType;
    custodyExpected.oracleAccount = config.oracleAccount;

    await lpd.setOracleConfig(config, lpd.paymentCustody);

    let custody = await lpd.program.account.custody.fetch(
      lpd.paymentCustody.custody
    );
    expect(JSON.stringify(custody)).to.equal(JSON.stringify(custodyExpected));
  });

  it("initAuction", async () => {
    auctionParams = {
      enabled: true,
      updatable: true,
      common: {
        name: "test auction",
        description: "test only",
        aboutSeller: "Tester",
        sellerLink: "solana.com",
        startTime: new BN(222),
        endTime: new BN(2222),
        presaleStartTime: new BN(111),
        presaleEndTime: new BN(222),
        fillLimitRegAddress: new BN(10),
        fillLimitWlAddress: new BN(20),
      },
      payment: {
        acceptSol: true,
        acceptUsdc: true,
        acceptOtherTokens: true,
      },
      pricing: {
        custody: lpd.pricingCustody.custody,
        pricingModel: { dynamicDutchAuction: {} },
        startPrice: new BN(100),
        maxPrice: new BN(200),
        minPrice: new BN(90),
        repriceDelay: new BN(5),
        repriceFunction: { linear: {} },
        amountFunction: { fixed: {} },
        amountPerLevel: new BN(200),
        tickSize: new BN(2),
      },
      tokenRatios: [new BN(1), new BN(2)],
    };

    let err = await lpd.ensureFails(lpd.initAuction(auctionParams));
    assert(err.error.errorCode.code === "NewAuctionsNotAllowed");

    launchpadExpected.permissions = {
      allowNewAuctions: true,
      allowAuctionUpdates: true,
      allowNewBids: true,
      allowWithdrawals: true,
    };
    await lpd.setPermissions(launchpadExpected.permissions);

    await lpd.initAuction(auctionParams);

    let auction = await lpd.program.account.auction.fetch(lpd.auction[0]);
    auctionExpected = {
      owner: lpd.seller.wallet.publicKey,
      enabled: true,
      updatable: true,
      common: auctionParams.common,
      payment: auctionParams.payment,
      pricing: auctionParams.pricing,
      stats: {
        firstTradeTime: "0",
        lastTradeTime: "0",
        lastAmount: "0",
        lastPrice: "0",
        wlBidders: {
          fillsVolume: "0",
          weightedFillsSum: "0",
          minFillPrice: "18446744073709551615",
          maxFillPrice: "0",
          numTrades: "0",
        },
        regBidders: {
          fillsVolume: "0",
          weightedFillsSum: "0",
          minFillPrice: "18446744073709551615",
          maxFillPrice: "0",
          numTrades: "0",
        },
      },
      tokens: [
        { ratio: "0", account: "11111111111111111111111111111111" },
        { ratio: "0", account: "11111111111111111111111111111111" },
        { ratio: "0", account: "11111111111111111111111111111111" },
        { ratio: "0", account: "11111111111111111111111111111111" },
      ],
      numTokens: 0,
      creationTime: "0",
      updateTime: "0",
      bump: 255,
    };
    expect(JSON.stringify(auction)).to.equal(JSON.stringify(auctionExpected));
  });

  it("updateAuction", async () => {
    auctionParams.common.description = "updated";
    let params = {
      common: auctionParams.common,
      payment: auctionParams.payment,
      pricing: auctionParams.pricing,
      tokenRatios: auctionParams.tokenRatios,
    };
    await lpd.updateAuction(params);

    let auction = await lpd.program.account.auction.fetch(lpd.auction[0]);
    auctionExpected.common.description = "updated";
    expect(JSON.stringify(auction)).to.equal(JSON.stringify(auctionExpected));
  });

  it("disableAuction", async () => {
    await lpd.disableAuction();
    let auction = await lpd.program.account.auction.fetch(lpd.auction[0]);
    auctionExpected.enabled = false;
    expect(JSON.stringify(auction)).to.equal(JSON.stringify(auctionExpected));
  });

  it("enableAuction", async () => {
    await lpd.enableAuction();
    let auction = await lpd.program.account.auction.fetch(lpd.auction[0]);
    auctionExpected.enabled = true;
    expect(JSON.stringify(auction)).to.equal(JSON.stringify(auctionExpected));
  });

  it("setTestOraclePrice", async () => {
    /*await lpd.setTestOraclePrice(123, lpd.paymentCustody);

    let oracle = await lpd.program.account.testOracle.fetch(
      lpd.paymentCustody.oracleAccount
    );
    let oracleExpected = {
      price: new BN(123000),
      expo: -3,
      conf: new BN(0),
      publish_time: oracle.publishTime,
    };
    expect(JSON.stringify(oracle)).to.equal(JSON.stringify(oracleExpected));*/
  });

  it("setTestTime", async () => {
    /*await lpd.setTestTime(new BN(111));

    let auction = await lpd.program.account.auction.fetch(lpd.auction[0]);
    expect(JSON.stringify(auction.creationTime)).to.equal(
      JSON.stringify(new BN(111))
    );*/
  });

  it("withdrawFees", async () => {
    //await lpd.withdrawFees(new BN(1), lpd.paymentCustody);
  });

  it("deleteAuction", async () => {
    //await lpd.deleteAuction();
  });
});