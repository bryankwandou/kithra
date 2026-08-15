//! Runs the compiled program against an in-process SVM.
//!
//! These execute the same `.so` that gets deployed, so a pass here means the
//! bytecode behaves — not that a mock of it behaves.

use anchor_lang::{AnchorDeserialize, InstructionData, ToAccountMetas};
use kithra_ledger::state::Commitment;
use kithra_ledger::{accounts, instruction, LEDGER_SEED};
use litesvm::LiteSVM;
use solana_clock::Clock;
use solana_instruction::Instruction;
use solana_keypair::Keypair;
use solana_message::Message;
use solana_native_token::LAMPORTS_PER_SOL;
use solana_pubkey::Pubkey;
use solana_signer::Signer;
use solana_transaction::Transaction;

const PROGRAM_ID: Pubkey =
    solana_pubkey::pubkey!("FJZb6EiwuqEui7jkVGYWSS7xQLzqMaSjpHSBwRdBiyyY");

/// A fixed point in time (2024-01-01T00:00:00Z). LiteSVM boots with a zeroed
/// clock sysvar, which would make `updated_at` meaningless; a validator never
/// hands the program a zero, so the harness supplies a realistic one.
const TEST_UNIX_TIME: i64 = 1_704_067_200;

fn setup() -> (LiteSVM, Keypair) {
    let mut svm = LiteSVM::new();
    svm.add_program_from_file(PROGRAM_ID, "../../target/deploy/kithra_ledger.so")
        .expect("compiled program should exist — run `anchor build` first");

    svm.set_sysvar(&Clock {
        unix_timestamp: TEST_UNIX_TIME,
        ..Default::default()
    });

    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();
    (svm, owner)
}

fn pda(owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[LEDGER_SEED, owner.as_ref()], &PROGRAM_ID).0
}

fn send(
    svm: &mut LiteSVM,
    payer: &Keypair,
    ix: Instruction,
) -> Result<(), litesvm::types::FailedTransactionMetadata> {
    let msg = Message::new(&[ix], Some(&payer.pubkey()));
    let tx = Transaction::new(&[payer], msg, svm.latest_blockhash());
    svm.send_transaction(tx).map(|_| ())
}

fn commit_ix(owner: &Pubkey, root: [u8; 32], entry_count: u32) -> Instruction {
    Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts::Commit {
            owner: *owner,
            commitment: pda(owner),
            system_program: solana_pubkey::pubkey!("11111111111111111111111111111111"),
        }
        .to_account_metas(None),
        data: instruction::Commit { root, entry_count }.data(),
    }
}

fn read(svm: &LiteSVM, owner: &Pubkey) -> Commitment {
    let raw = svm.get_account(&pda(owner)).expect("account should exist").data;
    Commitment::deserialize(&mut &raw[8..]).expect("account should decode")
}

#[test]
fn first_commit_creates_the_record() {
    let (mut svm, owner) = setup();
    let root = [7u8; 32];

    send(&mut svm, &owner, commit_ix(&owner.pubkey(), root, 4)).unwrap();

    let c = read(&svm, &owner.pubkey());
    assert_eq!(c.owner, owner.pubkey());
    assert_eq!(c.root, root);
    assert_eq!(c.version, 1, "first commit is version 1");
    assert_eq!(c.entry_count, 4);
    assert_eq!(
        c.updated_at, TEST_UNIX_TIME,
        "the timestamp comes from the cluster clock, not the caller"
    );
}

#[test]
fn recommitting_bumps_version_and_replaces_root() {
    let (mut svm, owner) = setup();

    send(&mut svm, &owner, commit_ix(&owner.pubkey(), [1u8; 32], 2)).unwrap();
    send(&mut svm, &owner, commit_ix(&owner.pubkey(), [2u8; 32], 9)).unwrap();

    let c = read(&svm, &owner.pubkey());
    assert_eq!(c.version, 2, "the counter is what makes tampering visible");
    assert_eq!(c.root, [2u8; 32]);
    assert_eq!(c.entry_count, 9);
}

#[test]
fn an_all_zero_root_is_rejected() {
    let (mut svm, owner) = setup();
    // A zeroed root would be indistinguishable from an uninitialised account,
    // so publishing one must fail rather than silently look valid.
    assert!(send(&mut svm, &owner, commit_ix(&owner.pubkey(), [0u8; 32], 1)).is_err());
}

#[test]
fn ledgers_are_isolated_per_wallet() {
    let (mut svm, alice) = setup();
    let bob = Keypair::new();
    svm.airdrop(&bob.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    send(&mut svm, &alice, commit_ix(&alice.pubkey(), [0xAA; 32], 1)).unwrap();
    send(&mut svm, &bob, commit_ix(&bob.pubkey(), [0xBB; 32], 2)).unwrap();

    assert_eq!(read(&svm, &alice.pubkey()).root, [0xAA; 32]);
    assert_eq!(read(&svm, &bob.pubkey()).root, [0xBB; 32]);
}

#[test]
fn nobody_can_write_to_someone_elses_ledger() {
    let (mut svm, alice) = setup();
    let mallory = Keypair::new();
    svm.airdrop(&mallory.pubkey(), 10 * LAMPORTS_PER_SOL).unwrap();

    send(&mut svm, &alice, commit_ix(&alice.pubkey(), [0xAA; 32], 1)).unwrap();

    // Mallory signs, but aims the instruction at Alice's PDA. The seed
    // constraint is derived from the signer, so this cannot resolve.
    let forged = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts::Commit {
            owner: mallory.pubkey(),
            commitment: pda(&alice.pubkey()),
            system_program: solana_pubkey::pubkey!("11111111111111111111111111111111"),
        }
        .to_account_metas(None),
        data: instruction::Commit {
            root: [0xEE; 32],
            entry_count: 99,
        }
        .data(),
    };

    assert!(send(&mut svm, &mallory, forged).is_err());
    assert_eq!(
        read(&svm, &alice.pubkey()).root,
        [0xAA; 32],
        "Alice's record must be untouched"
    );
}

#[test]
fn revoke_removes_the_record_entirely() {
    let (mut svm, owner) = setup();
    send(&mut svm, &owner, commit_ix(&owner.pubkey(), [3u8; 32], 5)).unwrap();

    let revoke = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts::Revoke {
            owner: owner.pubkey(),
            commitment: pda(&owner.pubkey()),
        }
        .to_account_metas(None),
        data: instruction::Revoke {}.data(),
    };
    send(&mut svm, &owner, revoke).unwrap();

    // Deleting locally has to be able to delete the on-chain shadow too, or the
    // product's erasure promise would be false.
    let after = svm.get_account(&pda(&owner.pubkey()));
    assert!(
        after.is_none() || after.unwrap().lamports == 0,
        "record should be gone"
    );
}

#[test]
fn a_ledger_can_be_reanchored_after_revoking() {
    let (mut svm, owner) = setup();
    send(&mut svm, &owner, commit_ix(&owner.pubkey(), [3u8; 32], 5)).unwrap();

    let revoke = Instruction {
        program_id: PROGRAM_ID,
        accounts: accounts::Revoke {
            owner: owner.pubkey(),
            commitment: pda(&owner.pubkey()),
        }
        .to_account_metas(None),
        data: instruction::Revoke {}.data(),
    };
    send(&mut svm, &owner, revoke).unwrap();

    send(&mut svm, &owner, commit_ix(&owner.pubkey(), [4u8; 32], 6)).unwrap();
    let c = read(&svm, &owner.pubkey());
    assert_eq!(c.root, [4u8; 32]);
    assert_eq!(c.version, 1, "a fresh account restarts the count");
}
