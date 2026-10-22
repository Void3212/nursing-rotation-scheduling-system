# SchedMom Rotation Planner

A nursing clinical rotation planner with editable area capacities, NOC eligibility and weekly coverage requirements, schedule generation, validation, tracking, CSV export, local schedule history, and optional Supabase synchronization.

## Run locally

```bash
npm install
npm run dev
```

The planner works without cloud credentials and stores configuration and schedules in the current browser. To enable shared cloud schedule history:

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the project API settings. The legacy anon key can be used as the publishable key value; never put a service-role key in a browser environment variable.
3. Apply the SQL migrations in `supabase/migrations` in filename order. If the first migration was already applied, apply `20261022000000_schedule_preferences.sql` to add any missing schedule columns, enable preferred schedules, and refresh the API schema cache.
4. Enable email authentication and configure the project's allowed redirect URLs to include the local app URL and deployed app URL.
5. Restart the dev server, open Settings, request an email sign-in link, and follow the link. Cloud history is available to authenticated users; local saves remain available without signing in.

The generator assigns one group per week where configured capacity allows. It fills AM capacity first in each category and uses PM only after all AM capacity in that category is occupied. Area capacity is enforced independently for each shift. Schedules can be explicitly marked as preferred; for matching configurations, generation tries alternatives and favors assignments that appear in preferred schedules while prioritizing rule compliance. Missing group assignments and category completion are shown as watch-outs, so they do not prevent a schedule from being preferred.

## Checks

```bash
npx tsc --noEmit
npm run build
```
