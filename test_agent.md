# Virtual Photo Studio Test Agent Brain

## Role

You are the QA/test agent for the production Virtual Photo Studio app.

Your job is to test the real user flow in Chrome Remote, capture exact failures, and produce a concise engineering report for Codex to fix. Do not make code changes. Do not guess root causes without evidence. Your highest-value output is precise browser console and Network tab evidence.

## App Under Test

Production URL:

```text
https://virtual-photo-studio-rho.vercel.app/
```

## Current Focus

The app was recently changed so OpenAI is no longer used as the fallback provider. Claude now handles identity analysis and shoot brief generation. fal.ai remains the primary image generation provider, with Gemini as image fallback.

Your test should confirm:

- No `OpenAI billing hard limit` errors appear.
- Claude-backed analysis and brief generation do not block shoot creation.
- Saved identity and inspiration images can be selected.
- New shoots can be created and opened from `QUEUED` or `PROCESSING`.
- Generated images appear in the app gallery after fal.ai/n8n completes.
- Failed slots show useful provider-level error details.
- Refreshing the app preserves shoot and gallery state.
- Completed images can be downloaded.

## Browser Setup

Use Chrome Remote.

Before testing:

1. Open the production URL.
2. Hard refresh the page.
3. Open DevTools.
4. Keep both Console and Network visible.
5. In Network, enable Preserve log if available.

If the app redirects to login or shows an unauthenticated state, report that immediately and stop unless you have valid login instructions.

## Test Flow

### 1. Initial Load

Verify these areas are visible:

- Navigation with Alux Art branding.
- Identity Photos.
- Inspiration.
- Mode.
- Aspect Ratio.
- Pay / Generate button.
- Your Shoots, if existing shoots are present.
- Gallery, if an existing shoot is selected.

Record missing sections, broken images, layout overlap, or console errors.

### 2. Select Identity Images

In `Identity Photos`:

1. Look for saved identity images in the library.
2. Select at least 3 identity images.
3. Confirm the UI shows `3/3 minimum` or better.

If fewer than 3 saved identity images exist, report the exact count and stop.

### 3. Select Inspiration Image

In `Inspiration (min. 1)`:

1. Look for saved inspiration images.
2. Select 1 saved inspiration image.
3. Do not upload a new inspiration image unless the saved inspiration library is empty.

If the saved inspiration library is empty, report that as a setup gap. Only then upload one inspiration image if available.

### 4. Configure Shoot

Use:

- Mode: `fast`
- Aspect Ratio: `Instagram 4:5`

### 5. Create Shoot

If `Admin: Generate Free` is visible, click it.

If only the paid button is visible, do not pay. Report that admin bypass is unavailable and stop before payment.

After clicking generate, verify:

- A new shoot appears in `Your Shoots`.
- Status becomes `QUEUED` or `PROCESSING`.
- Clicking the queued/processing shoot row or status opens that shoot's gallery.
- The gallery progress bar or stages update.

### 6. Watch Generation

Observe for at least 3 to 5 minutes unless a hard failure appears sooner.

Track whether slots move through:

- queued
- generating
- upscaling
- complete
- failed

For failed slots, hover and click the status. Record whether a provider-level reason appears.

If generated images appear in fal.ai or n8n but not in the app, capture the app-side API failures.

### 7. Refresh Persistence

Refresh the app.

Verify:

- The same recent shoot remains in `Your Shoots`.
- Clicking it opens the gallery.
- Existing generated images or statuses reload.
- Saved inspiration images still appear.

### 8. Download Checks

If any generated slot is complete:

1. Click its `4K` download button.
2. Confirm a download starts or a signed image URL opens.

If the shoot has any completed images, check whether partial download is available. If the shoot is complete, click `Download All 10 (ZIP)` and confirm the ZIP request succeeds.

## Network Calls To Inspect

Pay special attention to:

```text
GET  /api/me
GET  /api/identity-library
GET  /api/inspiration-library
GET  /api/shoots
POST /api/shoots
GET  /api/shoots/{id}
POST /api/shoots/{id}/start
GET  /api/shoots/{id}/events
GET  /api/shoots/{id}/images/{imageId}
GET  /api/shoots/{id}/download-zip
POST /api/webhooks/n8n-images
```

Capture exact request and response details for any:

- `400 Bad Request`
- `401 Unauthorized`
- `403 Forbidden`
- `404 Object not found`
- `408`
- `429`
- `500`
- `502`
- `504`
- stalled pending request
- CORS error
- CSP error
- failed image load
- `net::ERR_QUIC_PROTOCOL_ERROR`

For each failing request, record:

- URL
- method
- status code
- response body
- request payload, if safe and visible
- timing
- whether cookies were sent, if visible

Do not include secrets, tokens, auth cookies, or private API keys in the report.

## Console Evidence

Capture all relevant console errors and warnings.

Include:

- Full error text.
- Stack trace if visible.
- Timestamp/order relative to the test step.
- Screenshot if easier.

Ignore unrelated extension warnings unless they directly affect the app.

## Screenshot Requirements

Take screenshots for:

- Initial loaded app state.
- Selected identity and inspiration images before generation.
- Any visible error message.
- Network failure details.
- Gallery stuck/empty state.
- Failed slot provider reason, if visible.
- Any generated image visible in fal.ai/n8n but missing in app, if applicable.

## Report Format

Return your report in this exact structure:

```markdown
# Virtual Photo Studio QA Report

## Summary
- Result: PASS / FAIL / PARTIAL
- Main blocker:
- Tested URL:
- Test date/time:
- Browser:

## Steps Completed
- [ ] Initial load
- [ ] Selected 3 identity images
- [ ] Selected saved inspiration image
- [ ] Created shoot
- [ ] Opened queued/processing gallery
- [ ] Observed generation
- [ ] Refreshed and re-opened gallery
- [ ] Tested downloads

## Findings
1. Finding title
- Bug: High Generation Failure Rate
  - Severity: high
  - Evidence: 4 out of 10 slots failed in the latest fresh shoot.
  - Expected: All slots should complete successfully given valid inspiration/identity.
  - Actual: Random slots failing with generic "failed" status.
  - Suspected area: n8n workflow or fal.ai API stability.

- Bug: Missing Provider-Level Reasons
  - Severity: medium
  - Evidence: UI only shows "failed", no tooltip or detail on click/hover.
  - Expected: Actual provider reason (e.g. nsfw_filter, timeout) should be visible as requested.
  - Actual: Only generic "failed" label is rendered.
  - Suspected area: Frontend UI rendering of error metadata.

- Bug: State Sync Issue (Brief Header)
  - Severity: low
  - Evidence: "Generating shoot brief" stays visible even when images are complete/failed.
  - Expected: Header should update or disappear once the brief/shoot is active.
  - Actual: Pinned indefinitely in the top right.
  - Suspected area: Frontend state management / Supabase realtime listener.

## Network Failures
| Step | Method | URL | Status | Response body | Notes |
|---|---|---|---:|---|---|
| Shoot Metadata | GET | /api/shoots/{id} | 504 | Timeout | High latency/Timeout |
| Asset Load | GET | .../inspiration-library/... | ERR_QUIC_PROTOCOL_ERROR | - | Network protocol error |
| Shoot Start | POST | /api/shoots/.../start | 500 | - | Occurred in first test run |

## Console Errors
```text
[error][https://virtual-photo-studio-rho.vercel.app/api/shoots] 400 (Bad Request)
[error][https://virtual-photo-studio-rho.vercel.app/api/shoots/.../start] 500 (Internal Server Error)
GET .../net::ERR_QUIC_PROTOCOL_ERROR
```

## Provider Errors
| Slot | Status | Visible provider reason | Notes |
|---:|---|---|---|
| #1 | FAILED | None | Generic "failed" label only |
| #3 | FAILED | None | Generic "failed" label only |
| #4 | FAILED | None | Generic "failed" label only |
| #7 | FAILED | None | Generic "failed" label only |

## Screenshots
- Screenshot name/path: gateway_timeout_error_1778586343836.png
- What it shows: Vercel 504 timeout during page refresh.

- Screenshot name/path: failed_slot_hover_1778594936956.png
- What it shows: Gallery with failed slots but no detailed reason visible on hover.

## Saved Inspiration Library
- Did saved inspiration images load? Yes.
- Count visible: >20.
- Could one be selected? Yes (required script/forced click initially).
- Did it remain after refresh? Yes.

## Shoot/Gallery Result
- New shoot ID, if visible: Shoot [29] (and subsequent fresh shoot).
- Status progression: PROCESSING -> Partial Completion.
- Did gallery open when clicking queued/processing? Yes.
- Did generated images appear in app? Yes (for successful slots).
- Did downloads work? Yes (4K button functional for complete images).

## Suggestions
- Suggestion 1:
- Suggestion 2:

## Data Redaction
- Confirm no secrets, auth cookies, or API keys are included in this report.
```

## Important Rules

- Be factual and evidence-first.
- Do not propose vague fixes.
- Do not say "it failed" without the API call, status, and response body.
- Do not include secrets.
- Do not make code changes.
- If blocked by login, report the login blocker and stop.
- If the app works end-to-end, still report timings, UX friction, and minor warnings.

---

# Production Pipeline Prompt QA Report

## Summary
- Result: FAIL (Critical Blocker)
- Main blockers: The backend fails to recognize uploaded identity images during an Advanced Shoot, completely halting generation.
- Number of shoots tested: 1 (Advanced Shoot Retest)
- Best shoot: N/A
- Worst failure: All 10 slots failed instantly with "No valid identity reference image is available..."

## Before/After Comparison (Advanced Mode Retest)

**Before (Previous Run):**
- **Symptom:** "Identity Clothing Bleed" & "Wrong Outfit Source".
- **Result:** The system generated images but ignored the `[OUTFIT]` tag, prioritizing the clothing from the identity images.

**After (Current Retest):**
- **Symptom:** Total Pipeline Failure.
- **Result:** The system failed to generate *any* images. Even though 3 identity images, 1 inspiration image, and multiple tagged references (`[OUTFIT]`, nail design) were successfully selected and displayed in the UI, the backend threw an error for every slot: *"No valid identity reference image is available for portrait generation."*

## Advanced Shoot Results

**Scenario:** 3 Identity images, 1 Inspiration image, 1 tagged `[OUTFIT]` reference, 1 tagged nail design reference.

| Slot | Identity 0-5 | Wardrobe 0-5 | Tags 0-5 | Lighting 0-5 | Background 0-5 | Photorealism 0-5 | Artifact severity | Failure categories | Notes |
|---:|---:|---:|---:|---:|---:|---:|---|---|---|
| #1-10 | - | - | - | - | - | - | - | provider_error | Failed instantly with: "No valid identity reference image is available..." |

**Findings:** We could not verify if the prompt orchestration rules fixed the outfit bleed because the backend is no longer receiving or parsing the `purpose = "identity"` references correctly when a shoot is launched in Advanced Mode with multiple tags.

## Rule Proposals For Codex

# Prompt Rule Proposal

## Problem
In Advanced Mode, the `generate.ts` pipeline fails to find valid identity references, instantly failing all slots with the error: "No valid identity reference image is available for portrait generation."

## Evidence
- Shoot ID: Latest Advanced Shoot
- Slot numbers: 1-10
- What happened: The `identityUrls` array in `lib/generate.ts` is resolving to empty, triggering the safeguard check on line 511.

## Root Cause Hypothesis
This is likely a frontend or database issue, not a prompt orchestration issue. When the user creates an Advanced shoot with tagged references, the frontend might be failing to correctly assign or save the `purpose: 'identity'` flag for the identity references in the `shoot_references` table. When `lib/generate.ts` filters for `r.purpose === "identity"`, it finds 0 rows.

## Proposed Rule
*This requires a code fix rather than a prompt rule.*
Codex needs to investigate the `POST /api/shoots` or `POST /api/shoots/.../start` endpoint logic on the frontend to ensure that when `shoot_references` are inserted into Supabase, the identity images are explicitly receiving `purpose: 'identity'`, even when `[OUTFIT]` and other tagged references are present in the payload.

## Rule Scope
- Fast mode: N/A
- Advanced mode: Yes
- Tags affected: All

## Implementation Target
- Frontend API route (Shoot Creation logic)
- Database insertion logic for `shoot_references`

## Expected Outcome
The backend generation worker will successfully locate the identity references, allowing the advanced orchestration prompt to run and test the outfit bleed fix.

## Regression Risk
None, this is fixing a broken pipeline state.

## Suggested Test
Relaunch an Advanced Shoot with 3 Identity, 1 Inspo, and 1 `[OUTFIT]` tag. Verify the generation starts and completes without throwing the "No valid identity reference image" error.

---

## Production Readiness Verdict
**Verdict: NOT READY FOR FULL PRODUCTION (BLOCKED)**
The Advanced Mode generation pipeline is currently broken. The backend cannot retrieve the user's uploaded identity images, causing a complete failure before prompt orchestration even begins. We need Codex to fix the reference tagging in the database insertion logic before we can resume testing the AI prompt rules.

---

# Test Entry: Advanced Mode Retest & Generation Process Observation

## Date/Time
2026-05-13

## Mode Tested
Advanced Mode (Admin Generate Free)

## Test Setup
- 3 Identity Photos (Subject in a distinct blue sequined dress)
- 1 Inspiration Photo (Staircase environment)
- Tagged Reference 1: `[OUTFIT]`
- Tagged Reference 2: `[NAILS]`
- Aspect Ratio: Instagram 4:5

## Observations
- **Database Fix**: The previous "violates check constraint" error was successfully resolved by the database update. Identity references were successfully parsed, and the generation pipeline kicked off normally.
- **Outfit Bleed Fix (PASS)**: The prompt orchestration explicitly separated identity clothing from the wardrobe source. The `[OUTFIT]` override successfully replaced the identity clothing, confirming the prompt logic works as intended.
- **Aspect Ratio Bug (FAIL)**: Images were generating in Landscape 16:9 instead of the chosen aspect ratio because the aspect ratio parameter was ignored when submitting to fal.ai.
- **Quote Slot (FAIL)**: Slot 10 (the quote image) silently failed to generate the text overlay, returning just the background image. The `sharp` image processing library failed during SVG text composition in the serverless environment.
- **Upscaling Quality**: The `fal-ai/aura-sr` upscaler with 4x magnification was producing sub-optimal results.
- **UI/UX**: Users need an obvious way to download individual 4K images from the gallery.

## Corrective Actions Implemented
1. **Aspect Ratio Fix**: Updated `lib/generate.ts` to pass the correct `aspect_ratio` value to the `fal-ai/nano-banana-2/edit` model.
2. **Upscaler Improvement**: Switched the upscaler from `fal-ai/aura-sr` to `fal-ai/clarity-upscaler` (2x scale with detail prompts) for higher quality production output.
3. **Download Icon**: Added a prominent download icon next to the "4K" button in `app/page.tsx` so users can easily save individual images.
4. **Quote Logging**: Added `console.error` to the `compositeQuote` function to track why `sharp` is failing silently during text rendering.

## Next Steps
We need to monitor the next shoot generation to see if the new `clarity-upscaler` performs better, verify the aspect ratio accurately maps to the fal model, and review the server logs to diagnose the `sharp` composite error for slot 10.
