use anchor_lang::prelude::*;

#[error_code]
pub enum KithraError {
    #[msg("Commitment root cannot be all zeroes")]
    EmptyRoot,
    #[msg("Version counter overflowed")]
    VersionOverflow,
}
