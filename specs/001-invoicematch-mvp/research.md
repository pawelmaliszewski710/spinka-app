# Research: InvoiceMatch MVP

**Feature**: 001-invoicematch-mvp
**Created**: 2026-01-26
**Status**: Complete

## 1. File Format Analysis

### 1.1 Fakturownia.pl CSV Export

**Source**: Export z menu Faktury → Eksport → CSV

**Sample file content:**
```csv
"Numer";"Data wystawienia";"Termin płatności";"Netto";"Brutto";"Waluta";"Nabywca";"NIP nabywcy"
"FV/2024/001";"2024-01-15";"2024-01-29";"1000.00";"1230.00";"PLN";"Acme Sp. z o.o.";"1234567890"
"FV/2024/002";"2024-01-16";"2024-01-30";"2500.50";"3075.62";"PLN";"Beta Consulting";"9876543210"
```

**Characteristics:**
| Property | Value |
|----------|-------|
| Encoding | UTF-8 (możliwy BOM) |
| Delimiter | Średnik (;) |
| Quote char | Cudzysłów (") |
| Date format | YYYY-MM-DD |
| Amount format | Decimal z kropką (.) |
| Header | Tak, pierwszy wiersz |

**Required columns mapping:**
| CSV Column | DB Field | Notes |
|------------|----------|-------|
| Numer | invoice_number | Wymagany |
| Data wystawienia | issue_date | Wymagany |
| Termin płatności | due_date | Wymagany |
| Netto | net_amount | Wymagany |
| Brutto | gross_amount | Wymagany |
| Waluta | currency | Domyślnie PLN |
| Nabywca | buyer_name | Wymagany |
| NIP nabywcy | buyer_nip | Opcjonalny |

**Parser implementation notes:**
- Sprawdzić BOM i usunąć jeśli obecny
- Obsłużyć opcjonalne cudzysłowy
- Walidować wymagane kolumny
- Normalizować kwoty (usunąć spacje, zamienić przecinek na kropkę)

---

### 1.2 MT940 Format (Bank Statement)

**Source**: Uniwersalny format SWIFT dla wyciągów bankowych

**Sample file content:**
```
:20:STATEMENT
:25:PL12345678901234567890123456
:28C:00001/001
:60F:C240115PLN10000,00
:61:2401150115C1230,00NTRF//REFERENCE001
:86:020 Przelew przychodzący
ACME SP Z O O
Zapłata za fakturę FV/2024/001
:61:2401160116C2460,00NTRF//REFERENCE002
:86:020 Przelew przychodzący
BETA LTD
Płatność FV/2024/002
:62F:C240116PLN13690,00
```

**Key fields:**
| Tag | Description | Format |
|-----|-------------|--------|
| :20: | Statement ID | Text |
| :25: | Account number | IBAN |
| :28C: | Statement number | XXXXX/YYY |
| :60F: | Opening balance | D/CYYMMDDCURRENCYAMOUNT |
| :61: | Transaction | YYMMDD[YYMMDD]D/CAMOUNTTTTTT//REFERENCE |
| :86: | Transaction details | Multiline text |
| :62F: | Closing balance | D/CYYMMDDCURRENCYAMOUNT |

**:61: field breakdown:**
- Pozycje 1-6: Data waluty (YYMMDD)
- Pozycje 7-10: Data księgowania (MMDD) - opcjonalne
- Pozycja 11: D (debit) lub C (credit)
- Reszta do N/T/S/F: Kwota (bez separatora dziesiętnego, 2 ostatnie cyfry = grosze)
- Po N/T/S/F: Typ transakcji
- Po //: Referencja

**:86: field breakdown:**
- Linia 1: Kod operacji
- Kolejne linie: Nazwa kontrahenta, tytuł (zależne od banku)

**Parser implementation notes:**
- Parsować linia po linii, szukając tagów :XX:
- :86: jest wieloliniowy - zbierać do następnego tagu
- Kwoty w :61: bez separatora (123000 = 1230,00)
- Obsłużyć zarówno C (credit) jak i D (debit) - tylko C nas interesuje (przychody)

---

### 1.3 mBank CSV

**Source**: Eksport z mBank online → Historia → Pobierz CSV

**Sample file content:**
```csv
#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji;
2024-01-15;2024-01-15;PRZELEW PRZYCHODZĄCY;Zapłata za FV/2024/001;ACME SP Z O O;PL12345678901234567890123456;1230,00;11230,00;
2024-01-16;2024-01-16;PRZELEW PRZYCHODZĄCY;Płatność za fakturę;BETA LTD;PL98765432109876543210987654;2460,00;13690,00;
```

**Characteristics:**
| Property | Value |
|----------|-------|
| Encoding | CP1250 lub UTF-8 |
| Delimiter | Średnik (;) |
| Header | Tak, z prefiksem # |
| Date format | YYYY-MM-DD |
| Amount format | Decimal z przecinkiem (,) |

**Column mapping:**
| CSV Column | DB Field |
|------------|----------|
| #Data operacji | transaction_date |
| #Tytuł | title |
| #Nadawca/Odbiorca | sender_name |
| #Numer konta | sender_account |
| #Kwota | amount |

**Parser implementation notes:**
- Usunąć prefix # z nazw kolumn
- Wykryć encoding (szukać polskich znaków w CP1250 vs UTF-8)
- Zamienić przecinek na kropkę w kwotach
- Filtrować tylko przelewy przychodzące (kwota > 0)

---

### 1.4 ING CSV

**Source**: Eksport z ING Business → Historia → Pobierz CSV

**Sample file content:**
```csv
Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Kwota transakcji;Waluta;
2024-01-15;2024-01-15;ACME SP Z O O;Zapłata za FV/2024/001;PL12345678901234567890123456;1230,00;PLN;
2024-01-16;2024-01-16;BETA LTD;Płatność FV/2024/002;PL98765432109876543210987654;2460,00;PLN;
```

**Characteristics:**
| Property | Value |
|----------|-------|
| Encoding | UTF-8 |
| Delimiter | Średnik (;) |
| Header | Tak |
| Date format | YYYY-MM-DD |
| Amount format | Decimal z przecinkiem (,) |

**Column mapping:**
| CSV Column | DB Field |
|------------|----------|
| Data transakcji | transaction_date |
| Dane kontrahenta | sender_name |
| Tytuł | title |
| Nr rachunku | sender_account |
| Kwota transakcji | amount |
| Waluta | currency |

**Parser implementation notes:**
- Format bardzo zbliżony do mBank
- Kwoty mogą być ujemne (wydatki) - filtrować tylko dodatnie
- Waluta w osobnej kolumnie

---

## 2. Matching Algorithm Research

### 2.1 Criteria Analysis

#### Criterion 1: Exact Amount Match
**Weight: 0.40** (najważniejsze kryterium)

```typescript
function matchAmount(invoiceAmount: number, paymentAmount: number): number {
  const tolerance = 0.01; // tolerancja na grosze
  if (Math.abs(invoiceAmount - paymentAmount) <= tolerance) {
    return 1.0; // pełne dopasowanie
  }
  return 0.0;
}
```

**Edge cases:**
- Nadpłata: płatność > faktura → dopasuj z uwagą
- Niedopłata: płatność < faktura → nie dopasowuj automatycznie
- Wiele faktur na tę samą kwotę → dodatkowe kryteria decydują

#### Criterion 2: Invoice Number in Payment Title
**Weight: 0.30** (bardzo wiarygodne gdy obecne)

```typescript
function matchInvoiceNumber(invoiceNumber: string, paymentTitle: string): number {
  // Normalizuj numer faktury
  // FV/2024/001 → FV[\/-]?2024[\/-]?001
  const normalized = invoiceNumber
    .replace(/[\/\-\s]/g, '[\\/-\\s]?')
    .replace(/\s+/g, '\\s*');

  const pattern = new RegExp(normalized, 'i');
  return pattern.test(paymentTitle) ? 1.0 : 0.0;
}
```

**Common invoice number formats:**
- `FV/2024/001`
- `FV-2024-001`
- `FV 2024 001`
- `2024/FV/001`
- `001/2024`

#### Criterion 3: Name Similarity (Buyer ↔ Sender)
**Weight: 0.15** (pomocnicze)

```typescript
function matchName(buyerName: string, senderName: string): number {
  const a = normalizeName(buyerName);
  const b = normalizeName(senderName);

  // Metoda 1: Contains check
  if (a.includes(b) || b.includes(a)) {
    return 0.9;
  }

  // Metoda 2: Levenshtein distance
  const distance = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const similarity = 1 - (distance / maxLen);

  return Math.max(0, similarity);
}

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/SP\.?\s*Z\.?\s*O\.?\s*O\.?/gi, 'SPZOO')
    .replace(/S\.?\s*A\.?/gi, 'SA')
    .trim();
}
```

**Normalization rules:**
- Uppercase
- Usuń nadmiarowe spacje
- Znormalizuj formy prawne: "Sp. z o.o." → "SPZOO"
- Usuń znaki specjalne

#### Criterion 4: NIP in Payment Title
**Weight: 0.10** (silne potwierdzenie gdy obecne)

```typescript
function matchNip(buyerNip: string | null, paymentTitle: string): number {
  if (!buyerNip) return 0;

  // NIP może być z myślnikami lub bez
  const nipClean = buyerNip.replace(/[\-\s]/g, '');

  // Szukaj 10-cyfrowego ciągu w tytule
  const nipPattern = /\d{10}/g;
  const matches = paymentTitle.match(nipPattern);

  if (matches?.includes(nipClean)) {
    return 1.0;
  }
  return 0.0;
}
```

#### Criterion 5: Date Proximity
**Weight: 0.05** (słabe, ale pomocne)

```typescript
function matchDate(dueDate: Date, paymentDate: Date): number {
  const diffDays = Math.abs(differenceInDays(paymentDate, dueDate));

  if (diffDays <= 7) return 1.0;      // bardzo blisko terminu
  if (diffDays <= 14) return 0.8;     // w okolicach terminu
  if (diffDays <= 30) return 0.5;     // miesiąc różnicy
  if (diffDays <= 60) return 0.2;     // 2 miesiące
  return 0.0;                          // za daleko
}
```

### 2.2 Confidence Score Calculation

```typescript
interface MatchResult {
  invoice: Invoice;
  payment: Payment;
  confidence: number;
  breakdown: {
    amount: number;
    invoiceNumber: number;
    name: number;
    nip: number;
    date: number;
  };
  reasons: string[];
}

function calculateMatch(invoice: Invoice, payment: Payment): MatchResult {
  const breakdown = {
    amount: matchAmount(invoice.gross_amount, payment.amount),
    invoiceNumber: matchInvoiceNumber(invoice.invoice_number, payment.title),
    name: matchName(invoice.buyer_name, payment.sender_name),
    nip: matchNip(invoice.buyer_nip, payment.title),
    date: matchDate(new Date(invoice.due_date), new Date(payment.transaction_date)),
  };

  const weights = {
    amount: 0.40,
    invoiceNumber: 0.30,
    name: 0.15,
    nip: 0.10,
    date: 0.05,
  };

  const confidence =
    breakdown.amount * weights.amount +
    breakdown.invoiceNumber * weights.invoiceNumber +
    breakdown.name * weights.name +
    breakdown.nip * weights.nip +
    breakdown.date * weights.date;

  const reasons: string[] = [];
  if (breakdown.amount === 1) reasons.push('Kwota zgodna');
  if (breakdown.invoiceNumber === 1) reasons.push('Numer faktury w tytule');
  if (breakdown.name >= 0.8) reasons.push('Nazwa nabywcy pasuje');
  if (breakdown.nip === 1) reasons.push('NIP w tytule');

  return { invoice, payment, confidence, breakdown, reasons };
}
```

### 2.3 Matching Strategy

```typescript
async function autoMatch(userId: string): Promise<MatchResult[]> {
  // 1. Pobierz niedopasowane faktury
  const invoices = await getUnmatchedInvoices(userId);

  // 2. Pobierz niedopasowane płatności
  const payments = await getUnmatchedPayments(userId);

  // 3. Oblicz wszystkie możliwe dopasowania
  const allMatches: MatchResult[] = [];

  for (const invoice of invoices) {
    for (const payment of payments) {
      const match = calculateMatch(invoice, payment);
      if (match.confidence >= 0.60) { // minimum threshold
        allMatches.push(match);
      }
    }
  }

  // 4. Sortuj po confidence (malejąco)
  allMatches.sort((a, b) => b.confidence - a.confidence);

  // 5. Wybierz najlepsze dopasowania (każda faktura i płatność tylko raz)
  const usedInvoices = new Set<string>();
  const usedPayments = new Set<string>();
  const finalMatches: MatchResult[] = [];

  for (const match of allMatches) {
    if (!usedInvoices.has(match.invoice.id) && !usedPayments.has(match.payment.id)) {
      finalMatches.push(match);
      usedInvoices.add(match.invoice.id);
      usedPayments.add(match.payment.id);
    }
  }

  // 6. Auto-zapisz high confidence (>=0.85), resztę zwróć jako sugestie
  const autoMatched: MatchResult[] = [];
  const suggestions: MatchResult[] = [];

  for (const match of finalMatches) {
    if (match.confidence >= 0.85) {
      await createMatch(match, 'auto');
      autoMatched.push(match);
    } else {
      suggestions.push(match);
    }
  }

  return { autoMatched, suggestions };
}
```

---

## 3. Technology Decisions

### 3.1 Client-side vs Server-side Parsing

**Decision: Edge Functions (server-side) for final import, client-side for preview**

| Aspect | Client-side | Server-side (Edge Function) |
|--------|-------------|----------------------------|
| **Preview** | ✅ Instant feedback | Requires upload first |
| **Security** | ❌ File on client | ✅ Server validates |
| **Consistency** | ❌ Browser differences | ✅ Consistent parsing |
| **Error handling** | Limited | ✅ Full control |

**Implementation:**
1. User selects file → client-side preview (first 10 rows)
2. User confirms → file uploaded to Edge Function
3. Edge Function parses, validates, saves to DB
4. Returns result (success count, errors)

### 3.2 Matching Execution

**Decision: Edge Function triggered on demand**

**Reasons:**
- No need for real-time matching
- User explicitly triggers "Dopasuj automatycznie"
- Synchronous execution sufficient for MVP volume
- Can add background jobs later if needed

### 3.3 File Size Limits

**Decision: 10MB max**

**Rationale:**
- Typical bank statement: 50-500KB
- Large Fakturownia export: 1-5MB
- 10MB covers edge cases with margin
- Vercel/Supabase Edge Function limits respected

---

## 4. Security Considerations

### 4.1 Data Protection

- **RLS**: All tables with `user_id = auth.uid()` policy
- **Edge Functions**: Verify auth before any operation
- **Input validation**: File format, size, content sanitization
- **No logging of sensitive data**: NIP, amounts only in debug mode

### 4.2 File Upload Security

```typescript
// Edge Function validation
function validateUpload(file: File, maxSize: number = 10 * 1024 * 1024) {
  // 1. Size check
  if (file.size > maxSize) {
    throw new Error('File too large');
  }

  // 2. Type check (by content, not just extension)
  const allowedTypes = ['text/csv', 'text/plain', 'application/octet-stream'];
  // MT940 files may have various MIME types

  // 3. Extension check
  const allowedExtensions = ['.csv', '.sta', '.mt940', '.txt'];
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    throw new Error('Invalid file type');
  }

  // 4. Content validation (no executable content)
  // Parse and validate structure
}
```

---

## 5. Performance Considerations

### 5.1 Benchmarks

Per constitution requirements:

| Operation | Target | Approach |
|-----------|--------|----------|
| Dashboard load | <2s | Indexes, materialized view for summary |
| File parsing | <3s/1000 rows | Streaming parser, efficient regex |
| Auto-matching | <5s/500×500 | Early termination, sorted iteration |

### 5.2 Database Optimization

```sql
-- Critical indexes
CREATE INDEX idx_invoices_user_status ON invoices(user_id, payment_status);
CREATE INDEX idx_invoices_user_due_date ON invoices(user_id, due_date);
CREATE INDEX idx_payments_user_date ON payments(user_id, transaction_date);
CREATE INDEX idx_payments_user_amount ON payments(user_id, amount);

-- For matching algorithm
CREATE INDEX idx_invoices_unmatched ON invoices(user_id, gross_amount)
  WHERE payment_status IN ('pending', 'overdue');
```

### 5.3 Frontend Optimization

- Pagination: max 100 rows per request
- Virtual scrolling for large lists
- React.memo for table rows
- Debounced search/filter inputs

---

## 6. Sample Test Files

### 6.1 Fakturownia Sample (fakturownia-sample.csv)

```csv
"Numer";"Data wystawienia";"Termin płatności";"Netto";"Brutto";"Waluta";"Nabywca";"NIP nabywcy"
"FV/2024/001";"2024-01-01";"2024-01-15";"1000.00";"1230.00";"PLN";"Acme Sp. z o.o.";"1234567890"
"FV/2024/002";"2024-01-05";"2024-01-19";"2000.00";"2460.00";"PLN";"Beta Consulting Sp. z o.o.";"0987654321"
"FV/2024/003";"2024-01-10";"2024-01-24";"500.00";"615.00";"PLN";"Gamma S.A.";"1122334455"
"FV/2024/004";"2024-01-15";"2024-01-29";"1500.00";"1845.00";"PLN";"Delta Usługi";"5566778899"
"FV/2024/005";"2024-01-20";"2024-02-03";"3000.00";"3690.00";"PLN";"Epsilon Tech";"9988776655"
```

### 6.2 MT940 Sample (mt940-sample.sta)

```
:20:STATEMENT20240131
:25:PL12345678901234567890123456
:28C:00001/001
:60F:C240101PLN10000,00
:61:2401140114C123000NTRF//REF20240114001
:86:020 Przelew przychodzący
ACME SP Z O O
Zapłata za fakturę FV/2024/001
NIP 1234567890
:61:2401200120C246000NTRF//REF20240120001
:86:020 Przelew przychodzący
BETA CONSULTING SP Z O O
FV/2024/002 - płatność
:61:2401250125C184500NTRF//REF20240125001
:86:020 Przelew przychodzący
DELTA USLUGI
Faktura FV/2024/004
:62F:C240131PLN15535,00
```

### 6.3 mBank Sample (mbank-sample.csv)

```csv
#Data operacji;#Data księgowania;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji;
2024-01-14;2024-01-14;PRZELEW PRZYCHODZĄCY;Zapłata za fakturę FV/2024/001 NIP 1234567890;ACME SP Z O O;PL12345678901234567890123456;1230,00;11230,00;
2024-01-20;2024-01-20;PRZELEW PRZYCHODZĄCY;FV/2024/002 - płatność;BETA CONSULTING SP Z O O;PL98765432109876543210987654;2460,00;13690,00;
2024-01-25;2024-01-25;PRZELEW PRZYCHODZĄCY;Faktura FV/2024/004;DELTA USLUGI;PL55667788990011223344556677;1845,00;15535,00;
```

### 6.4 ING Sample (ing-sample.csv)

```csv
Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Kwota transakcji;Waluta;
2024-01-14;2024-01-14;ACME SP Z O O;Zapłata za fakturę FV/2024/001 NIP 1234567890;PL12345678901234567890123456;1230,00;PLN;
2024-01-20;2024-01-20;BETA CONSULTING SP Z O O;FV/2024/002 - płatność;PL98765432109876543210987654;2460,00;PLN;
2024-01-25;2024-01-25;DELTA USLUGI;Faktura FV/2024/004;PL55667788990011223344556677;1845,00;PLN;
```

---

## 7. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Częściowe płatności? | MVP: ignorujemy, status 'partial' na przyszłość |
| Wielowalutowość? | MVP: tylko PLN |
| PKO/Santander CSV? | MVP: MT940 + mBank + ING, pozostałe banki w przyszłości |
| Przechowywanie plików źródłowych? | MVP: nie przechowujemy, tylko parsujemy |
| Background jobs dla matching? | MVP: synchroniczne, Edge Function on-demand |
