CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  points_total INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lutins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seed BIGINT NOT NULL,
  name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('commun','rare','epique','legendaire')),
  manifest JSONB NOT NULL,          -- {slot_id: asset_id} + meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lutin_id UUID NOT NULL REFERENCES lutins(id),
  start_price INTEGER NOT NULL,
  increment INTEGER NOT NULL DEFAULT 10,
  duration_s INTEGER NOT NULL DEFAULT 90,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','open','ended','cancelled')),
  opened_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  current_amount INTEGER,           -- enchère courante (escrow implicite)
  current_bidder UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  final_price INTEGER
);

CREATE TABLE bids (
  id BIGSERIAL PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bids_auction_idx ON bids (auction_id, id);

CREATE TABLE events (               -- journal append-only → resync par seq
  seq BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
