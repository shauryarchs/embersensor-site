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
- Follow the work workflow in "Shared EmberSensor rules" below (issue first, `shaurya/<issue-number>_<issue-title>` branches, PRs, no merge without approval)
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
- The site is fronted by Cloudflare CDN, which caches `script.js` and `style.css` for ~4 hours. Every reference to those files in HTML uses a `?v=YYYYMMDD` query string for cache-busting. **Whenever you edit `docs/script.js` or `docs/style.css`, also bump the `?v=` value in every `docs/*.html` file** so the new version reaches visitors immediately. Easiest: `sed -i '' 's|?v=OLD|?v=NEW|g' docs/*.html`. Use today's date as the new value.

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

## Shared EmberSensor rules

> This section is identical in every EmberSensor repository. Update all four copies together.

### Related repositories
All under `github.com/shauryarchs`:
- `embersensor-site` — website (`docs/`) and Cloudflare Worker API (`worker/`). The hub: every device and client talks only to the Worker. **Issues for all repositories are tracked here.**
- `embersensor-ios` — iOS app; reads `/api/status`, `/api/fires`, `/api/calfire-fires`.
- `sprinkler-slide-pan-tilt` — Arduino Nano ESP32 firmware for the sprinkler slider and pan/tilt arm; polls `/api/motor/command`, pushes `/api/motor/state`.
- `fireguard-rachio` — Arduino UNO R4 WiFi sensor node; POSTs readings to `/api/update`, reads `riskIndex` from `/api/status`, and starts the Rachio sprinkler zone when `riskIndex > 7`.

Changing a Worker endpoint or response field can break the website, the iOS app, and both firmware projects — check all consumers.

### Work workflow (required for all new work)
1. **Create an issue first** in `embersensor-site` describing the task, scope, and acceptance criteria — even if the work is in another repository.
2. **Before making changes, create a branch** in each repository involved, named `shaurya/<issue-number>_<issue-title>` using the `embersensor-site` issue number and a short, lowercase, hyphenated title. Example: `shaurya/42_add-sprinkler-controls`.
3. Complete the work on those branches and run the relevant checks.
4. **Open a pull request in each affected repository**, referencing the issue (e.g. `shauryarchs/embersensor-site#42`) and summarizing the changes and validation.
5. **Do not merge until the repository owner explicitly approves.**
6. After approval, merge each PR into its `main` branch. Close the issue once all work covered by it has been merged.

### No AI attribution
Do not include any reference to "Claude" (or other AI-tool attribution) in code, comments, documentation, filenames, commit messages, branch names, issues, pull requests, or other project artifacts. This includes `Co-Authored-By` trailers and "Generated with …" footers. Commit messages describe the actual change only. Before committing or pushing, check that no such attribution or generated signature has been added.

The one intentional exception is this instructions file (`CLAUDE.md`), which stays tracked so every contributor shares the same instructions.

### Safety
- Keep any **new automatic sprinkler activation or motor movement disabled** until it has been reviewed and validated with the repository owner.
- `flame` is **active-low**: `0` means flame detected. It forces `riskIndex = 10`, which makes FireGuard start the real sprinkler zone. Test or "reset" payloads sent to `/api/update` must use `"flame": 1` unless deliberately simulating a fire.
- Never commit or expose secrets, tokens, Wi-Fi credentials, or access codes.

### Hardware work
- Confirm the exact part model and interface before implementing (ask for a product link or photo if ambiguous).
- Verify compatibility with the actual board — voltage levels, power, memory, and existing pin assignments — using the manufacturer's documentation.
- PRs for hardware changes include: a wiring table (component pin → board pin), power requirements and extra components, mounting guidance, required libraries and configuration, and a step-by-step initial test with expected results.
- Clearly separate checks done in software from tests that require the physical hardware, and document assumptions and limitations.

### Reviews and findings
- Support findings with file paths and function names.
- Distinguish what the code confirms from what is inferred. Documentation and comments alone are not proof that something is implemented.
