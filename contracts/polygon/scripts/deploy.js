const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "MATIC");

  const FBIT_TOKEN = process.env.STAKE_TOKEN_ADDRESS || "0x9003e7d3fbec68ba1f2a253e7f1be9f631f46c55";
  const ANNUAL_EMISSION = ethers.parseUnits("1000000", 6);

  console.log("Deploying FBiTStaking...");
  console.log("Getting contract factory...");
  const Factory = await ethers.getContractFactory("FBiTStaking");
  console.log("Sending deploy transaction...");
  const contract = await Factory.deploy(FBIT_TOKEN, FBIT_TOKEN, 0, 0, ANNUAL_EMISSION, {
    gasLimit: 6_000_000,
    gasPrice: ethers.parseUnits("150", "gwei"),
  });
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("FBiTStaking deployed at:", address);
  console.log("Tx hash:", contract.deploymentTransaction().hash);
  console.log("Add to .env.local: NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => { console.error(err); process.exit(1); });
