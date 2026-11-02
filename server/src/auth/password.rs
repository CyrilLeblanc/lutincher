//! Argon2id password hashing (salted, PHC string format stored as TEXT).
//!
//! `Argon2::verify_password` recomputes the full hash with the stored
//! parameters and compares tags in constant time, so a wrong password costs
//! the same as a correct one.

use argon2::password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;

/// Hashes a password with Argon2id and a fresh random salt.
pub fn hash(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let encoded = Argon2::default().hash_password(password.as_bytes(), &salt)?;
    Ok(encoded.to_string())
}

/// Checks a password against a stored PHC hash; `false` means "no match".
pub fn verify(password: &str, phc_hash: &str) -> Result<bool, argon2::password_hash::Error> {
    let parsed = PasswordHash::new(phc_hash)?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}
