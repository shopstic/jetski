Set-StrictMode -Version 2
$ErrorActionPreference = 'Stop'

try {
  New-VMSwitch -name MultipassSwitch -NetAdapterName Ethernet -AllowManagementOS $true
}
catch {
  if ($_.Exception.Message -notmatch "already bound") {
    Write-Output $_
    exit 1
  }
}

$hostname = $env:COMPUTERNAME.ToLower()
$multipassdPort = 51000
$env:MULTIPASS_SERVER_ADDRESS = "$($hostname):$($multipassdPort)"
Write-Output "Set MULTIPASS_SERVER_ADDRESS=$($env:MULTIPASS_SERVER_ADDRESS)"

$binPathValue = "C:\Program Files\Multipass\bin\multipassd.exe /svc --verbosity debug --logger stderr --address $($env:MULTIPASS_SERVER_ADDRESS)"
Write-Output "Reconfiguring multipassd to binPath=$binPathValue"
& 'C:\Windows\System32\sc.exe' config "Multipass" binPath= $binPathValue start= delayed-auto

Write-Output "Restarting multipassd"
Restart-Service -Name "Multipass"

function Wait-ForCommand {
  param (
    [ScriptBlock]$commandScriptBlock,
    [int]$timeoutSeconds = 2,
    [int]$maxAttempts = 10
  )

  $attempts = 0

  while ($true) {
    $job = Start-Job -ScriptBlock $commandScriptBlock
    Wait-Job $job -Timeout $timeoutSeconds > $null 2>&1
    $result = Receive-Job $job
    Remove-Job -Force $job

    if ($null -eq $result) {
      Write-Output "Command timed out after $timeoutSeconds seconds"
    }
    else {
      if ([string]$result -eq "0") {
        return
      }
    }

    if ($attempts -gt $maxAttempts) {
      throw "Command failed to execute properly"
    }
    else {
      Write-Host "Still waiting for command to complete..."
      Start-Sleep -s 1
      $attempts += 1
    }
  }
}

function Wait-ForMultipassd {
  param (
    [int]$timeoutSeconds = 2,
    [int]$maxAttempts = 10
  )
  Write-Output "Waiting for multipassd to start"
  $scriptBlock = {
    $version = (multipass.exe version)
    if ($LASTEXITCODE -eq 0 -and $version -notmatch "multipassd") {
      return 0
    }
    return 1
  }
  Wait-ForCommand -commandScriptBlock $scriptBlock -timeoutSeconds $timeoutSeconds -maxAttempts $maxAttempts
}

Wait-ForMultipassd

# Write-Output "Setting local.passphrase"
# multipass.exe set local.passphrase=foo
# if ($LASTEXITCODE -ne 0) {
#   Write-Output "Failed to set local.passphrase"
#   exit $LASTEXITCODE
# }

# Wait-ForMultipassd
# Write-Output "Setting local.bridged-network"
# multipass.exe set local.bridged-network=MultipassSwitch
# if ($LASTEXITCODE -ne 0) {
#   Write-Output "Failed to set local.bridged-network"
#   exit $LASTEXITCODE
# }

# # # Wait-ForMultipassd
# Write-Output "Getting ethernet IP"
# try {
#   $ethIp = (Get-NetIPAddress -InterfaceAlias "vEthernet (MultipassSwitch)" -AddressFamily IPv4).IPAddress
# }
# catch {
#   Write-Output "Failed to get ethernet IP"
#   Write-Output $_
#   exit 1
# }

# Write-Output "Found ethernet IP: $ethIp"

# Write-Output "Going to add portproxy rule for $($ethIp):$($multipassdPort)"
# netsh interface portproxy add v4tov4 listenport=$multipassdPort listenaddress=$ethIp connectport=$multipassdPort connectaddress=127.0.0.1
# if ($LASTEXITCODE -ne 0) {
#   exit $LASTEXITCODE
# }

# Write-Output "Going to add firewall rule for $($ethIp):$($multipassdPort)"
# New-NetFirewallRule -DisplayName "multipassd_51000" -Direction Inbound -Protocol TCP -LocalPort $multipassdPort -Action Allow -PolicyStore PersistentStore
# if ($LASTEXITCODE -ne 0) {
#   exit $LASTEXITCODE
# }