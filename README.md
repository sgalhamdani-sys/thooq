# ذَوق · Thooq

> An Arabic-first AI agent that turns a group's shared cultural preferences into a gathering plan everyone can enjoy.

## The problem

Planning a Saudi gathering is rarely as simple as picking a popular restaurant. Hosts need to balance different tastes, generations, budgets, and the desired atmosphere—often through a long and inconclusive group chat.

## The solution

**Thooq (ذَوق)** is a culturally intelligent planning agent for Saudi gatherings.

1. The host creates an occasion and provides its goal, city, group size, age groups, and practical constraints.
2. Each guest answers three quick prompts and shares three favourites for each: cultural media, favourite places/experiences, and their ideal gathering mood.
3. Thooq resolves every guest's favourites with Qloo, finds places for each guest's taste and for the group, and ranks a shortlist against **each guest separately**.
4. A planning agent (Gemini function calling over Qloo tools) turns moods and constraints such as small children, budget or a quiet atmosphere into Qloo tags, searches again when needed, checks group fit, and writes a 1–3 stop plan.
5. The host receives the plan; every place shows how many guests it suits (for example «يناسب ذوق ٣ من ٤») and which favourites connect it to them.

Instead of a generic "top places" list, Thooq can propose a calm dinner and specialty-coffee plan, a family-friendly outing, or a friends' evening based on the cultural connections the group shares.

## Why Qloo

Qloo is the product's core differentiator. A generic LLM can write a plausible recommendation, but it cannot reliably ground it in cultural affinities across music, film/TV, dining, fashion, travel, and more.

Thooq uses Qloo to:

- resolve guests' favourite cultural entities (`/search`, `/entities`);
- find places in the event city for each guest's taste and for the combined group (`/v2/insights`, recommend);
- rank one shortlist against each guest's own favourites to measure group fit (`/v2/insights` with `filter.results.entities`, rank);
- map moods and practical constraints to Qloo tags (`/v2/tags`) that filter or steer the next search; and
- provide the evidence shown to the host: fit counts and the favourites that connect a place to each guest.

Without Qloo there is no group fit: the agent cannot see places, rank them per guest, or translate a mood into a filter.

## How the agent works

1. **Resolve.** Each guest confirms their own favourites before sending: Gemini normalizes Arabic names to English, Qloo matches each one, and the guest picks the right match, corrects the name or leaves it out. Only the confirmed Qloo IDs are used. Each guest's favourites go to Qloo in their own request (Qloo accepts at most ten signals per request).
2. **Candidates.** Qloo recommends places in the city for each guest and once for the whole group (shared favourites first, then one from each guest in turn). A ten-place shortlist takes the group's best places and each guest's best places, so nobody's taste is missing.
3. **Group fit.** For every guest, Qloo ranks the same shortlist using only that guest's favourites. A place *suits* a guest when it is in the top 40% of that guest's ranking. Places are ordered by a hybrid of the average and "least misery" group strategies (`0.5 × mean + 0.5 × minimum` of per-guest rank utility), so a place loved by one guest and disliked by the rest does not win. Saved good/bad feedback then adjusts this order slightly.
4. **Plan.** The agent receives the host's details, anonymous guests (G1, G2, …) with their favourites and mood words, and the scored shortlist. It may call `find_tags`, `search_places` and `score_group_fit` (each with a small budget) and must finish with `finalize_plan`.
5. **Guardrails.** The server owns every tool: the city filter is fixed, only tag URNs Qloo returned can be used, only places returned by tools can be chosen, and fit numbers are recomputed by the server for the final places. Guest names are never sent to Gemini. If Gemini fails or does not produce a valid plan, the page shows the fit-ranked places instead and says so. Every step is listed under «كيف وصل ذَوق لهذه الخطة؟».

Qloo results describe aggregate cultural affinities; Thooq does not use them to infer a person's identity or sensitive traits.

## Current application

The application contains:

- **Arabic and English**: Arabic-first, with a full English mode (language button on every page, `?lang=en` in links, or the browser language). The agent writes the plan in the language of the person who builds it;
- **a one-click demo**: «Try the live demo» creates a private copy of a Riyadh family lunch with four guests who have already answered, including a grandmother and children under six, so the agent has real constraints to plan around. Visitors can add themselves as a guest from the questions link;
- a landing page;
- a host dashboard for creating an occasion, sharing the guest link, viewing replies, and reading a recommendation;
- a guest flow with three prompts and three favourites per prompt, then a confirmation step where the guest checks each favourite against Qloo and chooses whether the host may see their favourites (off by default);
- a planning agent that returns a 1–3 stop plan, near alternatives, points to confirm before booking, and the steps it took;
- per-place group fit («يناسب ذوق ٣ من ٤») with the guests and favourites behind it in the host dashboard, and counts only on the shared page;
- a separate recommendation link with good/bad guest feedback and aggregate counts in the host dashboard;
- a Node.js server with same-origin API routes for occasions, guest replies, and recommendations;
- a server-only Qloo integration through the official Qloo Harness.

The live Qloo integration runs through a server-side endpoint. The browser never receives a Qloo credential.

## Run locally

### Prerequisites

- Node.js 22.19.0 or newer, including `npm`
- An event-issued Qloo credential

### Setup

```bash
npm install
qloo config set base-url https://hackathon.api.qloo.com
qloo setup --qloo
npm start
```

Open `http://localhost:3000`.

`qloo setup --qloo` saves the credential in the Harness's private configuration. Hackathon keys are valid only against `https://hackathon.api.qloo.com`, so configure that base URL before setup. For a hosted service, set `QLOO_API_KEY` as a secret environment variable in the hosting dashboard instead. Never commit a real key to this repository.

### Qloo workflow

Before Qloo entity search, the server calls Gemini to normalize the first two groups of cultural favorites into English names. Original guest replies remain unchanged. Set `GEMINI_API_KEY` in the server environment (or a private `.env` file locally); `GEMINI_MODEL=auto` discovers a compatible Flash model, or set an available model explicitly. Qloo chat provider setup does not configure this application's Gemini integration. Only favorite strings are sent for translation, without guest names. Failed or incomplete translation stops the recommendation with a clear error.

The server runs the official Qloo Harness workflow executor in-process (`recommend`, `rank`, `find_tags`), with place results restricted to the selected city and the hackathon base URL pinned. Guests resolve ambiguous names themselves when they reply; confirmed entity IDs are reused. (Replies saved before guest confirmation existed still go through a host review.) The same Gemini key powers the planning agent (see *How the agent works*); it receives anonymous guest labels, never names. A missing result or service error is shown explicitly; the app does not invent replacement places.

Run `npm.cmd run smoke` on Windows (or `npm run smoke`) for a live end-to-end check with two synthetic guests. It prints the plan, group fit, agent mode and steps, and stores nothing.

Run `npm.cmd run demo:prepare` once to resolve the demo guests' favourites with Qloo (each within its type, such as TV show or artist) and save the IDs to `demo/demo-resolved.json`. Commit that file so the hosted demo never pauses for ambiguous names. Without it, the server resolves the demo favourites live on first use.

### Share a recommendation and collect feedback

After a successful recommendation, the host dashboard shows **نسخ رابط التوصية**. This is separate from the guest questionnaire link. Guests can view the places and explanation and choose **جيدة** or **سيئة**. **تحديث التقييمات** refreshes the host's counts; **حدّثي التوصية** generates the next recommendation using saved feedback.

Each link is an unguessable token for a stored recommendation snapshot. Old links keep showing the original places, even after another recommendation is generated. Repeating the same place selection for the same inputs reuses the snapshot and its votes. Only successful recommendations with places can be shared. The shared API does not include guest names, raw answers, individual votes, or credentials. Anyone holding the link can read that snapshot and vote.

An anonymous HttpOnly, SameSite cookie permits one vote per browser per snapshot; another click updates that vote. It does not verify a real person's identity: clearing cookies or switching browsers permits another vote. The stored vote key is hashed separately for each snapshot. Feedback is on the whole recommendation, not an individual place.

Feedback improves **local ranking**, not the Gemini model or Qloo's underlying model. For later recommendations in the same city, histories with at least 25% Jaccard overlap in normalized taste labels contribute a modest positive or negative adjustment to the places they contained. Different occasions receive half the weight. Adjustments are smoothed with a two-vote prior and capped below 0.2 on a 0–1 rank scale. Only current Qloo candidates are eligible; feedback never adds invented places or bypasses the city filter. Ratings may leave the order unchanged when evidence is weak or the same candidates remain the best matches. This is a heuristic to evaluate with real feedback, not a guarantee of better recommendations.

Events, immutable recommendation snapshots, and votes are stored in `data/events.json`. Writes are serialized and replaced atomically for this single Node process, so concurrent votes and recommendation requests do not overwrite each other. Set `DATA_DIRECTORY` to a persistent storage directory when hosting. Ephemeral hosting storage can lose this history on redeployment. Multiple server instances require a shared database; the JSON store is for a single-instance prototype.

Run `npm.cmd test` on Windows (or `npm test`) for offline synthetic tests covering resolution, per-guest group fit, English and Arabic plans, the demo gathering, the agent's tool loop and guardrails, fallbacks, voting, persistence, concurrent writes, and feedback-aware ranking. Tests do not call Qloo or Gemini and do not use real guest data.

### Deploy on Render

1. Create a **Web Service** from this repository.
2. Set the build command to `npm install` and the start command to `npm start`.
3. In Render's **Environment** section, add `QLOO_API_KEY`, `GEMINI_API_KEY`, and your available `GEMINI_MODEL`. The app pins Qloo requests to the hackathon base URL. Configure persistent storage and point `DATA_DIRECTORY` to it to retain votes and guest responses across redeployments.
4. Deploy and use the public `onrender.com` URL as the Devpost demo link.

## Project structure

```
index.html       # Landing page
admin.html       # Host dashboard
guest.html       # Guest taste questions
recommendation.html # Shared recommendation and good/bad rating
recommendation.js   # Shared-page rendering and voting
plan-render.js   # Plan, group-fit and agent-steps view shared by both pages
styles.css       # Arabic-first visual design
app.js           # Browser-side interactions
server.js        # Node server and API routes
qloo-service.js  # Recommendation pipeline: resolve, candidates, group fit, plan
qloo-workflows.js # In-process Qloo Harness workflow executor (server only)
group-fit.js     # Per-guest ranking and average + least-misery group score
agent-service.js # Gemini function-calling agent over Qloo tools, with guardrails
gemini-service.js # Gemini model selection, translation and agent calls
i18n.js          # Arabic/English dictionary, language choice and page translation
copy.js          # Server-written plan text, agent steps and errors in both languages
demo.js          # Demo gathering template, Qloo pre-resolution and private demo copies
demo/demo-resolved.json # Qloo IDs for the demo favourites (from npm run demo:prepare)
scripts/live-smoke.mjs # Live end-to-end check with synthetic guests
scripts/prepare-demo.mjs # Resolves the demo favourites with live Qloo
feedback-service.js # Snapshot identity, voting and local reranking
event-store.js   # Serialized, atomic single-process JSON storage
tests/          # Synthetic integration and regression tests
```

## Technology

- HTML, CSS, and vanilla JavaScript
- Node.js HTTP server
- Qloo Hackathon Kit / Qloo Harness (in-process workflow executor)
- Gemini API (Flash) with function calling for the planning agent

## Privacy and credentials

Guests' favourites are private by default:

- each guest confirms their own favourites; the host never reviews them;
- the host sees who replied and the plan with fit counts, and sees a guest's favourites only if that guest ticks "Let the host see my favourites";
- the shared plan page shows only favourites that guests chose to share;
- the planning agent is told never to name a guest's favourites, and plan text that does is masked;
- creating a gathering returns a private host key (kept in the host's browser and in the dashboard address); the invitation link carries no key, so a guest cannot open the host dashboard or build plans.

Never commit a Qloo API key or put it in browser-side JavaScript. Credentials are configured only in a private local/server environment. The prototype's local JSON data store is intended for development; attach a persistent hosted database before relying on guest replies beyond a single demo session.

## License

MIT
