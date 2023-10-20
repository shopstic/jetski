Add-WindowsCapability -Online -Name OpenSSH.Server
Get-Service sshd | Set-Service -StartupType Automatic

$authorizedKey = "YOUR_PUBLIC_KEY_HERE"
Set-Content `
  -Force -Path $env:ProgramData\ssh\administrators_authorized_keys `
  -Value "$authorizedKey"
  
icacls.exe ""$env:ProgramData\ssh\administrators_authorized_keys"" /inheritance:r /grant ""Administrators:F"" /grant ""SYSTEM:F""

Start-Service sshd
