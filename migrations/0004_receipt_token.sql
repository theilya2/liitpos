create index if not exists pos_docs_public_token_idx
  on pos_docs ((doc->>'publicToken'))
  where kind = 'sale' and deleted = false and coalesce(doc->>'publicToken', '') <> '';
