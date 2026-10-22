# SchedMom Rotation Planner

A nursing clinical rotation planner with editable rotation rules, schedule generation, validation, tracking, CSV export, local schedule history, and optional Supabase synchronization.

## Run locally

```bash
npm install
npm run dev
```

The planner works without cloud credentials and stores configuration and schedules in the current browser. To enable shared cloud schedule history:

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project API settings. The legacy anon key can be used as the publishable key value; never put a service-role key in a browser environment variable.
3. Apply `supabase/migrations/20261007000000_rotation_schedules.sql` in the Supabase SQL Editor or with the Supabase CLI.
4. Enable email authentication and configure the project's allowed redirect URLs to include the local app URL and deployed app URL.
5. Restart the dev server, open Settings, request an email sign-in link, and follow the link. Cloud history is available to authenticated users; local saves remain available without signing in.

The generator assigns one group per week where configured capacity allows. Area capacity is enforced independently for each shift. The validation report lists missing assignments, category coverage and capacity issues rather than silently exceeding a constraint.

## Checks

```bash
npx tsc --noEmit
npm run build
```
