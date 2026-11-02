-- Game state: single-row flag closing the game (cahier des charges §3.4).
-- Once closed: no new auction, no new bid; sales in flight end normally.
CREATE TABLE game_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ
);

INSERT INTO game_state (id, closed) VALUES (1, FALSE) ON CONFLICT (id) DO NOTHING;

-- Hot paths of the background scanner (open due / close due).
CREATE INDEX auctions_scheduled_idx ON auctions (scheduled_at) WHERE status = 'scheduled';
CREATE INDEX auctions_open_idx ON auctions (ends_at) WHERE status = 'open';
