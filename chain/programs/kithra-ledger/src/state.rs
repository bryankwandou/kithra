use anchor_lang::prelude::*;

/// One record per wallet.
///
/// What is stored here is a SHA-256 commitment over the owner's memory ledger —
/// never the ledger itself. The chain can therefore prove that a given ledger is
/// yours and that it has not been altered since you last anchored it, while
/// learning nothing whatsoever about its contents. Anyone who wants the text
/// still has to get it from your device.
#[account]
#[derive(InitSpace)]
pub struct Commitment {
    /// Wallet that owns this ledger.
    pub owner: Pubkey,
    /// SHA-256 over the canonical serialisation of the ledger entries.
    pub root: [u8; 32],
    /// Increments on every commit, giving the ledger a tamper-evident history.
    pub version: u64,
    /// How many entries the ledger held at the moment it was anchored. Public
    /// on purpose: it lets a verifier detect silent truncation.
    pub entry_count: u32,
    /// Unix seconds of the most recent commit.
    pub updated_at: i64,
    pub bump: u8,
}

#[event]
pub struct LedgerCommitted {
    pub owner: Pubkey,
    pub root: [u8; 32],
    pub version: u64,
    pub entry_count: u32,
    pub updated_at: i64,
}

#[event]
pub struct LedgerRevoked {
    pub owner: Pubkey,
    pub final_version: u64,
}
