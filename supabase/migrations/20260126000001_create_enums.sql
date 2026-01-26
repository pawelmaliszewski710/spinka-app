-- Migration: Create enum types for InvoiceMatch
-- Created: 2026-01-26

-- Payment status enum
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'partial');

-- Match type enum (auto vs manual matching)
CREATE TYPE match_type AS ENUM ('auto', 'manual');

-- Import source enum (file format origin)
CREATE TYPE import_source AS ENUM ('fakturownia', 'mt940', 'mbank', 'ing');
