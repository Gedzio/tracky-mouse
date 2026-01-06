Write-Host "Usuwam stare syml inki..."
if (Test-Path "node_modules\serenade-driver") {
    Remove-Item -Recurse -Force "node_modules\serenade-driver"
}
if (Test-Path "node_modules\tracky-mouse") {
    Remove-Item -Recurse -Force "node_modules\tracky-mouse"
}

Write-Host "Kopiuję serenade-driver..."
Copy-Item -Recurse "lib\serenade-driver" "node_modules\serenade-driver"

Write-Host "Kopiuję tracky-mouse..."
Copy-Item -Recurse "..\core" "node_modules\tracky-mouse"

Write-Host "Gotowe! Można budować."
