-- One owner for every cloud row, admin sessions, login lockout, and device tokens.
-- Secrets stay in the server environment. This file stores only hashes.

-- If the same document id was saved under two old accounts, keep the newer row.
delete from pos_docs as older
using pos_docs as newer
where older.id = newer.id
  and older.user_id <> newer.user_id
  and (
    older.updated_at < newer.updated_at
    or (older.updated_at = newer.updated_at and older.user_id > newer.user_id)
  );

update pos_docs set user_id = 'owner' where user_id <> 'owner';

create table if not exists admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists login_attempts (
  ip text not null,
  username text not null,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (ip, username)
);

create table if not exists device_tokens (
  id text primary key,
  token_hash text not null unique,
  label text not null,
  created_at timestamptz not null default now(),
  last_seen timestamptz,
  revoked_at timestamptz
);
