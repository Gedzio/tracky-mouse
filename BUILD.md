# Jak zbudować Tracky Mouse - Instrukcja

## Wymagania
- Node.js (projekt budowany na node 22.x)
- npm
- Windows (dla buildu `.exe` / instalatora Squirrel)

## Pierwsze uruchomienie (nowy komputer)

Jeśli dopiero sklonowałeś repozytorium:

```powershell
# 1. Sklonuj repozytorium
git clone https://github.com/1j01/tracky-mouse.git
cd TrackyMouse

# 2. Zainstaluj zależności
npm install

# 3a. Uruchom w trybie deweloperskim (testowanie)
npm start

# LUB

# 3b. Zbuduj instalator
npm run make
```

## Struktura projektu

Cały kod aplikacji desktopowej żyje w jednym pakiecie w głównym folderze repo:

- `src/electron-main/` — proces główny Electrona (wejście: `src/electron-main/electron-main.js`)
- `src/core/` — rdzeń Tracky Mouse (tracking, UI, posture monitor)
- `images/` — zasoby (ikony, SVG)

Build jest obsługiwany przez **Electron Forge** (konfiguracja w `forge.config.js`).

## Budowanie instalatora

W głównym folderze projektu:

```powershell
npm run make
```

Proces może potrwać 2-5 minut. To `electron-forge make` — pakuje aplikację i tworzy
instalator Squirrel dla Windows.

### Lokalizacja wygenerowanych plików

Po udanym buildzie:

```
out\make\squirrel.windows\x64\Tracky Mouse-<wersja> Setup.exe   ← INSTALATOR (uruchom to)
out\Tracky Mouse-win32-x64\                                     ← spakowana aplikacja
```

Numer `<wersja>` pochodzi z pola `version` w `package.json`.

## Dostępne komendy npm

Z `package.json`:

- `npm start` — uruchomienie w trybie dev (`electron-forge start`)
- `npm run package` — tylko spakowanie aplikacji, bez instalatora (`electron-forge package`)
- `npm run make` — pełny build instalatora (`electron-forge make`)
- `npm run publish` — publikacja release'u na GitHub (`electron-forge publish`, wymaga konfiguracji env)

## Workflow przy rozwoju

1. Wprowadź zmiany w kodzie (`src/core/`, `src/electron-main/`, etc.)
2. **(Opcjonalnie)** Przetestuj lokalnie: `npm start`
3. Zbuduj instalator: `npm run make`
4. Przetestuj instalator: uruchom `Tracky Mouse-<wersja> Setup.exe` z folderu `out\make\...`

Jeśli chcesz podbić numer wersji przed buildem, zmień pole `version` w `package.json`.

## Po zainstalowaniu

Po uruchomieniu `Tracky Mouse-<wersja> Setup.exe`:

1. **Instalacja:** Aplikacja zostanie zainstalowana w:
   ```
   %LocalAppData%\tracky-mouse\
   ```
   (Zwykle: `C:\Users\<TwojaNazwaUżytkownika>\AppData\Local\tracky-mouse\`)

2. **Automatyczne uruchomienie:** Aplikacja uruchomi się automatycznie zaraz po zakończeniu instalacji.

3. **Skróty w systemie:**
   - Aplikacja pojawi się w **Menu Start** (wyszukaj "Tracky Mouse")
   - Można ją odinstalować przez **Panel Sterowania** → Programy i funkcje
   - Lub przez **Ustawienia** → Aplikacje → Aplikacje i funkcje

## Czyszczenie buildu

Usuń folder `out/`, aby zacząć od zera.
