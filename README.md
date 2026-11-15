# EduAI School ERP

Next.js school ERP with Supabase authentication/database and a role-specific AI Studio powered by one NVIDIA model.

## Quick start

1. Install Node.js 20.9 or newer.
2. Copy `.env.example` to `.env.local` and enter your own Supabase and NVIDIA credentials.
3. Run the database SQL described in `AI-SETUP.md`.
4. Run `npm install` and `npm run dev`.
5. Open `http://localhost:3000`.

Read `AI-SETUP.md` for the single-model AI configuration, syllabus migration, role permissions and troubleshooting.

Never commit `.env.local`, API keys, service-role credentials, `node_modules`, `.next` or build output.

## Realtime + speed (v2)
1. Run `db/migrations/20261113_realtime.sql` once in the Supabase SQL editor (turns on Realtime for the app's tables).
2. `lib/live.tsx` holds the live subscription, an instant client cache, and the `useLive` hook used by pages.

## Multi-school (v3)
Run `db/migrations/20261115_multi_school.sql` in the Supabase SQL editor **before** deploying this version
(fresh installs: `db/schema.sql` already includes it). Existing data moves into a school named "My School".
New schools register at `/admin/setup` and get their own isolated data.
