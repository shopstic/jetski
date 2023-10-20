# Disable taskbar widgets
reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced" /v "TaskbarDa" /t REG_DWORD /d 0 /f

Get-AppxPackage *WindowsAlarms* | Remove-AppxPackage
Get-AppxPackage *AV1VideoExtension* | Remove-AppxPackage
Get-AppxPackage *WindowsCalculator* | Remove-AppxPackage
Get-AppxPackage *Microsoft.549981C3F5F10* | Remove-AppxPackage
Get-AppxPackage *WindowsFeedbackHub* | Remove-AppxPackage
Get-AppxPackage *HEIFImageExtension* | Remove-AppxPackage
Get-AppxPackage *GetHelp* | Remove-AppxPackage
Get-AppxPackage *WindowsMaps* | Remove-AppxPackage
Get-AppxPackage *Todos* | Remove-AppxPackage
Get-AppxPackage *ZuneVideo* | Remove-AppxPackage
Get-AppxPackage *MicrosoftOfficeHub* | Remove-AppxPackage
Get-AppxPackage *Paint* | Remove-AppxPackage
Get-AppxPackage *ZuneMusic* | Remove-AppxPackage
Get-AppxPackage *BingNews* | Remove-AppxPackage
Get-AppxPackage *OneDrive* | Remove-AppxPackage
Get-AppxPackage *Windows.Photos* | Remove-AppxPackage
Get-AppxPackage *ScreenSketch* | Remove-AppxPackage
Get-AppxPackage *SkypeApp* | Remove-AppxPackage
Get-AppxPackage *MicrosoftSolitaireCollection* | Remove-AppxPackage
Get-AppxPackage *SpotifyAB.SpotifyMusic* | Remove-AppxPackage
Get-AppxPackage *MicrosoftStickyNotes* | Remove-AppxPackage
Get-AppxPackage *Teams* | Remove-AppxPackage
Get-AppxPackage *WindowsSoundRecorder* | Remove-AppxPackage
Get-AppxPackage *BingWeather* | Remove-AppxPackage
Get-AppxPackage *WebpImageExtension* | Remove-AppxPackage
Get-AppxPackage *YourPhone* | Remove-AppxPackage
Get-AppxPackage *Microsoft.GamingApp* | Remove-AppxPackage
Get-AppxPackage *Microsoft.OneConnect* | Remove-AppxPackage
Get-AppxPackage *Microsoft.Whiteboard* | Remove-AppxPackage
Get-AppxPackage *Microsoft.MinecraftEducationEdition* | Remove-AppxPackage
Get-AppxPackage *Microsoft.MixedReality.Portal* | Remove-AppxPackage
Get-AppxPackage *Clipchamp* | Remove-AppxPackage
Get-AppxPackage *windowscommunicationsapps* | Remove-AppxPackage

Start-Process -FilePath "$env:SystemRoot\SysWOW64\OneDriveSetup.exe" -ArgumentList "/uninstall" -Wait

# Enable Hyper-V Platform
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
