use anchor_lang::prelude::*;

use crate::constants::LEDGER_SEED;
use crate::state::{Commitment, LedgerRevoked};

/// Erasing the local ledger should be able to erase its on-chain shadow too.
/// Without this the product would be telling people they can delete everything
/// while leaving a permanent record behind, which would make the whole privacy
/// argument dishonest.
#[derive(Accounts)]
pub struct Revoke<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        has_one = owner,
        seeds = [LEDGER_SEED, owner.key().as_ref()],
        bump = commitment.bump,
    )]
    pub commitment: Account<'info, Commitment>,
}

pub fn revoke_handler(ctx: Context<Revoke>) -> Result<()> {
    emit!(LedgerRevoked {
        owner: ctx.accounts.owner.key(),
        final_version: ctx.accounts.commitment.version,
    });
    Ok(())
}
