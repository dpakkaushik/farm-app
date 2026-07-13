# Database migrations

The schema for this app lives in Supabase. **Every change to it belongs in a
migration file here** — do not hand-edit the schema in the Supabase dashboard.

## Why

The dashboard-only approach cost us real bugs. Because RPCs, RLS policies and
triggers existed only in the dashboard, nothing in the repo revealed that:

- `get_invite_preview` and `create_farm_with_membership` were called by the
  client but defined nowhere in version control
- `farm_invitations` had no UPDATE policy, so `accepted_at` was never stamped
  and invite links stayed replayable
- nothing created a `user_profiles` row, so every invited user was locked out
  at login with "Account not set up yet"

Each of those surfaced one at a time, as a user getting stuck. A migration file
is reviewable; a dashboard click is not.

## Applying a migration

Paste the file into the **Supabase SQL Editor** and run it. All migrations here
are written to be idempotent — re-running one is safe.

Or, with the Supabase CLI:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

## Writing one

- Prefix with the next number: `0002_short_description.sql`
- Make it idempotent (`create or replace`, `drop ... if exists`, `on conflict do nothing`)
- Open with a comment explaining **why** — the symptom it fixes, not just the DDL
- If the client calls an RPC, that RPC's definition must be in a migration here

## Known gaps not yet migrated

- The **Admin → Users** tab (`createUser` in `store/auth.js`) inserts into
  `user_profiles` and never creates a `farm_memberships` row. It is a leftover
  from before multi-tenancy: users created there can log in but belong to no
  farm. Use **Farm Settings → Invite** instead. The tab should be removed or
  rewritten to issue an invitation.
