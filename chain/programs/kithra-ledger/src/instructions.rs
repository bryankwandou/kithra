pub mod commit;
pub mod revoke;

// Anchor's `#[program]` macro resolves the generated account structs from the
// crate root, so these have to be glob re-exports. Handlers are named per
// instruction to keep the two globs from colliding.
pub use commit::*;
pub use revoke::*;
