/**
 * update-team-tiers.ts
 *
 * Calls set_team_target_tier for all 10 tiers to update the live on-chain
 * values to use 6-decimal token amounts (10^6) instead of the old 9-decimal
 * values (10^9) that were set at initialization time.
 *
 * PREREQUISITE: Run `anchor build` to regenerate the IDL after updating
 * lib.rs, then run this script. The current idl.json does not yet include
 * the setTeamTargetTier instruction.
 *
 * Usage:
 *   ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/update-team-tiers.ts
 *
 * Optional env vars:
 *   SOLANA_RPC_URL   — defaults to https://solana-mainnet.publicnode.com
 *   CLUSTER          — defaults to mainnet-beta (used only for explorer links)
 *   DRY_RUN=1        — print tier data without sending transactions
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Constants (mirrors DEFAULT_TEAM_MIN_STAKED / DEFAULT_TEAM_BONUS_BPS in lib.rs) ──

const DECIMALS = 1_000_000n; // 10^6

const TIERS: { minStaked: bigint; bonusBps: bigint }[] = [
  { minStaked:         50_000n * DECIMALS, bonusBps: 200n },  // Tier 0 —   50K  →  2%
  { minStaked:        150_000n * DECIMALS, bonusBps: 300n },  // Tier 1 —  150K  →  3%
  { minStaked:        500_000n * DECIMALS, bonusBps: 400n },  // Tier 2 —  500K  →  4%
  { minStaked:      1_000_000n * DECIMALS, bonusBps: 500n },  // Tier 3 —    1M  →  5%
  { minStaked:      5_000_000n * DECIMALS, bonusBps: 600n },  // Tier 4 —    5M  →  6%
  { minStaked:     10_000_000n * DECIMALS, bonusBps: 700n },  // Tier 5 —   10M  →  7%
  { minStaked:     50_000_000n * DECIMALS, bonusBps: 750n },  // Tier 6 —   50M  →  7.5%
  { minStaked:    100_000_000n * DECIMALS, bonusBps: 850n },  // Tier 7 —  100M  →  8.5%
  { minStaked:    500_000_000n * DECIMALS, bonusBps: 900n },  // Tier 8 —  500M  →  9%
  { minStaked: 1_000_000_000n * DECIMALS, bonusBps: 1000n }, // Tier 9 —    1B  → 10%
];

// ── Config ────────────────────────────────────────────────────────────────────

const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID ?? (() => { throw new Error('PROGRAM_ID env var is required'); })());
const CLUSTER    = (process.env.CLUSTER ?? 'mainnet-beta') as anchor.web3.Cluster;
const RPC_URL    = process.env.SOLANA_RPC_URL ?? 'https://solana-mainnet.publicnode.com';
const DRY_RUN    = process.env.DRY_RUN === '1';

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

const connection = new Connection(RPC_URL, 'confirmed');
const provider   = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
anchor.setProvider(provider);

const idlPath = path.join(__dirname, '..', 'target', 'idl', 'idl.json');
if (!fs.existsSync(idlPath)) {
  console.error('❌  IDL not found. Run `anchor build` first.');
  process.exit(1);
}
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf-8'));

// Verify the IDL includes setTeamTargetTier before proceeding
const hasInstruction = idl.instructions?.some(
  (ix: { name: string }) => ix.name === 'setTeamTargetTier'
);
if (!hasInstruction) {
  console.error(
    '❌  The loaded IDL does not contain the setTeamTargetTier instruction.\n' +
    '   Run `anchor build` to regenerate the IDL from the updated lib.rs, then retry.'
  );
  process.exit(1);
}

const program = new anchor.Program(idl, PROGRAM_ID, provider);

// ── Derive platform PDA ───────────────────────────────────────────────────────

const [platformPda] = PublicKey.findProgramAddressSync(
  [Buffer.from('platform')],
  PROGRAM_ID
);

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n📋  FBiT Staking — Update Team Target Tiers (6-decimal migration)');
  console.log('────────────────────────────────────────────────────────────────');
  console.log(`  Cluster      : ${CLUSTER}`);
  console.log(`  Authority    : ${wallet.publicKey.toBase58()}`);
  console.log(`  Program ID   : ${PROGRAM_ID.toBase58()}`);
  console.log(`  Platform PDA : ${platformPda.toBase58()}`);
  console.log(`  Decimals     : 6  (10^6 per whole token)`);
  if (DRY_RUN) console.log('\n  *** DRY RUN — no transactions will be sent ***');
  console.log('');

  // Verify platform account exists (skipped in dry-run)
  if (!DRY_RUN) {
    const platformInfo = await connection.getAccountInfo(platformPda);
    if (!platformInfo) {
      console.error('❌  Platform PDA not found on-chain. Has the program been initialized?');
      process.exit(1);
    }
  }

  // Print tier table
  console.log('  Idx  Min Team Staked (raw u64)      Bonus BPS');
  console.log('  ───  ────────────────────────────   ─────────');
  for (let i = 0; i < TIERS.length; i++) {
    const { minStaked, bonusBps } = TIERS[i];
    console.log(
      `   ${i}   ${minStaked.toString().padEnd(30)}  ${bonusBps} bps (${Number(bonusBps) / 100}%)`
    );
  }
  console.log('');

  if (DRY_RUN) {
    console.log('✅  Dry run complete — no transactions sent.');
    return;
  }

  // Send one transaction per tier
  for (let i = 0; i < TIERS.length; i++) {
    const { minStaked, bonusBps } = TIERS[i];
    process.stdout.write(`  Tier ${i}: sending…`);

    const tx = await (program.methods as any)
      .setTeamTargetTier(
        i,                                        // index: u8
        new anchor.BN(minStaked.toString()),      // min_team_staked: u64
        new anchor.BN(bonusBps.toString())        // bonus_bps: u64
      )
      .accounts({
        platform:  platformPda,
        authority: wallet.publicKey,
      })
      .rpc();

    console.log(` ✅  https://explorer.solana.com/tx/${tx}?cluster=${CLUSTER}`);
  }

  console.log('\n✅  All 10 tiers updated successfully.');
}

main().catch(err => {
  console.error('\n❌  Error:', err.message ?? err);
  process.exit(1);
});
