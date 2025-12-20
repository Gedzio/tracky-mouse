#!/usr/bin/env pwsh
# Automatyczny skrypt budowania Tracky Mouse
# Używa: .\build.ps1

param(
    [switch]$SkipInstall,  # Pomiń npm install
    [switch]$Clean         # Wyczyść folder out/ przed buildem
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Tracky Mouse - Build Script" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Sprawdź czy jesteśmy w głównym folderze projektu
if (-not (Test-Path "desktop-app")) {
    Write-Host "❌ Błąd: Uruchom skrypt z głównego folderu projektu!" -ForegroundColor Red
    exit 1
}

# Przejdź do desktop-app
Set-Location desktop-app

try {
    # Krok 1: Instalacja zależności
    if (-not $SkipInstall) {
        Write-Host "📦 Instaluję zależności..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "❌ npm install zakończył się błędem!" -ForegroundColor Red
            exit 1
        }
        Write-Host "✅ Zależności zainstalowane`n" -ForegroundColor Green
    } else {
        Write-Host "⏭️  Pomijam instalację zależności (użyto -SkipInstall)`n" -ForegroundColor Gray
    }

    # Krok 2: Czyszczenie (opcjonalnie)
    if ($Clean -and (Test-Path "out")) {
        Write-Host "🧹 Czyszczę folder out/..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force out
        Write-Host "✅ Folder out/ wyczyszczony`n" -ForegroundColor Green
    }

    # Krok 3: Naprawa lokalnych zależności (zmiana symlinków na kopie)
    Write-Host "🔧 Naprawiam lokalne zależności..." -ForegroundColor Yellow
    
    if (Test-Path "node_modules\serenade-driver") {
        Remove-Item -Recurse -Force "node_modules\serenade-driver"
    }
    if (Test-Path "node_modules\tracky-mouse") {
        Remove-Item -Recurse -Force "node_modules\tracky-mouse"
    }

    Write-Host "   Kopiuję serenade-driver..." -ForegroundColor Gray
    Copy-Item -Recurse "lib\serenade-driver" "node_modules\serenade-driver"
    
    Write-Host "   Kopiuję tracky-mouse..." -ForegroundColor Gray
    Copy-Item -Recurse "..\core" "node_modules\tracky-mouse"
    
    Write-Host "✅ Zależności naprawione`n" -ForegroundColor Green

    # Krok 4: Budowanie
    Write-Host "🔨 Buduję aplikację..." -ForegroundColor Yellow
    Write-Host "   (To może potrwać 2-5 minut)`n" -ForegroundColor Gray
    
    npm run make
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n❌ Build zakończył się błędem!" -ForegroundColor Red
        exit 1
    }

    # Sukces!
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  ✅ BUILD ZAKOŃCZONY SUKCESEM!" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Green

    # Pokaż lokalizację plików
    $setupExe = Get-ChildItem -Recurse "out\make" -Filter "*.exe" | Select-Object -First 1
    
    if ($setupExe) {
        Write-Host "📦 Instalator znajduje się tutaj:" -ForegroundColor Cyan
        Write-Host "   $($setupExe.FullName)`n" -ForegroundColor White
        
        $fileSize = [math]::Round($setupExe.Length / 1MB, 2)
        Write-Host "   Rozmiar: $fileSize MB" -ForegroundColor Gray
    } else {
        Write-Host "⚠️  Nie znaleziono pliku .exe w out/make/" -ForegroundColor Yellow
        Write-Host "   Sprawdź folder: $(Resolve-Path 'out\make')" -ForegroundColor Gray
    }

} catch {
    Write-Host "`n❌ Wystąpił błąd podczas budowania:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
} finally {
    # Wróć do głównego folderu
    Set-Location ..
}

Write-Host "`n✨ Gotowe! Możesz uruchomić instalator.`n" -ForegroundColor Green
