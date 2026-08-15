pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY");

/// Kithra's on-chain half.
///
/// The memory a person builds up with an assistant is worth more than any one
/// vendor's account, and today it is trapped inside whichever product created
/// it. This program is the smallest thing that makes such a ledger portable:
/// it records a hash of it, under the owner's own key, on a chain no vendor
/// controls. Content stays on the device; only the proof lives here.
#[program]
pub mod kithra_ledger {
    use super::*;

    /// Publish (or update) the commitment for the signer's ledger.
    pub fn commit(ctx: Context<Commit>, root: [u8; 32], entry_count: u32) -> Result<()> {
        commit::commit_handler(ctx, root, entry_count)
    }

    /// Delete the commitment and return the rent to the owner.
    pub fn revoke(ctx: Context<Revoke>) -> Result<()> {
        revoke::revoke_handler(ctx)
    }
}
