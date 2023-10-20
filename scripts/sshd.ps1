Get-Service sshd | Set-Service -StartupType Automatic

$authorizedKey = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILmxihXDTbdPX7rVLKzZt6r/Qt9eZnrXCAWxCrmTOpZ6 nktpro@gmail.com"
Set-Content `
  -Force -Path $env:ProgramData\ssh\administrators_authorized_keys `
  -Value "$authorizedKey"
  
icacls.exe ""$env:ProgramData\ssh\administrators_authorized_keys"" /inheritance:r /grant ""Administrators:F"" /grant ""SYSTEM:F""

Start-Service sshd
