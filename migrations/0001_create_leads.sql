-- Quote requests from the Luxepool concept site.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT,
  pool_type TEXT,
  pool_type_label TEXT,
  start_window TEXT,
  message TEXT,
  design_json TEXT,
  design_summary TEXT,
  example_range TEXT,
  page TEXT,
  ip_hash TEXT,
  country TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);
CREATE INDEX IF NOT EXISTS idx_leads_ip_hash_created ON leads (ip_hash, created_at);
