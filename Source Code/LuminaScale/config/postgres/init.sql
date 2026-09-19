CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('resident', 'manager', 'maintenance', 'admin')),
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  building_id TEXT NOT NULL,
  apartment_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  firmware_version TEXT,
  certificate_status TEXT NOT NULL DEFAULT 'simulated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS devices_location_idx ON devices(building_id, apartment_id);

CREATE TABLE IF NOT EXISTS lighting_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id TEXT,
  apartment_id TEXT,
  lux_threshold DOUBLE PRECISION NOT NULL CHECK (lux_threshold >= 0),
  motion_required BOOLEAN NOT NULL DEFAULT true,
  brightness INTEGER NOT NULL CHECK (brightness BETWEEN 0 AND 100),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lighting_rules_scope_idx
  ON lighting_rules(COALESCE(building_id, '*'), COALESCE(apartment_id, '*'));

INSERT INTO lighting_rules(building_id, apartment_id, lux_threshold, motion_required, brightness, enabled)
VALUES (NULL, NULL, 80, true, 70, true)
ON CONFLICT DO NOTHING;

INSERT INTO users(email, password_hash, role)
VALUES ('manager@local.example', 'DEMO_ONLY_USE_A_REAL_HASH_IN_PRODUCTION', 'manager')
ON CONFLICT (email) DO NOTHING;

