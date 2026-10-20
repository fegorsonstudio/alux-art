# One-time setup of the Alux Unreal studio machine (Windows Server 2022 with an
# NVIDIA GPU). Run in PowerShell as Administrator:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\vm-bootstrap.ps1 -PublicKey "ssh-ed25519 AAAA... laptop"
# Installs Git, Node.js LTS, the Epic Games Launcher and OpenSSH Server, lets the
# laptop's SSH key in (for the tunnel to Epic's MCP server), and makes the
# studio folders. Safe to run again. Unreal itself is installed from the Epic
# Games Launcher by the owner, who signs in there.
param([Parameter(Mandatory = $true)][string]$PublicKey)
$ErrorActionPreference = "Stop"

function Have($id) { (winget list --id $id -e 2>$null | Select-String $id) -ne $null }
foreach ($id in @("Git.Git", "OpenJS.NodeJS.LTS", "EpicGames.EpicGamesLauncher", "7zip.7zip")) {
  if (Have $id) { Write-Host "already installed: $id" }
  else { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements }
}

# OpenSSH Server: the tunnel's other end. Keys only, no passwords.
if (-not (Get-WindowsCapability -Online -Name "OpenSSH.Server*" | Where-Object State -eq Installed)) {
  Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
}
Set-Service -Name sshd -StartupType Automatic
Start-Service sshd
$keys = "C:\ProgramData\ssh\administrators_authorized_keys"
if (-not (Test-Path $keys) -or -not (Select-String -Path $keys -SimpleMatch $PublicKey -Quiet)) {
  Add-Content -Path $keys -Value $PublicKey -Encoding ascii
}
icacls $keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null
$cfg = "C:\ProgramData\ssh\sshd_config"
(Get-Content $cfg) -replace "^#?PasswordAuthentication .*", "PasswordAuthentication no" | Set-Content $cfg -Encoding ascii
Restart-Service sshd
if (-not (Get-NetFirewallRule -Name "sshd" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name sshd -DisplayName "OpenSSH Server" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
}

# The studio's folders.
foreach ($d in @("C:\AluxStudio", "C:\AluxStudio\renders", "C:\AluxStudio\shotlists")) { New-Item -ItemType Directory -Force -Path $d | Out-Null }

# The GPU the engine will use.
try { nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv } catch { Write-Warning "nvidia-smi not found: install the provider's NVIDIA driver before Unreal." }

Write-Host ""
Write-Host "Done. Next: sign in to the Epic Games Launcher, install Unreal Engine 5.8, then follow tools/unreal/README.md from step 4."
