# Tracky Mouse - Quick Reference

## Szybkie komendy

### Budowanie instalatora
```powershell
.\build.ps1
```

### Uruchomienie w trybie deweloperskim
```powershell
npm run desktop-app
```

### Budowanie bez instalowania zależności
```powershell
.\build.ps1 -SkipInstall
```

### Budowanie z czyszczeniem poprzedniego buildu
```powershell
.\build.ps1 -Clean
```

## Pliki i foldery

- **`build.ps1`** - główny skrypt budowania
- **`BUILD.md`** - pełna dokumentacja procesu budowania
- **`desktop-app/fix-deps.ps1`** - naprawa lokalnych zależności (używany wewnętrznie przez build.ps1)
- **`desktop-app/out/make/`** - wygenerowane instalatory
- **`control_tracky.py`** - kontrola aplikacji z poziomu Talon/Python (Named Pipe)

## Lokalizacja instalatora po buildzie

```
desktop-app\out\make\squirrel.windows\x64\Tracky Mouse Setup.exe
```

## Wsparcie

Pełna dokumentacja: `BUILD.md`
