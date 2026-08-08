CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER,
  date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'ILS',
  merchant TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  source TEXT NOT NULL CHECK (source IN ('scraped', 'manual')),
  dedup_hash TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO categories (name) VALUES
  ('Groceries'), ('Dining'), ('Transport'), ('Utilities'),
  ('Shopping'), ('Entertainment'), ('Health'), ('Housing'), ('Other')
ON CONFLICT (name) DO NOTHING;
