use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, OsRng, rand_core::RngCore},
};
use anyhow::{Result, anyhow};
use base64::{Engine, engine::general_purpose::STANDARD};
#[derive(Clone)]
pub struct Secrets {
    cipher: Aes256Gcm,
}
impl Secrets {
    pub fn new(raw: &str) -> Result<Self> {
        let bytes = STANDARD.decode(raw)?;
        Ok(Self {
            cipher: Aes256Gcm::new_from_slice(&bytes)
                .map_err(|_| anyhow!("ENCRYPTION_KEY must encode 32 bytes"))?,
        })
    }
    pub fn seal(&self, plain: &str) -> Result<String> {
        let mut nonce = [0u8; 12];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
            .map_err(|_| anyhow!("encryption failed"))?;
        Ok(STANDARD.encode([nonce.as_slice(), ciphertext.as_slice()].concat()))
    }
    pub fn open(&self, sealed: &str) -> Result<String> {
        let bytes = STANDARD.decode(sealed)?;
        if bytes.len() < 28 {
            return Err(anyhow!("invalid encrypted value"));
        }
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(&bytes[..12]), &bytes[12..])
            .map_err(|_| anyhow!("decryption failed"))?;
        Ok(String::from_utf8(plain)?)
    }
    pub fn generate() -> String {
        let mut key = [0u8; 32];
        OsRng.fill_bytes(&mut key);
        STANDARD.encode(key)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn authenticated_encryption() {
        let s = Secrets::new(&Secrets::generate()).unwrap();
        let v = s.seal("sensitive").unwrap();
        assert_ne!(v, "sensitive");
        assert_eq!(s.open(&v).unwrap(), "sensitive");
        assert!(
            Secrets::new(&Secrets::generate())
                .unwrap()
                .open(&v)
                .is_err()
        )
    }
}
