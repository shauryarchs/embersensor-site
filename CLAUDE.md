# CLAUDE.md

This repository contains the EmberSensor website and Cloudflare Worker backend.

Repo structure:
- `docs/` = static website files
- `worker/` = Cloudflare Worker backend API

Primary goals:
- Preserve existing behavior unless a change is explicitly requested
- Keep the public website simple, fast, and easy to maintain
- Keep Worker endpoints stable and backward-compatible when possible
- Prefer small, low-risk edits over broad rewrites
- Keep code easy to debug

Project context:
- EmberSensor is a wildfire monitoring and response project
- The Worker combines sensor data, weather data, and wildfire hotspot data
- The website and iOS app both depend on API responses from the Worker
- API compatibility matters because frontend and mobile clients may already rely on field names

General rules:
- All new git branches should start with `shaurya/` unless specifically instructed otherwise
- Do not change API response shapes unless explicitly asked
- If an API change is necessary, explain it first and identify affected clients
- Do not remove or rename endpoints unless explicitly asked
- Do not commit or expose secrets, tokens, or credentials
- Prefer incremental refactors over full rewrites
- Preserve existing behavior unless the task specifically asks for behavior changes
- When uncertain, inspect relevant files first and summarize findings before editing

Rules for `worker/`:
- Keep Cloudflare Worker code modular and readable
- Validate inputs for API routes
- Keep caching behavior explicit and easy to reason about
- Preserve KV namespace usage unless explicitly asked to redesign it
- Do not hardcode secrets
- Keep external fetch logic resilient and easy to debug
- When changing risk or fire evaluation logic, clearly explain the before/after behavior
- Maintain clean JSON responses with stable field names

Rules for `docs/`:
- Preserve the current site style unless explicitly asked to redesign it
- Prefer small HTML/CSS/JS changes over framework rewrites
- Keep pages lightweight and static-hosting friendly
- Reuse shared patterns instead of duplicating markup or script logic
- Do not break navigation between pages

When making changes:
1. First inspect the relevant files
2. Summarize the current behavior
3. Propose the minimal change
4. Make the edit
5. Summarize exactly what changed and any downstream impact

Preferred output style:
- Be concise
- Show file-by-file impact
- Call out API contract changes explicitly
- For non-trivial edits, mention risks and suggested validation steps
