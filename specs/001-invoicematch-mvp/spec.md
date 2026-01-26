# Feature Specification: InvoiceMatch MVP

**Feature Branch**: `001-invoicematch-mvp`
**Created**: 2026-01-26
**Status**: Draft
**Input**: User description - System dopasowywania faktur do płatności dla małych firm

## User Scenarios & Testing

### User Story 1 - Rejestracja i logowanie (Priority: P0) 🔒 Blocker

Użytkownik musi mieć możliwość utworzenia konta i bezpiecznego logowania, zanim będzie mógł korzystać z aplikacji. To jest warunek wstępny dla wszystkich innych funkcji.

**Why this priority**: Bez autentykacji żadna inna funkcjonalność nie ma sensu - dane muszą być przypisane do użytkownika i chronione przez RLS.

**Independent Test**: Można przetestować kompletny flow rejestracji i logowania bez innych funkcji - użytkownik po zalogowaniu widzi pusty dashboard.

**Acceptance Scenarios**:

1. **Given** strona rejestracji, **When** użytkownik wypełnia email i hasło (min. 8 znaków) i klika "Zarejestruj", **Then** konto jest tworzone i użytkownik jest automatycznie zalogowany
2. **Given** zarejestrowany użytkownik, **When** wpisuje poprawne dane na stronie logowania, **Then** zostaje zalogowany i przekierowany na dashboard
3. **Given** zalogowany użytkownik, **When** klika "Wyloguj", **Then** sesja kończy się i użytkownik widzi stronę logowania
4. **Given** niepoprawne dane logowania, **When** użytkownik próbuje się zalogować, **Then** widzi komunikat "Nieprawidłowy email lub hasło"

---

### User Story 2 - Import faktur z Fakturownia.pl (Priority: P1) 🎯 MVP Core

Użytkownik eksportuje faktury z Fakturownia.pl do CSV i importuje je do aplikacji. System parsuje plik i zapisuje faktury w bazie danych.

**Why this priority**: Import faktur to fundamentalna funkcja - bez faktur nie ma czego dopasowywać do płatności.

**Independent Test**: Można zaimportować faktury i przeglądać je na liście bez innych funkcji - widoczny jest numer, kwota, termin, status (domyślnie "oczekująca").

**Acceptance Scenarios**:

1. **Given** zalogowany użytkownik na stronie faktur, **When** klika "Importuj" i wybiera plik CSV z Fakturownia.pl, **Then** widzi podgląd danych z pliku (pierwsze 5-10 wierszy)
2. **Given** podgląd importu z poprawnymi danymi, **When** użytkownik klika "Importuj faktury", **Then** faktury zapisują się w bazie i pojawiają się na liście
3. **Given** plik CSV z niepoprawnym formatem, **When** użytkownik próbuje go zaimportować, **Then** widzi komunikat "Nieprawidłowy format pliku. Upewnij się, że eksportujesz z Fakturownia.pl"
4. **Given** plik CSV z duplikatem faktury (ten sam numer), **When** użytkownik importuje, **Then** duplikaty są pomijane z informacją "Pominięto X duplikatów"
5. **Given** plik większy niż 10MB, **When** użytkownik próbuje go uploadować, **Then** widzi komunikat "Plik jest za duży. Maksymalny rozmiar to 10MB"
6. **Given** lista zaimportowanych faktur, **When** użytkownik klika na wiersz, **Then** widzi szczegóły faktury (numer, kwota netto/brutto, nabywca, NIP, daty)

---

### User Story 3 - Import płatności bankowych (Priority: P1) 🎯 MVP Core

Użytkownik pobiera wyciąg bankowy ze swojego banku (MT940 lub CSV) i importuje go do aplikacji. System parsuje różne formaty i zapisuje transakcje.

**Why this priority**: Import płatności to druga kluczowa funkcja - razem z fakturami umożliwia dopasowywanie.

**Independent Test**: Można zaimportować płatności i przeglądać je na liście bez innych funkcji - widoczna jest data, kwota, nadawca, tytuł.

**Acceptance Scenarios**:

1. **Given** zalogowany użytkownik na stronie płatności, **When** klika "Importuj" i wybiera plik MT940, **Then** widzi podgląd transakcji z pliku
2. **Given** podgląd importu, **When** użytkownik klika "Importuj płatności", **Then** płatności zapisują się w bazie
3. **Given** plik CSV z mBank, **When** użytkownik importuje, **Then** transakcje są poprawnie sparsowane (kwoty, daty, tytuły)
4. **Given** plik CSV z ING, **When** użytkownik importuje, **Then** transakcje są poprawnie sparsowane
5. **Given** nierozpoznany format pliku, **When** użytkownik próbuje importować, **Then** widzi komunikat "Nieobsługiwany format. Wspieramy: MT940, mBank CSV, ING CSV"
6. **Given** plik z kodowaniem CP1250, **When** użytkownik importuje, **Then** polskie znaki są poprawnie wyświetlane
7. **Given** lista płatności, **When** użytkownik filtruje po zakresie dat, **Then** widzi tylko płatności z tego zakresu

---

### User Story 4 - Automatyczne dopasowywanie (Priority: P1) 🎯 MVP Core

System automatycznie analizuje faktury i płatności, łącząc je na podstawie kryteriów: kwota, numer faktury w tytule, nazwa nabywcy, NIP. Każde dopasowanie ma wskaźnik pewności.

**Why this priority**: Automatyczne dopasowywanie to główna wartość aplikacji - oszczędza czas użytkownika.

**Independent Test**: Po imporcie faktur i płatności można uruchomić auto-match i zobaczyć wyniki z confidence score.

**Acceptance Scenarios**:

1. **Given** faktury i płatności w systemie, **When** użytkownik klika "Dopasuj automatycznie", **Then** system analizuje dane i tworzy dopasowania
2. **Given** faktura FV/2024/001 na 1230 PLN i płatność na 1230 PLN z tytułem "Zapłata za FV/2024/001", **When** auto-match, **Then** dopasowanie ma confidence ≥0.85 i faktura zmienia status na "opłacona"
3. **Given** faktura na 1230 PLN i płatność na 1230 PLN bez numeru faktury w tytule ale z tą samą nazwą firmy, **When** auto-match, **Then** dopasowanie ma confidence 0.55-0.70 i jest wyświetlane jako "sugestia"
4. **Given** dopasowanie z medium confidence (0.60-0.84), **When** użytkownik je widzi, **Then** może kliknąć "Akceptuj" lub "Odrzuć"
5. **Given** zaakceptowane dopasowanie, **When** użytkownik klika "Akceptuj", **Then** status faktury zmienia się na "opłacona"
6. **Given** brak płatności pasujących do faktury, **When** auto-match, **Then** faktura pozostaje jako "oczekująca" lub "zaległa" (jeśli po terminie)
7. **Given** widok dopasowań, **When** użytkownik klika na dopasowanie, **Then** widzi szczegóły: co się zgadza (kwota ✓, numer ✓, nazwa ~80%)

---

### User Story 5 - Dashboard ze statusami (Priority: P2)

Strona główna pokazująca podsumowanie finansów: ile faktur opłaconych, oczekujących, zaległych, oraz łączne kwoty w każdej kategorii.

**Why this priority**: Dashboard daje szybki przegląd sytuacji - ważny dla codziennej pracy, ale wymaga danych z US2-US4.

**Independent Test**: Dashboard pokazuje poprawne statystyki nawet z samymi fakturami (bez płatności/dopasowań).

**Acceptance Scenarios**:

1. **Given** zalogowany użytkownik z fakturami, **When** otwiera dashboard, **Then** widzi 3 karty: "Opłacone", "Oczekujące", "Zaległe" z liczbą i sumą kwot
2. **Given** karta "Zaległe", **When** użytkownik na nią klika, **Then** przechodzi do listy faktur przefiltrowanej po statusie "zaległa"
3. **Given** brak danych, **When** nowy użytkownik otwiera dashboard, **Then** widzi komunikat "Rozpocznij od importu faktur" z przyciskiem
4. **Given** faktury w różnych statusach, **When** dashboard się ładuje, **Then** wszystkie kwoty i liczby są poprawnie zsumowane
5. **Given** dashboard, **When** użytkownik odświeża stronę, **Then** widzi aktualne dane (bez cache'owania starych wartości)

---

### User Story 6 - Lista zaległości z kopiowaniem (Priority: P2)

Dedykowany widok pokazujący tylko faktury po terminie płatności, posortowane od najstarszych, z możliwością szybkiego skopiowania danych do schowka.

**Why this priority**: Lista zaległości to kluczowe narzędzie do windykacji - musi być łatwa do wyeksportowania.

**Independent Test**: Można otworzyć listę zaległości i skopiować dane bez innych widoków.

**Acceptance Scenarios**:

1. **Given** faktury po terminie płatności, **When** użytkownik otwiera "Zaległości", **Then** widzi listę posortowaną od najstarszej zaległości
2. **Given** lista zaległości, **When** klika "Kopiuj listę", **Then** dane kopiują się do schowka w formacie: "Nabywca | NIP | Kwota | Dni po terminie"
3. **Given** lista zaległości, **When** użytkownik zaznacza konkretne wiersze, **Then** może skopiować tylko zaznaczone
4. **Given** skopiowane dane, **When** użytkownik wkleja do Excela/emaila, **Then** dane są poprawnie sformatowane (kolumny/wiersze)
5. **Given** brak zaległości, **When** użytkownik otwiera widok, **Then** widzi komunikat "Brak zaległych faktur"
6. **Given** lista zaległości, **Then** przy każdej fakturze widać: nabywcę, NIP, kwotę brutto, liczbę dni po terminie, datę wymagalności

---

### User Story 7 - Ręczna korekta dopasowań (Priority: P3)

Użytkownik może ręcznie połączyć fakturę z płatnością lub rozłączyć istniejące dopasowanie, gdy automatyka się pomyli.

**Why this priority**: Manualne dopasowania są potrzebne dla edge cases - ważne, ale nie blokujące podstawowego flow.

**Independent Test**: Można utworzyć i usunąć manualne dopasowanie niezależnie od auto-matcha.

**Acceptance Scenarios**:

1. **Given** faktura bez dopasowania i wolna płatność, **When** użytkownik klika "Dopasuj ręcznie" przy fakturze, **Then** widzi listę dostępnych płatności do wyboru
2. **Given** dialog ręcznego dopasowania, **When** użytkownik wybiera płatność i potwierdza, **Then** tworzy się match z typem "manual" i faktura zmienia status na "opłacona"
3. **Given** istniejące dopasowanie (auto lub manual), **When** użytkownik klika "Rozłącz", **Then** dopasowanie jest usuwane, faktura wraca do "oczekująca" lub "zaległa"
4. **Given** płatność już dopasowana, **When** użytkownik próbuje ją dopasować ponownie, **Then** widzi komunikat "Ta płatność jest już dopasowana do faktury X"
5. **Given** historia dopasowań faktury, **When** użytkownik klika "Historia", **Then** widzi kto i kiedy dopasował/rozłączył

---

### Edge Cases

- **Częściowa płatność**: Co gdy płatność pokrywa tylko część faktury? → MVP: ignorujemy, status 'partial' na przyszłość
- **Nadpłata**: Co gdy płatność jest większa niż faktura? → Dopasowujemy z informacją o nadpłacie
- **Kilka faktur w jednym przelewie**: Co gdy tytuł zawiera "FV/001 + FV/002"? → MVP: dopasowujemy do pierwszej znalezionej
- **Zduplikowane importy**: Co gdy użytkownik importuje ten sam plik dwa razy? → Pomijamy duplikaty (unikalne: invoice_number lub payment reference)
- **Puste pola**: Co gdy brakuje NIP nabywcy? → Dopasowujemy bez tego kryterium (niższy confidence)
- **Różne formaty numerów**: "FV/2024/001" vs "FV-2024-001" vs "FV 2024 001" → Normalizujemy przy porównaniu

---

## Requirements

### Functional Requirements

- **FR-001**: System MUSI pozwalać na rejestrację użytkownika przez email/hasło
- **FR-002**: System MUSI chronić dane użytkownika przez RLS (Row Level Security)
- **FR-003**: System MUSI parsować pliki CSV z Fakturownia.pl
- **FR-004**: System MUSI parsować pliki MT940 (format bankowy)
- **FR-005**: System MUSI parsować pliki CSV z mBank i ING
- **FR-006**: System MUSI automatycznie dopasowywać faktury do płatności z confidence score
- **FR-007**: System MUSI pozwalać na ręczną korektę dopasowań
- **FR-008**: System MUSI wyświetlać dashboard z podsumowaniem statusów
- **FR-009**: System MUSI automatycznie aktualizować status faktur: pending → paid/overdue
- **FR-010**: System MUSI walidować pliki przed importem (format, rozmiar, encoding)
- **FR-011**: System MUSI obsługiwać faktury w walucie PLN
- **FR-012**: System MUSI umożliwiać kopiowanie listy zaległości do schowka

### Non-Functional Requirements

- **NFR-001**: Dashboard MUSI ładować się w <2s dla 1000 faktur
- **NFR-002**: Parsing plików MUSI zakończyć się w <3s dla 1000 wierszy
- **NFR-003**: Auto-matching MUSI zakończyć się w <5s dla 500 faktur × 500 płatności
- **NFR-004**: Maksymalny rozmiar pliku: 10MB
- **NFR-005**: Aplikacja MUSI działać na Chrome, Firefox, Safari, Edge (ostatnie 2 wersje)
- **NFR-006**: UI MUSI być responsywne (desktop-first, ale działające na tablet)

### Key Entities

- **Invoice (Faktura)**: Dokument sprzedaży z numerem, kwotami, terminami, danymi nabywcy
- **Payment (Płatność)**: Transakcja bankowa z datą, kwotą, nadawcą, tytułem
- **Match (Dopasowanie)**: Powiązanie faktury z płatnością wraz z confidence score i typem
- **User (Użytkownik)**: Właściciel danych, identyfikowany przez auth.uid()

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Użytkownik może zaimportować 100 faktur w <30 sekund (całość flow: upload → podgląd → import)
- **SC-002**: Auto-matching poprawnie dopasowuje ≥80% faktur z płatnościami gdy numer faktury jest w tytule
- **SC-003**: Auto-matching poprawnie dopasowuje ≥60% faktur gdy tylko kwota i nazwa pasują
- **SC-004**: Użytkownik może skopiować listę zaległości jednym kliknięciem
- **SC-005**: Dashboard pokazuje aktualne dane bez opóźnień (max 5s po imporcie/dopasowaniu)
- **SC-006**: 0 przypadków wycieku danych między użytkownikami (RLS compliance)

### Definition of Done

Każdy User Story jest ukończony gdy:
- [ ] Wszystkie Acceptance Scenarios przechodzą testy E2E
- [ ] UI zgodny z Shadcn/ui i wzorcami z constitution
- [ ] Loading states dla wszystkich operacji async
- [ ] Error handling z user-friendly komunikatami
- [ ] RLS policy przetestowana dla danej funkcjonalności
- [ ] Dokumentacja API (jeśli nowy endpoint)
- [ ] Performance w ramach określonych limitów
