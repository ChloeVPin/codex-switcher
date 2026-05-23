use std::path::PathBuf;

use anyhow::{Context, Result};

pub fn codex_home_dir() -> Result<PathBuf> {
    if let Ok(codex_home) = std::env::var("CODEX_HOME") {
        if !codex_home.trim().is_empty() {
            return Ok(PathBuf::from(codex_home));
        }
    }

    let home = dirs::home_dir().context("Could not find home directory")?;
    Ok(home.join(".codex"))
}

pub fn switcher_config_dir() -> Result<PathBuf> {
    if let Ok(config_home) = std::env::var("CODEX_SWITCHER_HOME") {
        if !config_home.trim().is_empty() {
            return Ok(PathBuf::from(config_home));
        }
    }

    let home = dirs::home_dir().context("Could not find home directory")?;
    Ok(home.join(".codex-switcher"))
}

#[cfg(test)]
mod tests {
    use super::{codex_home_dir, switcher_config_dir};
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn codex_home_uses_override_when_set() {
        let _guard = env_lock().lock().unwrap();
        std::env::set_var("CODEX_HOME", "/tmp/custom-codex");
        let path = codex_home_dir().unwrap();
        std::env::remove_var("CODEX_HOME");

        assert_eq!(path, std::path::PathBuf::from("/tmp/custom-codex"));
    }

    #[test]
    fn switcher_config_uses_override_when_set() {
        let _guard = env_lock().lock().unwrap();
        std::env::set_var("CODEX_SWITCHER_HOME", "/tmp/custom-switcher");
        let path = switcher_config_dir().unwrap();
        std::env::remove_var("CODEX_SWITCHER_HOME");

        assert_eq!(path, std::path::PathBuf::from("/tmp/custom-switcher"));
    }
}
