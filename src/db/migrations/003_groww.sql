-- Multi-broker: allow Groww connections alongside Zerodha.
ALTER TABLE broker_connections DROP CONSTRAINT IF EXISTS broker_connections_broker_check;
ALTER TABLE broker_connections
  ADD CONSTRAINT broker_connections_broker_check CHECK (broker IN ('zerodha', 'groww'));

-- Track which broker a snapshotted holding came from (null = manual CSV).
ALTER TABLE holdings_snapshot ADD COLUMN IF NOT EXISTS broker TEXT
  CHECK (broker IN ('zerodha', 'groww'));
