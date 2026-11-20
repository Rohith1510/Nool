# Nool / நூல்

Voice AI for garment order decisions. A Next.js 16 workspace backed by Supabase PostgreSQL, Auth, and Realtime. Compare deterministic shipment plans, submit a versioned proposal, and have production approve the resource changes atomically.

## Run locally

Requires Node.js 22+ and npm. On Windows PowerShell with script restrictions, use `npm.cmd` instead of `npm`.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Without credentials the app opens an actionable setup screen. Operational views never fall back to browser storage or fabricated records. Fonts are self-hosted. Keep `.env.local` private; it is ignored by Git.

## Supabase and accounts

1. Create a Supabase project. Put its URL and **publishable** key into the two `NEXT_PUBLIC_SUPABASE_*` variables. Put its **secret** key (or legacy `service_role` key) in `SUPABASE_SECRET_KEY` on the server only.
2. Apply the four files in `supabase/migrations` in filename order using the Supabase SQL editor. Alternatively, link the Supabase CLI project and run `supabase db push`. Do not run migrations against an unrelated existing schema.
3. Set Supabase Auth's Site URL to your app origin. Allow redirect URLs `http://localhost:3000/**` and `https://<your-vercel-deployment>/**`. Sign-in currently uses email/password and does not require an OAuth callback route. Disable public sign-ups if accounts are administrator-provisioned.
4. Run `npm run seed`. This creates **Threadworks — sample company**, persisted orders, two buyers, two lines, primary and alternative fabrics, material reservations, and dated working slots. It provisions separate merchandiser and production-lead Auth accounts and prints random passwords once. Save them securely. The seed never overwrites an existing sample company. A repeated run exits without changing records or passwords.
5. Open two browser profiles: sign in as the merchandiser in one and the production lead in the other. An account cannot choose its role in the UI. Memberships determine organization access and approval permission.

Optional seed settings: `DEMO_REFERENCE_DATE` (default `2026-11-23`), `DEMO_MERCH_EMAIL`, `DEMO_LEAD_EMAIL`. The reference date is persisted on the sample organization so its scenario does not age out. Use a Monday reference date to preserve the illustrated work week. Production organizations should have `reference_date = null`; their planning clock uses Asia/Kolkata. Configure their master data through controlled administrative provisioning; this first workflow does not include an order-entry or organization-management console.

If an interrupted seed created Auth accounts but not the organization, rerun with unused demo email addresses (or remove only those unused Auth accounts in Supabase). Database sample insertion itself is transactional. Create non-sample organizations and memberships through an administrator; clients have no direct write access to these tables.

## Demo walkthrough

1. Open **Orders → #1042, North & Form**. Original quantity: 500; completed: 200; requested change: 600.
2. Choose **Evaluate change**. Standard production supports 500 pieces by 27 November. Compare **500 on 27 November + 100 on 28 November**, or all 600 on 28 November. Production completion and shipment readiness are shown separately.
3. Expand **Could another line help?** Line B already holds 300 pieces for **#1048 / Studio Common**, also committed for 27 November. The plans preserve that allocation.
4. Select the split plan. Check the sizes and assumptions, confirm, and submit. A stored proposal reference appears. Submission does not reserve additional resources.
5. In the production-lead profile, open **Approvals**, inspect original versus proposed commitments, then **Approve plan → Confirm approval**. The order, material reservation, allocations, tasks, and audit event change in one transaction. Edit and save the generated buyer message. Nothing sends email automatically.
6. Open **Production** to inspect the four created tasks. To demonstrate adaptation, increase Line B's 25 November standard capacity from 100 to 200, with a reason. Return to the order, request 600 by the original 27 November date, and evaluate again. The full same-date plan is now feasible. Existing allocations remain protected.
7. To demonstrate staleness, submit a proposal before a capacity/stock edit, then review it after the edit. Recalculate from live records and submit a new proposal version. A stale proposal cannot be applied.

All dates shift relative to `DEMO_REFERENCE_DATE`. Other examples: remove enough unreserved stock to produce a fabric shortfall; enable configured overtime to compare a same-date overtime plan. Stock cannot fall below existing reservations. Materials CSV format is `code,delta_kg,reason`; up to 100 rows, with row validation and all-or-nothing application.

## Live voice

This implementation consistently uses **Agora Conversational AI Engine v2** at `https://api.agora.io/api/conversational-ai-agent/v2/projects/{appid}` with `/join` and `/agents/{id}/leave`, Basic REST authentication, Agora Web RTC 4.x, and `agora-token`. It does not use the separate Platform Preview API or Gemini Live.

Pipeline: Agora-managed **Deepgram Nova 3 ASR → Gemini text LLM with custom tools → Murf Falcon streaming TTS → RTC audio**. Gemini uses the documented native `style: gemini` / `streamGenerateContent` configuration. Agora exposes six synchronous HTTPS tools with alphanumeric names (`findOrders`, `getOrderContext`, `evaluateOrderChange`, `selectChangePlan`, `getProposal`, `createChangeProposal`). The same calculation and submission backend serves clicks and voice.

Configure:

- `NEXT_PUBLIC_AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`: enable token-based access and Conversational AI in Agora Console. App ID is public; certificate is secret.
- `AGORA_CUSTOMER_ID`, `AGORA_CUSTOMER_SECRET`: Agora REST customer credentials, not the App Certificate. Ensure the project has access/billing for managed Deepgram and custom tool calling.
- `GEMINI_API_KEY`, `GEMINI_MODEL`: an available text model supporting function calling. The example model follows the current Agora Gemini documentation; change it to a model available to your Google account. No unsupported fallback model is silently selected.
- `MURF_API_KEY`, `MURF_VOICE_ID`, `MURF_LOCALE`: a streaming Falcon-enabled Murf account and compatible English voice (the Agora example uses `Matthew`, `en-US`). Model is `FALCON`; endpoint is `wss://global.api.murf.ai/v1/speech/stream-input`. Verify voice access in your Murf account.
- `APP_URL`: the public **HTTPS origin** of this app, with no path. Agora must reach its `/api/voice/tools/*` endpoints directly, without deployment protection, login redirects, or an interstitial. Tool authentication is session-scoped and does not use a browser cookie.
- `AGORA_TOOL_SECRET`: an independent random secret of at least 32 bytes. Generate with the command in `.env.example`.

For local work use an HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:3000`, and put its HTTPS origin in `APP_URL`. Alternatively deploy to a Vercel development/preview deployment and use that public URL. Set `NEXT_PUBLIC_APP_URL` to the origin used by the browser. Restart development after environment changes; rebuild/redeploy production after configuration changes.

Voice sessions are bound to the signed-in user, organization, and selected order. A unique database constraint prevents duplicate active sessions even across tabs. Credentials expire after 10 minutes; expiry/disconnection releases the mic, and provider idle timeout is 30 seconds. The UI shows real transcript messages and tool operations, never simulated conversation progress. RTC protocol v2 chunked messages are decoded and partial turns updated in place. Permission denial, provider failure, expired tokens, failed stop requests, and disconnected states have recovery paths. Reconnecting starts a new session and retrieves current context; transcripts are ephemeral rather than persisted audio recordings.

**Durable cleanup is required for production:** set `CRON_SECRET` and configure an external scheduler to call `GET https://<your-deployment>/api/voice/cleanup` every five minutes with the header `Authorization: Bearer <CRON_SECRET>`. The repository intentionally has no Vercel cron schedule, so deployment works on Hobby. On a Vercel plan supporting five-minute cron jobs, you can instead add `{"crons":[{"path":"/api/voice/cleanup","schedule":"*/5 * * * *"}]}` to `vercel.json`. This reaps expired agents even if a tab disappears. Without a scheduler, the browser and RTC expiry/idle behavior still operate, but cleanup after an interrupted provider request is not guaranteed on your preferred schedule. The cleanup endpoint never accepts the tool secret as authorization.

English is the supported conversation language. Tamil/code-mixed speech is intentionally not advertised: it requires a compatible multilingual ASR/Murf voice combination and actual code-mixed calls. Those checks cannot be inferred from locale names.

Official integration references checked during implementation:

- [Agora Engine v2 join](https://docs.agora.io/en/api-reference/api-ref/conversational-ai/join) and [leave](https://docs.agora.io/en/api-reference/api-ref/conversational-ai/leave)
- [Custom HTTPS tools](https://docs.agora.io/en/ai/build/tools/custom-tools), [managed ASR](https://docs.agora.io/en/ai/build/managed-mode), [Gemini configuration](https://docs.agora.io/en/ai/models/llm/gemini), [Murf configuration](https://docs.agora.io/en/ai/models/tts/murf)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling), [Agora RTC v2 transcript reference implementation](https://github.com/AgoraIO-Conversational-AI/vibe-claude)
- [Supabase SSR auth](https://supabase.com/docs/guides/auth/server-side/nextjs)

## Calculation and approval rules

- Material is remaining on-hand stock in kg; reservations are **unconsumed** kg. Consumed material is separate. Remaining quantity × kg/garment × (1 + wastage) is rounded **up** to a gram using integer arithmetic. Existing own reservations are reusable; other orders' reservations are unavailable.
- Preserve completed garments, per-size completions, and their material use. Proportional size scaling uses largest remainders to maintain an exact integer total; explicit size splits must match the quantity and preserve each completed size.
- Capacity is garments per compatible line per recorded working date. Re-evaluation releases only this order's uncompleted work. Completed standard and overtime use remain protected. Overdue unfinished allocations block optimistic rescheduling.
- Finishing uses configured calendar days. Completed pieces are conservatively treated as awaiting finishing. Shipment can occur on any calendar day; transit/delivery is shown only when configured. No unrecorded working day supplies capacity. The model does not simulate shift sequencing, packing, transport bookings, or alternative-fabric approvals.
- Overtime is opt-in and bounded by configured slot capacity. Money is integer paise. Additional fabric, garment conversion, and overtime use configured costs. Split freight has no configured rate in this initial schema, so split plans explicitly show **cost unavailable**. Estimates are not approved commitments.
- The application server re-evaluates and seals proposals; clients cannot write arbitrary allocations or trusted evaluation data. The proposal stores the complete evaluation inputs and original versions.
- Every resource mutation locks the organization row first. This deliberately serializes changes within one organization: simple and safe for the initial team workflow, with less throughput than resource-specific locking. Approval checks the actor's production role, tenant, status, planning date, order/resource versions, live fabric, compatibility, capacity, sizes, finishing, and shipment totals before applying all writes atomically.
- Repeated proposal submissions use an idempotency key; repeated approvals return the recorded result. Two competing approvals serialize; one changing the resource version makes the other stale. Any resource edit conservatively invalidates pending proposals, even if the changed resource was unrelated. Failed SQL operations roll back.
- Task completion consumes the corresponding reservation, lowers on-hand stock, and updates completed garments and sizes transactionally. It records sewing completion, not finishing certification. Completed tasks cannot be undone. Open tasks are replaced when a new plan supersedes them. Audit history retains the old proposal.
- Realtime subscriptions refresh connected screens; focus and 30-second polling recover when Realtime is unavailable. Filters are stored in URLs. Memberships and composite foreign keys enforce organization boundaries; RLS protects all operational reads. Privileged keys stay server-only.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

`npm test` runs deterministic calculations, CSV/voice credential tests, and the **actual migration/RPC SQL in PGlite's PostgreSQL engine**, including rollback, RLS, stale/repeated/competing approvals, and task consumption. PGlite serializes queries; its competing-request test checks outcomes and conservation but does not replace a two-connection lock-contention test against hosted PostgreSQL.

Browser smoke tests use installed Chrome and check setup/sign-in and unauthenticated writes at `E2E_BASE_URL`. For the complete browser workflow use a **freshly seeded sample Supabase project**, set `E2E_RUN_WORKFLOW=1` and both E2E account credentials in `.env.local`, run the app, then `npm run test:e2e`. This explicitly applies a proposal and edits sample capacity. Live Supabase/Auth/Realtime and Agora/Gemini/Murf calls require your credentials; tests never manufacture a successful provider call.

## Deploy

Import the existing GitHub repository into Vercel, use the Next.js preset, and set the variables from `.env.example` for the appropriate deployment environment. Run migrations against the target Supabase project before exposing the app. Set the public HTTPS callback origin and Supabase Auth URLs for that deployment. Configure the cleanup schedule described above. Server routes use the Node runtime and are Vercel-compatible. There is no filesystem-backed runtime database and no dependency on a persistent application process.
