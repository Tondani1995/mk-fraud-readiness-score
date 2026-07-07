# Deployment gate

This private repository is now aligned for Vercel import from main.

Runtime status:
- Supabase dev schema has been migrated and verified.
- Expected counts were confirmed: 10 domains, 68 questions, 8 exposure factors, 19 critical controls and 17 hard gates.
- Admin Auth user and admin profile have been created in Supabase dev.

Guardrails:
- This is a new separate Vercel project.
- Do not connect score.mkfraud.co.za until Phase 13.
- Do not change the existing fraud-website Vercel production project.
