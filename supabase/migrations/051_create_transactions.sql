-- Transaction wire (issue #125): processed waiver claims (including failed bids with FAAB amounts),
-- free-agent pickups and accepted trades, synced from the ESPN service's /transactions endpoint.
--
-- The endpoint already drops lineup moves and still-pending claims (pending bids would reveal
-- every team's offer before the waiver run), so nothing here needs to filter on status. A claim
-- that is pending when one sync runs simply arrives, already EXECUTED or FAILED_*, in a later one.
--
-- `items` is a JSONB array of {action, player_name, position, pro_team, from_espn_team_id,
-- to_espn_team_id} rather than a child table: it is only ever read back whole alongside its
-- transaction, never queried or joined by player. Teams are stored as ESPN team ids, not FKs to
-- `teams`, and joined by (season_year, espn_team_id) at read time -- the same decision ESPN makes
-- for its own ids, and it keeps a sync from failing if a team row isn't paired yet.
--
-- UPSERT keyed on ESPN's transaction UUID, same shape and rationale as sync_matchups (042): a
-- transaction has stable identity across syncs, and the endpoint returns the whole season every
-- time. Rows are never deleted -- a sync that no longer returns one (ESPN trimming old history)
-- must not erase it from the wire.
--
-- Commissioner-gated plus the service_role branch (043) from the start, so the scheduled sync can
-- call it without a follow-up migration.

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year INTEGER NOT NULL,
  espn_transaction_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('WAIVER', 'FREEAGENT', 'TRADE')),
  status TEXT NOT NULL,
  espn_team_id INTEGER NOT NULL,
  bid_amount NUMERIC(6,2) NOT NULL DEFAULT 0,
  week_number INTEGER NOT NULL,
  proposed_at TIMESTAMPTZ NOT NULL,
  -- Null when ESPN reports no process date (an accepted trade carries none).
  processed_at TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(season_year, espn_transaction_id)
);

CREATE INDEX idx_transactions_season_week ON public.transactions(season_year, week_number);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Same shape as matchups' own policies: public read, commissioner-only write.
CREATE POLICY "Public can view transactions"
  ON public.transactions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Commissioner can manage transactions"
  ON public.transactions FOR ALL
  TO authenticated
  USING (public.jwt_has_role('commissioner'));

-- The ON CONFLICT DO UPDATE carries a WHERE clause so an unchanged transaction is a no-op
-- (ROW_COUNT 0) rather than an unconditional write, which keeps 'updated' meaningful -- same
-- reasoning as sync_matchups. In practice only status/processed_at/items ever change after the
-- first sync, but every synced column is compared so a correction from ESPN isn't missed.
CREATE OR REPLACE FUNCTION public.sync_transactions(
  p_season_year integer, p_transactions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_txn jsonb;
  v_updated_count integer;
  v_results jsonb := '[]'::jsonb;
BEGIN
  IF NOT (public.jwt_has_role('commissioner') OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Commissioner access required.';
  END IF;

  FOR v_txn IN SELECT * FROM jsonb_array_elements(p_transactions)
  LOOP
    INSERT INTO public.transactions (
      season_year, espn_transaction_id, kind, status, espn_team_id, bid_amount,
      week_number, proposed_at, processed_at, items, synced_at
    )
    VALUES (
      p_season_year,
      v_txn->>'espn_transaction_id',
      v_txn->>'kind',
      v_txn->>'status',
      (v_txn->>'espn_team_id')::integer,
      (v_txn->>'bid_amount')::numeric,
      (v_txn->>'week_number')::integer,
      (v_txn->>'proposed_at')::timestamptz,
      (v_txn->>'processed_at')::timestamptz,
      COALESCE(v_txn->'items', '[]'::jsonb),
      now()
    )
    ON CONFLICT (season_year, espn_transaction_id) DO UPDATE SET
      kind = EXCLUDED.kind,
      status = EXCLUDED.status,
      espn_team_id = EXCLUDED.espn_team_id,
      bid_amount = EXCLUDED.bid_amount,
      week_number = EXCLUDED.week_number,
      proposed_at = EXCLUDED.proposed_at,
      processed_at = EXCLUDED.processed_at,
      items = EXCLUDED.items,
      synced_at = now()
    WHERE
      public.transactions.kind IS DISTINCT FROM EXCLUDED.kind
      OR public.transactions.status IS DISTINCT FROM EXCLUDED.status
      OR public.transactions.espn_team_id IS DISTINCT FROM EXCLUDED.espn_team_id
      OR public.transactions.bid_amount IS DISTINCT FROM EXCLUDED.bid_amount
      OR public.transactions.week_number IS DISTINCT FROM EXCLUDED.week_number
      OR public.transactions.proposed_at IS DISTINCT FROM EXCLUDED.proposed_at
      OR public.transactions.processed_at IS DISTINCT FROM EXCLUDED.processed_at
      OR public.transactions.items IS DISTINCT FROM EXCLUDED.items;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    v_results := v_results || jsonb_build_object(
      'espn_transaction_id', v_txn->>'espn_transaction_id', 'updated', v_updated_count > 0
    );
  END LOOP;

  RETURN v_results;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_transactions(integer, jsonb) TO authenticated, service_role;
