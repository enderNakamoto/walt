-- Seed data for dev iteration
-- Run: psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/seed.sql

-- Demo project: Sentinel Stellar Vault
INSERT INTO projects (id, name, dapp_url, wallet_public)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Sentinel Vault',
    'https://sentinel-stellar-2.vercel.app/',
    'GBIIN6LPRALOZZBATMBCZJSXH3MWIAHV7GNFNQW7BVDYSTXKGMHV66NQ'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    dapp_url = EXCLUDED.dapp_url;
