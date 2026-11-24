# Forma — an AI business studio for small businesses on QIE

A customer describes their business, buys one of four bounded creative
services for **1 QUSDC** on QIE Mainnet, follows progress and receives usable
files. Our own backend runs the workflows using OpenAI; it does not hire
other AI agents or pay third-party agent wallets.

- **Business Website** — responsive one-page site preview + source ZIP
- **Promo Video** — one 12–16s vertical MP4 + captions TXT
- **Flyers & Price List** — promotional PNG, matching PDF, price-list PDF
- **Market Report** — cited HTML/PDF brief + source CSV (needs OpenAI web research)

Settlement is QUSDC (chain 1990, `0x3F43DA82eC9A4f5285F10FaF1F26EcA7319E5DA5`,
6 decimals) through a minimal `ServiceEscrow` contract: fund → deliver →
customer accepts (or review window passes) → 1 QUSDC to the fixed treasury.
Missed delivery → customer refund. Operator refund for genuine failures.

## Status (24 Nov 2026)

Demo mode works end to end, tested against the real API with a real wallet
signature: sign-in, quote, simulated funding, worker generation, delivery
with manifest hash, private downloads, accept. Website, flyer and promo
video produce real files. The market report pipeline is built and verified
against the real OpenAI key (one live web-research call, 8,174 in / 801 out
tokens, 5 cited sources, HTML + PDF + CSV all pass their checks); it runs
in the app once `OPENAI_API_KEY` + `OPENAI_RESEARCH_MODEL` are in the
server env — the key lives in Muse's secure vault for build-time use and
must be added to Vercel env vars at deploy time. Until then the report
still fails honestly in the app, and no report is ever faked.
Live mode needs the escrow deployed on QIE mainnet and `OPENAI_API_KEY` —
both need the owner's explicit go-ahead.

## Run locally

```bash
cp .env.example .env.local   # set DATABASE_URL + SESSION_SECRET
# Postgres locally, e.g. a database named forma_dev
pnpm install
pnpm dev                     # http://localhost:3000
pnpm worker                  # background worker (separate shell)
pnpm test                    # vitest (renderers incl. real ffmpeg video)
forge test --root contracts  # escrow: 11 tests
pnpm tsx scripts/e2e-demo.ts # full demo flow vs a running dev server
```

## Architecture

```
Browser -> Next.js API -> Postgres (orders, quotes, jobs, events, artifacts)
                            |             |
                         reconciler    worker (pnpm worker / /api/worker/tick)
                            |             |-- template renderers (website, flyer, video)
                         QIE escrow       |-- OpenAI (live copy + research, when keyed)
                                          |-- quality checks + delivery manifest
```

- Auth is nonce-based wallet sign-in (SIWE-style, single-use nonce, 30-day
  httpOnly session). Connecting a wallet is not authentication.
- Prices are integers in base units, never floats. Briefs are validated with
  zod; prices/contact are printed exactly as supplied — the model never
  invents them.
- Artifacts live in private storage (`artifacts/` locally; object storage in
  production) and are served only after an ownership check.
- Demo and live modes are separated: demo receipts are always labelled demo
  and move no funds; live funding is verified from the onchain receipt and
  escrow event, never from a client-supplied hash alone.

## Configuration

See `.env.example`. Blank values are required setup, not defaults. Live mode
fails closed when `ESCROW_ADDRESS`/`TREASURY_ADDRESS` are missing. Secrets
stay server-side; `OPENAI_API_KEY` is never in the client bundle.

## Known limitations

- Production needs hosted Postgres + private object storage; local disk
  storage is dev-only.
- Market report is disabled until OpenAI research is wired (paid calls need
  approval first).
- QUSDC reserve backing/redemption are unverified; the app does not advertise
  guaranteed safety or cash redemption.
- The escrow is unaudited; source verification is not an audit.

## Original contribution

Own service studio, brand kits, scoped briefs, template renderers, quality
checks, delivery manifests with versioned hashes, and the minimal escrow.
OpenAI is an external API provider, not the product. No Syncly code,
branding or claims are used.
