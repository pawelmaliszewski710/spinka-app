-- Migration: Add mbank_sme to bank_source enum
-- Created: 2026-01-27

-- Add mbank_sme value to bank_source enum for mBank SME (MSP) format
ALTER TYPE bank_source ADD VALUE IF NOT EXISTS 'mbank_sme';
