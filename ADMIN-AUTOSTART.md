# Uruchamianie TrackyMouse jako Administrator przy Logowaniu

Ten folder zawiera skrypty PowerShell do automatycznego uruchamiania TrackyMouse z uprawnieniami administratora.

## Dlaczego to potrzebne?

Jeśli używasz aplikacji wymagających uprawnień administratora (np. IDE, edytory uruchomione jako admin), TrackyMouse również musi działać jako administrator, aby móc kontrolować kursor w tych aplikacjach.

Windows blokuje procesy bez uprawnień od wysyłania komend do procesów z uprawnieniami (UIPI - User Interface Privilege Isolation).

## Jak użyć?

### Krok 1: Zainstaluj TrackyMouse

Najpierw zainstaluj TrackyMouse używając `Tracky Mouse Setup.exe` z folderu `desktop-app/out/make/squirrel.windows/x64/`.

### Krok 2: Uruchom skrypt setup

1. **Prawy klik** na `setup-admin-autostart.ps1`
2. Wybierz **"Run with PowerShell"**
3. Jeśli pojawi się UAC, kliknij **"Yes"/"Tak"**
4. Skrypt automatycznie:
   - Znajdzie zainstalowaną aplikację TrackyMouse
   - Utworzy zadanie w Task Scheduler
   - Skonfiguruje automatyczne uruchomienie z uprawnieniami admin

### Krok 3: Zrestartuj komputer (lub wyloguj i zaloguj)

Przy następnym logowaniu TrackyMouse uruchomi się automatycznie z uprawnieniami administratora (bez UAC prompt!).

## Jak sprawdzić czy działa?

1. Naciśnij `Win+R`
2. Wpisz: `taskschd.msc`
3. W Task Scheduler Library znajdziesz zadanie: **TrackyMouse-AdminAutoStart**
4. Sprawdź:
   - **Triggers**: At log on
   - **Security options**: Run with highest privileges ✓

## Jak usunąć auto-start?

1. **Prawy klik** na `remove-admin-autostart.ps1`
2. Wybierz **"Run with PowerShell"**
3. Potwierdź usunięcie

Lub ręcznie w Task Scheduler (taskschd.msc) - usuń zadanie "TrackyMouse-AdminAutoStart".

## Uwagi

- ✅ **Bez UAC prompt** - zadanie w Task Scheduler nie pokazuje UAC przy każdym logowaniu
- ✅ **Automatyczne** - nie musisz nic robić po pierwszym uruchomieniu skryptu
- ✅ **Bezpieczne** - działa tylko dla Twojego konta użytkownika
- ⚠️ **Wymaga admin** - skrypty setup i remove muszą być uruchomione jako administrator

## Troubleshooting

### "TrackyMouse not found"
- Zainstaluj TrackyMouse używając instalatora `.exe`
- Domyślna lokalizacja: `C:\Users\<TwojaNazwa>\AppData\Local\tracky-mouse\`

### "This script must be run AS ADMINISTRATOR"
- Prawy klik na PowerShell → "Run as administrator"
- Potem uruchom ponownie:
  ```powershell
  .\setup-admin-autostart.ps1
  ```

### Aplikacja nie uruchamia się przy logowaniu
- Sprawdź Task Scheduler (`taskschd.msc`)
- Kliknij prawym na zadanie "TrackyMouse-AdminAutoStart" → Properties
- Zakładka "General" → sprawdź czy "Run with highest privileges" jest zaznaczone

## Alternatywnie: Ręczne dodanie w Task Scheduler

Jeśli wolisz stworzyć zadanie ręcznie:

1. Naciśnij `Win+R` → `taskschd.msc`
2. Action → Create Task
3. **General**:
   - Name: `TrackyMouse-AdminAutoStart`
   - ✓ Run with highest privileges
4. **Triggers**:
   - New → Begin the task: At log on
   - Specific user: `<TwojeKonto>`
5. **Actions**:
   - New → Action: Start a program
   - Program/script: `C:\Users\<TwojaNazwa>\AppData\Local\tracky-mouse\Update.exe`
   - Arguments: `--processStart "TrackyMouse.exe"` (lub nazwa exe w podfolderze)
6. **Settings**:
   - ✓ Allow task to be run on demand
   - ✓ Start the task only if the computer is on AC power: **ODZNACZ**
7. OK → podaj hasło administratora jeśli wymagane
