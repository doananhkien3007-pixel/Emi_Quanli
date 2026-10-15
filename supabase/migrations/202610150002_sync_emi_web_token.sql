insert into private.app_secrets (name, token_sha256)
values ('emi_web', 'df08d6254bba718e2e9849fc2596b49046885382d5eedd1198618ed8cc6a46e1')
on conflict (name) do update
set token_sha256 = excluded.token_sha256;
