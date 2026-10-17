create table if not exists pos_docs (
  user_id text not null,
  id text not null,
  kind text not null,
  business_id text not null default '',
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  doc jsonb not null,
  primary key (user_id, id)
);

create index if not exists pos_docs_user_updated_idx on pos_docs (user_id, updated_at);
