# TrackyMouse - Remove Task Scheduler (Admin Auto-Start)
# Run this script AS ADMINISTRATOR to remove the scheduled task

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  TrackyMouse - Remove Admin Auto-Start" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
	Write-Host "❌ This script must be run AS ADMINISTRATOR!" -ForegroundColor Red
	Write-Host "`nRight-click on PowerShell and select 'Run as administrator', then run this script again.`n" -ForegroundColor Yellow
	pause
	exit 1
}

$taskName = "TrackyMouse-AdminAutoStart"

# Check if task exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $existingTask) {
	Write-Host "⚠️  Task '$taskName' not found." -ForegroundColor Yellow
	Write-Host "`nNothing to remove.`n" -ForegroundColor Gray
	pause
	exit 0
}

Write-Host "Found task: $taskName" -ForegroundColor White
$response = Read-Host "`nAre you sure you want to remove it? (Y/N)"

if ($response -eq 'Y' -or $response -eq 'y') {
	Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
	Write-Host "`n✅ Task removed successfully!`n" -ForegroundColor Green
	Write-Host "TrackyMouse will no longer start automatically with admin privileges.`n" -ForegroundColor White
}
else {
	Write-Host "`nCancelled.`n" -ForegroundColor Gray
}

pause
