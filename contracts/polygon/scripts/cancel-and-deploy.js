/**
 * cancel-and-deploy.js
 * Replaces stuck pending transactions (nonces 7-9) with cheap self-transfers,
 * then deploys FBiTStaking at the next clean nonce.
 */
const { ethers } = require("hardhat");

const REPLACE_GAS_PRICE = ethers.parseUnits("250", "gwei"); // above current base fee ~89 gwei
const CANCEL_GAS_LIMIT   = 21_000n;
const DEPLOY_GAS_LIMIT   = 5_500_000n;
const DEPLOY_GAS_PRICE   = ethers.parseUnits("200", "gwei");

const FBIT_TOKEN     = process.env.STAKE_TOKEN_ADDRESS || "0x9003e7d3fbec68ba1f2a253e7f1be9f631f46c55";
const ANNUAL_EMISSION = ethers.parseUnits("1000000", 6);

async function main() {
  const [signer] = await ethers.getSigners();
  const provider  = signer.provider;
  const me        = await signer.getAddress();

  const confirmedNonce = await provider.getTransactionCount(me, "latest");
  const pendingNonce   = await provider.getTransactionCount(me, "pending");

  console.log(`Address        : ${me}`);
  console.log(`Confirmed nonce: ${confirmedNonce}`);
  console.log(`Pending nonce  : ${pendingNonce}`);
  console.log(`Stuck nonces   : ${confirmedNonce} – ${pendingNonce - 1}`);

  if (confirmedNonce >= pendingNonce) {
    console.log("No stuck transactions — proceeding straight to deploy.");
  } else {
    console.log("\nCancelling stuck transactions with cheap self-transfers...");
    for (let nonce = confirmedNonce; nonce < pendingNonce; nonce++) {
      console.log(`  Cancelling nonce ${nonce} ...`);
      const tx = await signer.sendTransaction({
        to:       me,
        value:    0n,
        nonce:    nonce,
        gasLimit: CANCEL_GAS_LIMIT,
        gasPrice: REPLACE_GAS_PRICE,
      });
      console.log(`    tx hash: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`    confirmed in block ${receipt.blockNumber}`);
    }
    console.log("All stuck transactions cancelled.\n");
  }

  // Nonce is now pendingNonce (or confirmedNonce if no stuck txns)
  const deployNonce = await provider.getTransactionCount(me, "pending");
  console.log(`Deploying FBiTStaking at nonce ${deployNonce}...`);

  const Factory  = await ethers.getContractFactory("FBiTStaking");
  const contract = await Factory.deploy(FBIT_TOKEN, FBIT_TOKEN, 0, 0, ANNUAL_EMISSION, {
    nonce:    deployNonce,
    gasLimit: DEPLOY_GAS_LIMIT,
    gasPrice: DEPLOY_GAS_PRICE,
  });

  console.log(`Deploy tx sent: ${contract.deploymentTransaction().hash}`);
  console.log("Waiting for confirmation...");
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n✓ FBiTStaking deployed at:", address);
  console.log("Update .env.local: NEXT_PUBLIC_POLYGON_CONTRACT_ADDRESS=" + address);
}

main().catch((err) => { console.error(err); process.exit(1); });
