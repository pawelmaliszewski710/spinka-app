# API Contracts: InvoiceMatch MVP

**Feature**: 001-invoicematch-mvp
**Created**: 2026-01-26
**Backend**: Supabase (Direct client + Edge Functions)

## Overview

InvoiceMatch uses a hybrid API approach:
- **Supabase Client**: Direct database access for CRUD operations (with RLS)
- **Edge Functions**: Complex operations (file parsing, auto-matching)

## Authentication

All requests require authentication via Supabase Auth.

```typescript
// Frontend setup
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth header is automatically included when user is logged in
```

---

## 1. Invoices API

### 1.1 List Invoices

**Method**: Supabase Client (direct)

```typescript
// Get all invoices for current user
const { data, error } = await supabase
  .from('invoices')
  .select('*')
  .order('due_date', { ascending: false });

// With filters
const { data, error } = await supabase
  .from('invoices')
  .select('*')
  .eq('payment_status', 'overdue')
  .gte('due_date', '2024-01-01')
  .lte('due_date', '2024-12-31')
  .order('due_date', { ascending: true })
  .range(0, 99); // pagination
```

**Response type:**
```typescript
interface Invoice {
  id: string;
  user_id: string;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  gross_amount: number;
  net_amount: number;
  currency: string;
  buyer_name: string;
  buyer_nip: string | null;
  payment_status: 'pending' | 'paid' | 'overdue' | 'partial';
  created_at: string;
  updated_at: string;
}
```

### 1.2 Get Single Invoice

```typescript
const { data, error } = await supabase
  .from('invoices')
  .select('*')
  .eq('id', invoiceId)
  .single();
```

### 1.3 Import Invoices (Edge Function)

**Endpoint**: `POST /functions/v1/import-invoices`

**Request:**
```typescript
// FormData with file
const formData = new FormData();
formData.append('file', csvFile);

const { data, error } = await supabase.functions.invoke('import-invoices', {
  body: formData,
});
```

**Response:**
```typescript
interface ImportInvoicesResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ImportError[];
  invoices: Invoice[];
}

interface ImportError {
  row: number;
  field: string;
  message: string;
  value?: string;
}
```

**Error codes:**
| Code | Message |
|------|---------|
| 400 | Invalid file format |
| 400 | File too large (max 10MB) |
| 400 | Missing required columns |
| 401 | Unauthorized |
| 422 | Validation errors in data |

### 1.4 Update Invoice

```typescript
const { data, error } = await supabase
  .from('invoices')
  .update({ payment_status: 'paid' })
  .eq('id', invoiceId)
  .select()
  .single();
```

### 1.5 Delete Invoice

```typescript
const { error } = await supabase
  .from('invoices')
  .delete()
  .eq('id', invoiceId);
```

---

## 2. Payments API

### 2.1 List Payments

```typescript
const { data, error } = await supabase
  .from('payments')
  .select('*')
  .order('transaction_date', { ascending: false });

// Unmatched payments only
const { data, error } = await supabase
  .from('v_unmatched_payments')
  .select('*');
```

**Response type:**
```typescript
interface Payment {
  id: string;
  user_id: string;
  transaction_date: string;
  amount: number;
  currency: string;
  sender_name: string;
  sender_account: string | null;
  title: string;
  reference: string | null;
  source: 'fakturownia' | 'mt940' | 'mbank' | 'ing';
  source_file: string | null;
  created_at: string;
}
```

### 2.2 Import Payments (Edge Function)

**Endpoint**: `POST /functions/v1/import-payments`

**Request:**
```typescript
const formData = new FormData();
formData.append('file', bankFile);
formData.append('source', 'mt940'); // or 'mbank', 'ing'

const { data, error } = await supabase.functions.invoke('import-payments', {
  body: formData,
});
```

**Response:**
```typescript
interface ImportPaymentsResponse {
  success: boolean;
  imported: number;
  skipped: number;
  errors: ImportError[];
  payments: Payment[];
  detectedSource: 'mt940' | 'mbank' | 'ing' | 'unknown';
}
```

**Auto-detection logic:**
1. Check file extension (.sta, .mt940 → MT940)
2. Check content patterns (:20:, :61: → MT940)
3. Check CSV header (# prefix → mBank, specific columns → ING)

---

## 3. Matches API

### 3.1 List Matches

```typescript
// With invoice and payment details
const { data, error } = await supabase
  .from('matches')
  .select(`
    *,
    invoice:invoices(*),
    payment:payments(*)
  `)
  .order('matched_at', { ascending: false });
```

**Response type:**
```typescript
interface MatchWithDetails {
  id: string;
  user_id: string;
  invoice_id: string;
  payment_id: string;
  confidence_score: number;
  match_type: 'auto' | 'manual';
  matched_at: string;
  matched_by: string | null;
  invoice: Invoice;
  payment: Payment;
}
```

### 3.2 Auto-Match (Edge Function)

**Endpoint**: `POST /functions/v1/auto-match`

**Request:**
```typescript
const { data, error } = await supabase.functions.invoke('auto-match', {
  body: {
    invoiceIds: ['uuid1', 'uuid2'], // optional: limit to specific invoices
    dryRun: false, // if true, only return suggestions without saving
  },
});
```

**Response:**
```typescript
interface AutoMatchResponse {
  success: boolean;
  autoMatched: MatchResult[];  // high confidence, saved automatically
  suggestions: MatchResult[];   // medium confidence, pending user approval
  unmatched: {
    invoices: string[];  // invoice IDs without matches
    payments: string[];  // payment IDs without matches
  };
}

interface MatchResult {
  invoiceId: string;
  paymentId: string;
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
```

### 3.3 Create Manual Match

```typescript
const { data, error } = await supabase
  .from('matches')
  .insert({
    user_id: userId,
    invoice_id: invoiceId,
    payment_id: paymentId,
    confidence_score: 1.0, // manual = 100% confidence
    match_type: 'manual',
    matched_by: userId,
  })
  .select()
  .single();
```

### 3.4 Accept Suggested Match

```typescript
// Same as create manual, but with provided confidence
const { data, error } = await supabase
  .from('matches')
  .insert({
    user_id: userId,
    invoice_id: suggestion.invoiceId,
    payment_id: suggestion.paymentId,
    confidence_score: suggestion.confidence,
    match_type: 'manual', // user confirmed = manual
    matched_by: userId,
  })
  .select()
  .single();
```

### 3.5 Delete Match (Unmatch)

```typescript
const { error } = await supabase
  .from('matches')
  .delete()
  .eq('id', matchId);

// Note: Trigger will automatically update invoice status back to pending/overdue
```

---

## 4. Dashboard API

### 4.1 Get Summary

```typescript
const { data, error } = await supabase
  .from('v_dashboard_summary')
  .select('*');
```

**Response:**
```typescript
interface DashboardSummary {
  payment_status: 'pending' | 'paid' | 'overdue' | 'partial';
  invoice_count: number;
  total_amount: number;
}[]
```

**Frontend aggregation:**
```typescript
interface DashboardData {
  paid: { count: number; amount: number };
  pending: { count: number; amount: number };
  overdue: { count: number; amount: number };
  total: { count: number; amount: number };
}

function aggregateSummary(rows: DashboardSummary[]): DashboardData {
  const result = {
    paid: { count: 0, amount: 0 },
    pending: { count: 0, amount: 0 },
    overdue: { count: 0, amount: 0 },
    total: { count: 0, amount: 0 },
  };

  for (const row of rows) {
    result[row.payment_status] = {
      count: row.invoice_count,
      amount: row.total_amount,
    };
    result.total.count += row.invoice_count;
    result.total.amount += row.total_amount;
  }

  return result;
}
```

### 4.2 Get Overdue Invoices

```typescript
const { data, error } = await supabase
  .from('v_overdue_invoices')
  .select('*')
  .order('due_date', { ascending: true });
```

**Response includes computed field:**
```typescript
interface OverdueInvoice extends Invoice {
  days_overdue: number;
}
```

---

## 5. Edge Function Specifications

### 5.1 import-invoices

**File**: `supabase/functions/import-invoices/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface ParsedInvoice {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  net_amount: number;
  gross_amount: number;
  currency: string;
  buyer_name: string;
  buyer_nip: string | null;
}

Deno.serve(async (req: Request) => {
  // 1. Auth check
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  // 2. Parse form data
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return new Response(JSON.stringify({ error: "No file provided" }), { status: 400 });
  }

  // 3. Validate file size
  if (file.size > 10 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "File too large" }), { status: 400 });
  }

  // 4. Parse CSV
  const content = await file.text();
  const { invoices, errors } = parseFakturowniaCSV(content);

  if (invoices.length === 0 && errors.length > 0) {
    return new Response(JSON.stringify({ success: false, errors }), { status: 422 });
  }

  // 5. Insert invoices (upsert to handle duplicates)
  const { data: inserted, error: insertError } = await supabase
    .from("invoices")
    .upsert(
      invoices.map(inv => ({ ...inv, user_id: user.id })),
      { onConflict: "user_id,invoice_number", ignoreDuplicates: true }
    )
    .select();

  // 6. Return result
  return new Response(JSON.stringify({
    success: true,
    imported: inserted?.length ?? 0,
    skipped: invoices.length - (inserted?.length ?? 0),
    errors,
    invoices: inserted,
  }), {
    headers: { "Content-Type": "application/json" },
  });
});

function parseFakturowniaCSV(content: string): { invoices: ParsedInvoice[], errors: ImportError[] } {
  // Implementation details in research.md
}
```

### 5.2 import-payments

Similar structure to import-invoices, with multi-format detection:

```typescript
function detectFormat(content: string, filename: string): 'mt940' | 'mbank' | 'ing' | 'unknown' {
  // 1. Check extension
  if (filename.match(/\.(sta|mt940)$/i)) return 'mt940';

  // 2. Check content patterns
  if (content.includes(':20:') && content.includes(':61:')) return 'mt940';

  // 3. Check CSV headers
  if (content.startsWith('#Data operacji')) return 'mbank';
  if (content.startsWith('Data transakcji;')) return 'ing';

  return 'unknown';
}
```

### 5.3 auto-match

```typescript
Deno.serve(async (req: Request) => {
  // Auth check...

  const body = await req.json();
  const { invoiceIds, dryRun = false } = body;

  // 1. Get unmatched invoices
  let query = supabase
    .from('invoices')
    .select('*')
    .in('payment_status', ['pending', 'overdue']);

  if (invoiceIds?.length) {
    query = query.in('id', invoiceIds);
  }

  const { data: invoices } = await query;

  // 2. Get unmatched payments
  const { data: payments } = await supabase
    .from('v_unmatched_payments')
    .select('*');

  // 3. Calculate matches
  const results = calculateAllMatches(invoices, payments);

  // 4. If not dry run, save high confidence matches
  if (!dryRun) {
    const highConfidence = results.filter(r => r.confidence >= 0.85);
    for (const match of highConfidence) {
      await supabase.from('matches').insert({
        user_id: user.id,
        invoice_id: match.invoiceId,
        payment_id: match.paymentId,
        confidence_score: match.confidence,
        match_type: 'auto',
      });
    }
  }

  return new Response(JSON.stringify({
    success: true,
    autoMatched: results.filter(r => r.confidence >= 0.85),
    suggestions: results.filter(r => r.confidence >= 0.60 && r.confidence < 0.85),
    unmatched: {
      invoices: getUnmatchedIds(invoices, results),
      payments: getUnmatchedIds(payments, results),
    },
  }));
});
```

---

## 6. Error Handling

### Standard Error Response

```typescript
interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}
```

### HTTP Status Codes

| Code | Usage |
|------|-------|
| 200 | Success |
| 400 | Bad request (invalid input) |
| 401 | Unauthorized |
| 403 | Forbidden (RLS violation) |
| 404 | Not found |
| 422 | Validation error |
| 500 | Server error |

### Frontend Error Handling

```typescript
async function apiCall<T>(fn: () => Promise<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await fn();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Not found');
    }
    if (error.code === '42501') {
      throw new Error('Access denied');
    }
    throw new Error(error.message || 'Unknown error');
  }

  if (!data) {
    throw new Error('No data returned');
  }

  return data;
}
```

---

## 7. TypeScript Types (Generated)

Use Supabase CLI to generate types:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/types/database.ts
```

This generates:
```typescript
export type Database = {
  public: {
    Tables: {
      invoices: {
        Row: Invoice;
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Invoice, 'id' | 'user_id'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at'>;
        Update: Partial<Omit<Payment, 'id' | 'user_id'>>;
      };
      matches: {
        Row: Match;
        Insert: Omit<Match, 'id' | 'matched_at'>;
        Update: Partial<Omit<Match, 'id' | 'user_id'>>;
      };
    };
    Views: {
      v_dashboard_summary: { Row: DashboardSummary };
      v_overdue_invoices: { Row: OverdueInvoice };
      v_unmatched_payments: { Row: Payment };
    };
  };
};
```
