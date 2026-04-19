const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  const STAKE_TOKEN  = process.env.STAKE_TOKEN_ADDRESS;
  const REWARD_TOKEN = process.env.REWARD_TOKEN_ADDRESS;

  if (!STAKE_TOKEN || !REWARD_TOKEN) {
    console.error("Please set STAKE_TOKEN_ADDRESS and REWARD_TOKEN_ADDRESS in .env");
    process.exit(1);
  }

  const REWARD_RATE          = 1000;  // 10% base referral reward rate
  const REFERRAL_REWARD_RATE = 500;   // 5% base referral reward rate

  // PoS annual emission: 800,000,000 FBiT over 800 years = 1,000,000 FBiT/year
  // APY range: 60% (floor) – 500% (ceiling), auto-adjusting with totalStaked
  // With 6 decimals: 1,000,000 * 10^6
  const ANNUAL_EMISSION = ethers.parseUnits("1000000", 6);

  const FBiTStaking = await ethers.getContractFactory("FBiTStaking");
  const staking = await FBiTStaking.deploy(
    STAKE_TOKEN,
    REWARD_TOKEN,
    REWARD_RATE,
    REFERRAL_REWARD_RATE,
    ANNUAL_EMISSION
  );

  await staking.waitForDeployment();
  const address = await staking.getAddress();

  console.log("FBiTStaking deployed to:", address);
  console.log("Annual emission set to:  1,000,000 FBiT/year (800M over 800 years)");
  console.log("APY range:                60% – 500% (PoS, auto-adjusting)");
  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network polygon_mainnet ${address} ${STAKE_TOKEN} ${REWARD_TOKEN} ${REWARD_RATE} ${REFERRAL_REWARD_RATE} ${ANNUAL_EMISSION}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
