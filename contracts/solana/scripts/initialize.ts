/**
 * initialize.ts
 *
 * Run ONCE after every fresh deployment to create the platform PDA.
 * Every other instruction (stake, claim, etc.) will fail with
 * AccountNotInitialized until this has been executed.
 *
 * Usage:
 *   npx ts-node scripts/initialize.ts
 *
 * Requires:
 *   - ANCHOR_WALLET env var  (path to your keypair JSON, e.g. ~/.config/solana/id.json)
 *   - STAKE_TOKEN_MINT env var
 *   - REWARD_TOKEN_MINT env var
 *   - Optional: REWARD_RATE, REFERRAL_REWARD_RATE (defaults: 1000, 500)
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Config ───────────────────────────────────────────────────────────────────

const PROGRAM_ID   = new PublicKey(process.env.PROGRAM_ID ?? (() => { throw new Error('PROGRAM_ID env var is required'); })());
const CLUSTER      = (process.env.CLUSTER ?? 'mainnet-beta') as anchor.web3.Cluster;
const REWARD_RATE         = BigInt(process.env.REWARD_RATE          ?? '1000'); // 10%
const REFERRAL_REWARD_RATE = BigInt(process.env.REFERRAL_REWARD_RATE ?? '500');  // 5%

const STAKE_MINT_ADDR  = process.env.STAKE_TOKEN_MINT;
const REWARD_MINT_ADDR = process.env.REWARD_TOKEN_MINT;

if (!STAKE_MINT_ADDR || !REWARD_MINT_ADDR) {
  console.error('❌  Set STAKE_TOKEN_MINT and REWARD_TOKEN_MINT env vars before running.');
  process.exit(1);
}

// ── Load wallet ───────────────────────────────────────────────────────────────

const walletPath = process.env.ANCHOR_WALLET
  ?? path.join(os.homedir(), '.config', 'solana', 'id.json');

if (!fs.existsSync(walletPath)) {
  console.error(`❌  Wallet not found at ${walletPath}`);
  process.exit(1);
}

const keypair = anchor.web3.Keypair.fromSecretKey(
  Buffer.from(JSON.parse(fs.readFileSync(walletPath, 'utf-8')))
);
const wallet = new anchor.Wallet(keypair);

// ── Setup provider + program ──────────────────────────────────────────────────

const RPC_URL    = process.env.SOLANA_RPC_URL ?? 'https://solana-mainnet.publicnode.com';
const connection = new Connection(RPC_URL, 'confirmed');
const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
anchor.setProvider(provider);

const idl = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'target', 'idl', 'idl.json'),
    'utf-8'
  )
);
const program = new anchor.Program(idl, PROGRAM_ID, provider);

// ── Derive PDAs ───────────────────────────────────────────────────────────────

const [platformPda, platformBump] = PublicKey.findProgramAddressSync(
  [Buffer.from('platform')],
  PROGRAM_ID
);

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const stakeMint  = new PublicKey(STAKE_MINT_ADDR!);
  const rewardMint = new PublicKey(REWARD_MINT_ADDR!);

  console.log('\n📋  FBiT Staking — Platform Initialization');
  console.log('─────────────────────────────────────────');
  console.log(`  Cluster      : ${CLUSTER}`);
  console.log(`  Authority    : ${wallet.publicKey.toBase58()}`);
  console.log(`  Program ID   : ${PROGRAM_ID.toBase58()}`);
  console.log(`  Platform PDA : ${platformPda.toBase58()} (bump ${platformBump})`);
  console.log(`  Stake Mint   : ${stakeMint.toBase58()}`);
  console.log(`  Reward Mint  : ${rewardMint.toBase58()}`);
  console.log(`  Reward Rate  : ${REWARD_RATE} bps`);
  console.log(`  Referral Rate: ${REFERRAL_REWARD_RATE} bps`);

  // Check if already initialized
  const existing = await connection.getAccountInfo(platformPda);
  if (existing) {
    console.log('\n⚠️   Platform PDA already exists — already initialized.');
    console.log('     Delete and redeploy if you want a fresh state.');
    return;
  }

  // Create stake vault ATA (authority = platform PDA)
  console.log('\n⏳  Creating stake vault token account…');
  const stakeVault = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair,          // payer
    stakeMint,
    platformPda,      // owner = platform PDA
    true              // allowOwnerOffCurve = true (PDA is off-curve)
  );
  console.log(`  Stake Vault  : ${stakeVault.address.toBase58()}`);

  // Create reward vault ATA (authority = platform PDA)
  console.log('⏳  Creating reward vault token account…');
  const rewardVault = await getOrCreateAssociatedTokenAccount(
    connection,
    keypair,
    rewardMint,
    platformPda,
    true
  );
  console.log(`  Reward Vault : ${rewardVault.address.toBase58()}`);

  // Call initialize
  console.log('\n⏳  Calling initialize…');
  const tx = await (program.methods as any)
    .initialize(
      new anchor.BN(REWARD_RATE.toString()),
      new anchor.BN(REFERRAL_REWARD_RATE.toString())
    )
    .accounts({
      platform:        platformPda,
      authority:       wallet.publicKey,
      rewardTokenMint: rewardMint,
      stakeTokenMint:  stakeMint,
      systemProgram:   anchor.web3.SystemProgram.programId,
      tokenProgram:    anchor.utils.token.TOKEN_PROGRAM_ID,
      rent:            anchor.web3.SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  console.log(`\n✅  Platform initialized!`);
  console.log(`   TX : https://explorer.solana.com/tx/${tx}?cluster=${CLUSTER}`);
  console.log('\n── Copy these into your .env.local ──────────────────────────');
  console.log(`NEXT_PUBLIC_SOLANA_PROGRAM_ID=${PROGRAM_ID.toBase58()}`);
  console.log(`NEXT_PUBLIC_SOLANA_STAKE_TOKEN_MINT=${stakeMint.toBase58()}`);
  console.log(`NEXT_PUBLIC_SOLANA_REWARD_TOKEN_MINT=${rewardMint.toBase58()}`);
  console.log(`NEXT_PUBLIC_SOLANA_STAKE_VAULT=${stakeVault.address.toBase58()}`);
  console.log(`NEXT_PUBLIC_SOLANA_REWARD_VAULT=${rewardVault.address.toBase58()}`);
  console.log('─────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌  Error:', err.message ?? err);
  process.exit(1);
});
