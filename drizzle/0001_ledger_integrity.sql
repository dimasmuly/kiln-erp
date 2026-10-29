-- Ledger integrity rules enforced by PostgreSQL itself, so they hold for every
-- code path: the app, the seed script, a psql session, a future service.

-- 1. Every journal entry balances (sum of debits = sum of credits) and has at
--    least two lines. Checked at COMMIT (deferred), because the lines of one
--    entry are inserted one statement at a time inside the same transaction.
CREATE FUNCTION assert_journal_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target bigint;
  debits bigint;
  credits bigint;
  line_count integer;
BEGIN
  -- Separate branches: PL/pgSQL resolves NEW.<column> per trigger table.
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target := NEW.id;
  ELSE
    target := NEW.entry_id;
  END IF;
  SELECT coalesce(sum(debit), 0), coalesce(sum(credit), 0), count(*)
    INTO debits, credits, line_count
    FROM journal_lines WHERE entry_id = target;
  IF line_count < 2 THEN
    RAISE EXCEPTION 'journal entry % has % line(s); at least 2 are required', target, line_count
      USING ERRCODE = 'check_violation';
  END IF;
  IF debits <> credits THEN
    RAISE EXCEPTION 'journal entry % does not balance: debits % <> credits %', target, debits, credits
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_entries_have_lines
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();
--> statement-breakpoint

-- 2. Ledgers are append-only. Accounting corrections are reversing entries;
--    stock corrections are adjustment movements. History is never rewritten.
CREATE FUNCTION reject_ledger_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Post a reversing or adjusting entry instead.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER journal_entries_append_only BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER journal_lines_append_only BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_movements_append_only BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION reject_ledger_mutation();
