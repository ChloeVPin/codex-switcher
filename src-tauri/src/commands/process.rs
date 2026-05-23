
use std::process::Command;

#[cfg(windows)]
use anyhow::Context;

#[cfg(windows)]
use std::collections::HashSet;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct WindowsCodexProcess {
    name: String,
    process_id: u32,
    parent_process_id: u32,
    #[serde(default)]
    command_line: String,
    #[serde(default)]
    main_window_title: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct CodexProcessInfo {
    pub count: usize,
    pub background_count: usize,
    pub can_switch: bool,
    pub pids: Vec<u32>,
}

#[tauri::command]
pub async fn check_codex_processes() -> Result<CodexProcessInfo, String> {
    let (pids, bg_count) = find_codex_processes().map_err(|e| e.to_string())?;
    let count = pids.len();

    Ok(CodexProcessInfo {
        count,
        background_count: bg_count,
        can_switch: count == 0,
        pids,
    })
}

fn find_codex_processes() -> anyhow::Result<(Vec<u32>, usize)> {
    #[cfg(unix)]
    {
        let output = Command::new("ps").args(["-eo", "pid,command"]).output();
        if let Ok(output) = output {
            return Ok(parse_unix_codex_processes(
                &String::from_utf8_lossy(&output.stdout),
                std::process::id(),
            ));
        }

        return Ok((Vec::new(), 0));
    }

    #[cfg(windows)]
    {
        return find_windows_codex_processes();
    }

    #[allow(unreachable_code)]
    Ok((Vec::new(), 0))
}

#[cfg(unix)]
fn parse_unix_codex_processes(stdout: &str, current_pid: u32) -> (Vec<u32>, usize) {
    let mut pids = Vec::new();
    let mut bg_count = 0;

    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let Some((pid_str, command)) = line.split_once(char::is_whitespace) else {
            continue;
        };

        let command = command.trim();
        if !is_unix_codex_command(command) || is_switcher_process(command) {
            continue;
        }

        let Ok(pid) = pid_str.trim().parse::<u32>() else {
            continue;
        };

        if pid == current_pid || pids.contains(&pid) {
            continue;
        }

        if is_ide_plugin_process(command) {
            bg_count += 1;
        } else {
            pids.push(pid);
        }
    }

    (pids, bg_count)
}

#[cfg(unix)]
fn is_unix_codex_command(command: &str) -> bool {
    let executable = command.split_whitespace().next().unwrap_or("");
    let executable = executable.trim_matches('"').trim_matches('\'');

    executable == "codex"
        || executable.ends_with("/codex")
        || executable.ends_with("/codex-cli")
        || executable.ends_with("/codex.exe")
}

fn is_switcher_process(command: &str) -> bool {
    let command = command.to_ascii_lowercase();
    command.contains("codex-switcher") || command.contains("codex switcher")
}

#[cfg(windows)]
fn find_windows_codex_processes() -> anyhow::Result<(Vec<u32>, usize)> {
    const POWERSHELL_SCRIPT: &str = r#"
$windowTitles = @{}
Get-Process -Name Codex -ErrorAction SilentlyContinue | ForEach-Object {
  $windowTitles[[uint32]$_.Id] = $_.MainWindowTitle
}

Get-CimInstance Win32_Process |
  Where-Object { $_.Name -ieq 'Codex.exe' -or $_.Name -ieq 'codex.exe' } |
  ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      ProcessId = [uint32]$_.ProcessId
      ParentProcessId = [uint32]$_.ParentProcessId
      CommandLine = if ($_.CommandLine) { $_.CommandLine } else { '' }
      MainWindowTitle = if ($windowTitles.ContainsKey([uint32]$_.ProcessId)) {
        [string]$windowTitles[[uint32]$_.ProcessId]
      } else {
        ''
      }
    }
  } |
  ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args(["-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCRIPT])
        .output()
        .context("failed to query Windows process list")?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("PowerShell process query failed: {}", stderr.trim());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let processes = parse_windows_codex_processes(&stdout)?;

    let mut active_pids = Vec::new();
    let mut ignored_count = 0;

    for process in processes.iter().filter(|process| is_windows_codex_root_process(process)) {
        let command = process.command_line.to_ascii_lowercase();
        if is_ide_plugin_process(&command) {
            ignored_count += 1;
            continue;
        }

        let has_window = !process.main_window_title.trim().is_empty();
        let has_renderer = windows_has_descendant_matching(process.process_id, &processes, |child| {
            child.command_line.to_ascii_lowercase().contains("--type=renderer")
        });
        let has_app_server =
            windows_has_descendant_matching(process.process_id, &processes, |child| {
                let command = child.command_line.to_ascii_lowercase();
                command.contains("resources\\codex.exe") && command.contains("app-server")
            });

        if has_window || has_renderer || has_app_server {
            active_pids.push(process.process_id);
        } else {
            ignored_count += 1;
        }
    }

    active_pids.sort_unstable();
    active_pids.dedup();

    Ok((active_pids, ignored_count))
}

#[cfg(windows)]
fn parse_windows_codex_processes(stdout: &str) -> anyhow::Result<Vec<WindowsCodexProcess>> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let value: serde_json::Value =
        serde_json::from_str(trimmed).context("failed to parse Windows process JSON")?;

    match value {
        serde_json::Value::Array(values) => values
            .into_iter()
            .map(|value| {
                serde_json::from_value(value)
                    .context("failed to deserialize Windows Codex process entry")
            })
            .collect(),
        value => Ok(vec![serde_json::from_value(value)
            .context("failed to deserialize Windows Codex process entry")?]),
    }
}

#[cfg(windows)]
fn is_windows_codex_root_process(process: &WindowsCodexProcess) -> bool {
    let name = process.name.to_ascii_lowercase();
    let command = process.command_line.to_ascii_lowercase();

    name == "codex.exe"
        && !is_switcher_process(&command)
        && !command.contains("--type=")
        && !command.contains("resources\\codex.exe")
}

#[cfg(any(unix, windows))]
fn is_ide_plugin_process(command: &str) -> bool {
    let command = command.to_ascii_lowercase();
    command.contains(".antigravity")
        || command.contains("openai.chatgpt")
        || command.contains(".vscode")
        || command.contains("visual studio code")
}

#[cfg(windows)]
fn windows_has_descendant_matching<F>(
    root_pid: u32,
    processes: &[WindowsCodexProcess],
    mut predicate: F,
) -> bool
where
    F: FnMut(&WindowsCodexProcess) -> bool,
{
    let mut queue = vec![root_pid];
    let mut visited = HashSet::new();

    while let Some(parent_pid) = queue.pop() {
        for process in processes
            .iter()
            .filter(|process| process.parent_process_id == parent_pid)
        {
            if !visited.insert(process.process_id) {
                continue;
            }

            if predicate(process) {
                return true;
            }

            queue.push(process.process_id);
        }
    }

    false
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::{is_ide_plugin_process, is_unix_codex_command, parse_unix_codex_processes};

    #[cfg(unix)]
    #[test]
    fn parses_active_unix_codex_processes() {
        let ps = r#"  PID COMMAND
  10 /usr/bin/codex
  11 /home/user/.vscode/extensions/openai.chatgpt/bin/codex app-server
  12 /opt/Codex Switcher/codex-switcher
  13 /tmp/codex-cli --login
  14 /tmp/not-codex
"#;

        let (pids, background_count) = parse_unix_codex_processes(ps, 99);
        assert_eq!(pids, vec![10, 13]);
        assert_eq!(background_count, 1);
    }

    #[cfg(unix)]
    #[test]
    fn ignores_current_pid_and_duplicate_unix_processes() {
        let ps = r#"  PID COMMAND
  10 codex
  10 codex
  11 codex
"#;

        let (pids, background_count) = parse_unix_codex_processes(ps, 11);
        assert_eq!(pids, vec![10]);
        assert_eq!(background_count, 0);
    }

    #[cfg(unix)]
    #[test]
    fn recognizes_codex_executable_shapes() {
        assert!(is_unix_codex_command("codex"));
        assert!(is_unix_codex_command("/usr/local/bin/codex"));
        assert!(is_unix_codex_command("\"/opt/codex-cli\" app-server"));
        assert!(is_unix_codex_command("/mnt/c/Users/me/codex.exe"));
        assert!(!is_unix_codex_command("/usr/local/bin/codex-switcher"));
    }

    #[cfg(unix)]
    #[test]
    fn detects_ide_plugin_processes_case_insensitively() {
        assert!(is_ide_plugin_process("/Users/me/.VSCode/extensions/openai.chatgpt/codex"));
        assert!(is_ide_plugin_process("/Applications/Visual Studio Code.app/codex"));
        assert!(!is_ide_plugin_process("/usr/bin/codex"));
    }
}
