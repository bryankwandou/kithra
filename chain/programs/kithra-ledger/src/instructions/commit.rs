use anchor_lang::prelude::*;

use crate::constants::LEDGER_SEED;
use crate::error::KithraError;
use crate::state::{Commitment, LedgerCommitted};

#[derive(Accounts)]
pub struct Commit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Seeded by the owner's key, so only that wallet can ever write here.
    /// `init_if_needed` is safe for the same reason: the seed pins the account
    /// to one signer, and every field below is overwritten on each call, so a
    /// second "init" is indistinguishable from an ordinary update.
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Commitment::INIT_SPACE,
        seeds = [LEDGER_SEED, owner.key().as_ref()],
        bump,
    )]
    pub commitment: Account<'info, Commitment>,

    pub system_program: Program<'info, System>,
}

pub fn commit_handler(ctx: Context<Commit>, root: [u8; 32], entry_count: u32) -> Result<()> {
    require!(root != [0u8; 32], KithraError::EmptyRoot);

    let clock = Clock::get()?;
    let commitment = &mut ctx.accounts.commitment;

    commitment.owner = ctx.accounts.owner.key();
    commitment.root = root;
    commitment.version = commitment
        .version
        .checked_add(1)
        .ok_or(KithraError::VersionOverflow)?;
    commitment.entry_count = entry_count;
    commitment.updated_at = clock.unix_timestamp;
    commitment.bump = ctx.bumps.commitment;

    emit!(LedgerCommitted {
        owner: commitment.owner,
        root,
        version: commitment.version,
        entry_count,
        updated_at: commitment.updated_at,
    });

    Ok(())
}
