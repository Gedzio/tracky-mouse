# Jak zbudować Tracky Mouse - Instrukcja

## Wymagania
- Node.js (w wersji używanej przez projekt)
- npm
- Windows (dla buildu `.exe`)

## Pierwsze uruchomienie (nowy komputer)

Jeśli dopiero sklonowałeś repozytorium:

```powershell
# 1. Sklonuj repozytorium
git clone https://github.com/1j01/tracky-mouse.git
cd TrackyMouse

# 2. Zainstaluj wszystkie zależności (workspace setup)
npm install

# 3a. Uruchom w trybie deweloperskim (testowanie)
npm run desktop-app

# LUB

# 3b. Zbuduj instalator
.\build.ps1
```

**Uwaga:** Pierwsze `npm install` w głównym folderze instaluje zależności dla całego monorepo (workspace). 
Potem możesz używać `npm run desktop-app` do testowania lub `.\build.ps1` do budowania instalatora.

## Szybki start (projekt już skonfigurowany)

W folderze głównym projektu uruchom:

```powershell
.\build.ps1
```

Ten skrypt automatycznie:
1. Instaluje zależności
2. Naprawia problem z lokalnymi pakietami (symlinkami)
3. Buduje aplikację
4. Pokazuje lokalizację wygenerowanego instalatora

## Ręczne budowanie (krok po kroku)

### 1. Przygotowanie zależności

```powershell
cd desktop-app
npm install
```

### 2. Naprawa lokalnych zależności

**WAŻNE:** Electron Forge nie radzi sobie z symlinkowanymi zależnościami (`file:` w package.json). 
Przed każdym buildem trzeba zamienić je na prawdziwe kopie folderów:

```powershell
cd desktop-app
.\fix-deps.ps1
```

Lub ręcznie:
```powershell
# Usuń symlinki
Remove-Item -Recurse -Force node_modules\serenade-driver
Remove-Item -Recurse -Force node_modules\tracky-mouse

# Skopiuj prawdziwe foldery
Copy-Item -Recurse lib\serenade-driver node_modules\serenade-driver
Copy-Item -Recurse ..\core node_modules\tracky-mouse
```

### 3. Budowanie

```powershell
cd desktop-app
npm run make
```

Proces może potrwać 2-5 minut.

### 4. Lokalizacja wygenerowanych plików

Po udanym buildzie instalator znajdziesz w:
```
desktop-app\out\make\squirrel.windows\x64\Tracky Mouse Setup.exe
```

## Typowe problemy

### ❌ Build kończy się błędem przy `Packaging application`

**Przyczyna:** Symlinki w `node_modules` nie zostały zastąpione kopiami.

**Rozwiązanie:** Uruchom ponownie `fix-deps.ps1` przed buildem.

### ❌ `npm install` resetuje zależności

**Przyczyna:** `npm install` przywraca symlinki dla `file:` dependencies.

**Rozwiązanie:** Za każdym razem po `npm install` uruchom `fix-deps.ps1` przed buildem.

### ❌ Brakuje `serenade-driver.node`

**Przyczyna:** Prebuilt binary nie został skopiowany.

**Rozwiązanie:** Upewnij się że `desktop-app/lib/serenade-driver` zawiera plik `.node` i został poprawnie skopiowany do `node_modules`.

## Struktura projektu po buildzie

```
desktop-app/
├── out/
│   ├── make/
│   │   └── squirrel.windows/
│   │       └── x64/
│   │           ├── Tracky Mouse Setup.exe  ← INSTALATOR (uruchom to)
│   │           ├── RELEASES
│   │           └── tracky-mouse-*.nupkg
│   └── tracky-mouse-win32-x64/  (spakowana aplikacja)
```

## Workflow przy rozwoju

1. Wprowadź zmiany w kodzie (`core/`, `desktop-app/src/`, etc.)
2. **(Opcjonalnie)** Przetestuj lokalnie: `npm run desktop-app`
3. Zbuduj installer: `.\build.ps1`
4. Przetestuj installer: uruchom `Tracky Mouse Setup.exe` z folderu `out/make/...`

## Dodatkowe komendy

- **Uruchomienie w trybie dev:** `npm run desktop-app` (z głównego folderu)
- **Tylko pakowanie (bez instalatora):** `npm run package` (w `desktop-app/`)
- **Czyszczenie buildu:** Usuń folder `desktop-app/out/`
