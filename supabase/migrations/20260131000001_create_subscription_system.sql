-- =====================================================
-- SUBSCRIPTION SYSTEM MIGRATION
-- =====================================================
-- Creates tables for subscription plans, user profiles,
-- usage tracking, and related functions
-- =====================================================

-- 1. Plan Limits Table (configuration of plans)
CREATE TABLE IF NOT EXISTS plan_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text UNIQUE NOT NULL,
  display_name text NOT NULL,
  monthly_invoice_limit integer, -- null = unlimited
  monthly_ai_budget_cents integer, -- in USD cents, null = unlimited
  max_companies integer, -- null = unlimited
  features jsonb DEFAULT '{}',
  stripe_price_id_monthly text,
  stripe_price_id_yearly text,
  created_at timestamptz DEFAULT now()
);

-- Insert default plans
INSERT INTO plan_limits (plan_id, display_name, monthly_invoice_limit, monthly_ai_budget_cents, max_companies, features) VALUES
  ('free', 'Darmowy', 20, 0, 1, '{"ai_enabled": false}'::jsonb),
  ('standard', 'Standard', 100, 200, 1, '{"ai_enabled": true, "priority_support": true}'::jsonb),
  ('multi', 'Multi-Firma', null, 500, 3, '{"ai_enabled": true, "priority_support": true}'::jsonb),
  ('enterprise', 'Biuro Rachunkowe', null, null, null, '{"ai_enabled": true, "ai_advanced": true, "dedicated_support": true, "custom_integrations": true}'::jsonb)
ON CONFLICT (plan_id) DO NOTHING;

-- 2. User Profiles Table (subscription info per user)
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text REFERENCES plan_limits(plan_id) DEFAULT 'free',
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Service role can manage all profiles" ON user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Usage Tracking Table (monthly usage per user)
CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  invoices_imported integer DEFAULT 0,
  ai_tokens_used integer DEFAULT 0,
  ai_cost_cents integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);

-- RLS for usage_tracking
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON usage_tracking
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all usage" ON usage_tracking
  FOR ALL USING (auth.role() = 'service_role');

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period
  ON usage_tracking(user_id, period_start);

-- 4. Subscription Events Table (Stripe webhook logs)
CREATE TABLE IF NOT EXISTS subscription_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  stripe_event_id text UNIQUE,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- RLS for subscription_events (only service role can access)
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage events" ON subscription_events
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Function to increment invoice usage
CREATE OR REPLACE FUNCTION increment_invoice_usage(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_count integer
) RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, period_start, period_end, invoices_imported)
  VALUES (p_user_id, p_period_start, p_period_end, p_count)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    invoices_imported = usage_tracking.invoices_imported + p_count,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Function to increment AI usage
CREATE OR REPLACE FUNCTION increment_ai_usage(
  p_user_id uuid,
  p_period_start date,
  p_period_end date,
  p_tokens integer,
  p_cost_cents integer
) RETURNS void AS $$
BEGIN
  INSERT INTO usage_tracking (user_id, period_start, period_end, ai_tokens_used, ai_cost_cents)
  VALUES (p_user_id, p_period_start, p_period_end, p_tokens, p_cost_cents)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    ai_tokens_used = usage_tracking.ai_tokens_used + p_tokens,
    ai_cost_cents = usage_tracking.ai_cost_cents + p_cost_cents,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Function to get user's current usage with limits
CREATE OR REPLACE FUNCTION get_user_usage_with_limits(p_user_id uuid)
RETURNS TABLE (
  plan_id text,
  display_name text,
  monthly_invoice_limit integer,
  monthly_ai_budget_cents integer,
  max_companies integer,
  invoices_imported integer,
  ai_cost_cents integer,
  period_start date,
  period_end date
) AS $$
DECLARE
  v_period_start date;
  v_period_end date;
BEGIN
  -- Calculate current billing period (1st of month to last day of month)
  v_period_start := date_trunc('month', CURRENT_DATE)::date;
  v_period_end := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date;

  RETURN QUERY
  SELECT
    COALESCE(up.plan_id, 'free') as plan_id,
    COALESCE(pl.display_name, 'Darmowy') as display_name,
    pl.monthly_invoice_limit,
    pl.monthly_ai_budget_cents,
    pl.max_companies,
    COALESCE(ut.invoices_imported, 0) as invoices_imported,
    COALESCE(ut.ai_cost_cents, 0) as ai_cost_cents,
    v_period_start as period_start,
    v_period_end as period_end
  FROM auth.users u
  LEFT JOIN user_profiles up ON up.id = u.id
  LEFT JOIN plan_limits pl ON pl.plan_id = COALESCE(up.plan_id, 'free')
  LEFT JOIN usage_tracking ut ON ut.user_id = u.id
    AND ut.period_start = v_period_start
  WHERE u.id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Function to check if user can import invoices
CREATE OR REPLACE FUNCTION can_import_invoices(p_user_id uuid, p_count integer DEFAULT 1)
RETURNS boolean AS $$
DECLARE
  v_limit integer;
  v_used integer;
  v_period_start date;
BEGIN
  v_period_start := date_trunc('month', CURRENT_DATE)::date;

  -- Get limit from plan
  SELECT pl.monthly_invoice_limit INTO v_limit
  FROM user_profiles up
  JOIN plan_limits pl ON pl.plan_id = up.plan_id
  WHERE up.id = p_user_id;

  -- If no profile or unlimited (null), allow
  IF v_limit IS NULL THEN
    RETURN true;
  END IF;

  -- Get current usage
  SELECT COALESCE(invoices_imported, 0) INTO v_used
  FROM usage_tracking
  WHERE user_id = p_user_id AND period_start = v_period_start;

  v_used := COALESCE(v_used, 0);

  RETURN (v_used + p_count) <= v_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to check if user can use AI
CREATE OR REPLACE FUNCTION can_use_ai(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_budget integer;
  v_used integer;
  v_period_start date;
BEGIN
  v_period_start := date_trunc('month', CURRENT_DATE)::date;

  -- Get budget from plan
  SELECT pl.monthly_ai_budget_cents INTO v_budget
  FROM user_profiles up
  JOIN plan_limits pl ON pl.plan_id = up.plan_id
  WHERE up.id = p_user_id;

  -- If null (unlimited), allow
  IF v_budget IS NULL THEN
    RETURN true;
  END IF;

  -- If 0 (no AI access), deny
  IF v_budget = 0 THEN
    RETURN false;
  END IF;

  -- Get current usage
  SELECT COALESCE(ai_cost_cents, 0) INTO v_used
  FROM usage_tracking
  WHERE user_id = p_user_id AND period_start = v_period_start;

  v_used := COALESCE(v_used, 0);

  RETURN v_used < v_budget;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Trigger to auto-create user_profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO user_profiles (id, plan_id)
  VALUES (NEW.id, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- 11. Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION increment_invoice_usage TO authenticated;
GRANT EXECUTE ON FUNCTION increment_ai_usage TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_usage_with_limits TO authenticated;
GRANT EXECUTE ON FUNCTION can_import_invoices TO authenticated;
GRANT EXECUTE ON FUNCTION can_use_ai TO authenticated;
