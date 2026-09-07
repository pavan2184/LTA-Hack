# Supabase TLS trust

`supabase-ca.crt` is the public Supabase Root 2021 CA downloaded on 2026-09-07
from the certificate link in RailPlan Dev → Database Settings → SSL configuration:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

It expires 2031-04-26. It is public trust material, not a database credential.
The database client verifies both certificate trust and hostname. Update this
certificate from the official dashboard if Supabase rotates its CA.
