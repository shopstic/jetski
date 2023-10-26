try {
  New-VMSwitch -name MultipassSwitch -NetAdapterName Ethernet -AllowManagementOS $true
}
catch {
  if ($_.Exception.Message -notmatch "already bound") {
    Write-Output $_
    exit 1
  }
}

Set-NetConnectionProfile -InterfaceAlias "vEthernet (MultipassSwitch)" -NetworkCategory Private