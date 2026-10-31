//! WikiGems program foundation. No state or transfers are implemented.
#![allow(unexpected_cfgs)]

use solana_program::{
    account_info::AccountInfo, entrypoint::ProgramResult, program_error::ProgramError,
    pubkey::Pubkey,
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo],
    _instruction_data: &[u8],
) -> ProgramResult {
    // Fail closed until the instruction format and authorization rules are designed.
    Err(ProgramError::InvalidInstructionData)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_every_instruction_without_mutating_accounts() {
        for data in [vec![], vec![0], vec![1, 2, 3], vec![255; 64]] {
            assert_eq!(
                process_instruction(&Pubkey::default(), &[], &data),
                Err(ProgramError::InvalidInstructionData)
            );
        }
    }
}
