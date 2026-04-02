-- Seed data for dev iteration
-- Run: psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql

INSERT INTO projects (id, name, dapp_url, wallet_public)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Stellar Vault (dev)',
    'https://stellar-vault.app',
    'GBIIN6LPRALOZZBATMBCZJSXH3MWIAHV7GNFNQW7BVDYSTXKGMHV66NQ'
);
