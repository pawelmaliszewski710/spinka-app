-- Migration: Add pekao to bank_source enum
-- Created: 2026-01-27

-- Add pekao value to bank_source enum for Pekao SA format
ALTER TYPE bank_source ADD VALUE IF NOT EXISTS 'pekao';
