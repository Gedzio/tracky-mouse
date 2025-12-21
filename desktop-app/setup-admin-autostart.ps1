# TrackyMouse - Add Task Scheduler (Run as Admin at Login)
# Run this script AS ADMINISTRATOR

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================"
Write-Host "  TrackyMouse - Setup Admin Auto-Start"
Write-Host "========================================"
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
	Write-Host "ERROR: This script must be run AS ADMINISTRATOR!" -ForegroundColor Red
	Write-Host ""
	Write-Host "Right-click on PowerShell and select 'Run as administrator', then run this script again." -ForegroundColor Yellow
	Write-Host ""
	pause
	exit 1
}

# Find TrackyMouse executable
$possiblePaths = @(
	"$env:LOCALAPPDATA\tracky-mouse\TrackyMouse.exe",
	"$env:LOCALAPPDATA\tracky-mouse\Update.exe"
)

$trackyMousePath = $null
foreach ($path in $possiblePaths) {
	if (Test-Path $path) {
		if ($path -like "*Update.exe") {
			$appFolder = Split-Path $path
			$actualExe = Get-ChildItem -Path $appFolder -Filter "tracky-mouse.exe" -Recurse | Select-Object -First 1
			if ($actualExe) {
				$trackyMousePath = $path
				$exeName = $actualExe.Name
				break
			}
		}
		else {
			$trackyMousePath = $path
			break
		}
	}
}

if (-not $trackyMousePath) {
	Write-Host "ERROR: TrackyMouse not found!" -ForegroundColor Red
	Write-Host ""
	Write-Host "Please install TrackyMouse first, then run this script." -ForegroundColor Yellow
	Write-Host ""
	pause
	exit 1
}

Write-Host "Found TrackyMouse at: $trackyMousePath" -ForegroundColor Green

# Task properties
$taskName = "TrackyMouse-AdminAutoStart"
$description = "Launch TrackyMouse with administrator privileges at login"

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
	Write-Host ""
	Write-Host "WARNING: Task '$taskName' already exists!" -ForegroundColor Yellow
	$response = Read-Host "Do you want to recreate it? (Y/N)"
	if ($response -ne 'Y' -and $response -ne 'y') {
		Write-Host ""
		Write-Host "Cancelled." -ForegroundColor Gray
		Write-Host ""
		pause
		exit 0
	}
	Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
	Write-Host "Removed old task" -ForegroundColor Green
}

# Create the scheduled task
Write-Host ""
Write-Host "Creating scheduled task..." -ForegroundColor Yellow

# Action: What to run
if ($trackyMousePath -like "*Update.exe") {
	$action = New-ScheduledTaskAction -Execute $trackyMousePath -Argument "--processStart `"$exeName`""
}
else {
	$action = New-ScheduledTaskAction -Execute $trackyMousePath
}

# Trigger: When to run (at logon)
$trigger = New-ScheduledTaskTrigger -AtLogOn

# Principal: Run with highest privileges (admin)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest

# Settings
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# Register the task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description | Out-Null

Write-Host ""
Write-Host "========================================"
Write-Host "  SUCCESS!"
Write-Host "========================================"
Write-Host ""

Write-Host "TrackyMouse will now start automatically with admin privileges when you log in." -ForegroundColor White
Write-Host ""
Write-Host "To view the task:" -ForegroundColor Cyan
Write-Host "  1. Press Win+R"
Write-Host "  2. Type: taskschd.msc"
Write-Host "  3. Look for '$taskName' in Task Scheduler Library"
Write-Host ""
Write-Host "To remove auto-start, run: .\remove-admin-autostart.ps1" -ForegroundColor Yellow
Write-Host ""

pause
