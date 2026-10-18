-- One permanent activation code belongs to one device hash.
-- Historical request rows may repeat that code; this table is the identity.

create table if not exists activation_devices (
  device_id text primary key,
  code text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists activation_devices_code_idx on activation_devices (code);
