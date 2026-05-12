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
   - Severity: blocker / high / medium / low
   - Evidence:
   - Expected:
   - Actual:
   - Suspected area:

## Network Failures
| Step | Method | URL | Status | Response body | Notes |
|---|---|---|---:|---|---|

## Console Errors
```text
Paste exact console errors here.
```

## Provider Errors
| Slot | Status | Visible provider reason | Notes |
|---:|---|---|---|

## Screenshots
- Screenshot name/path:
- What it shows:

## Saved Inspiration Library
- Did saved inspiration images load?
- Count visible:
- Could one be selected?
- Did it remain after refresh?

## Shoot/Gallery Result
- New shoot ID, if visible:
- Status progression:
- Did gallery open when clicking queued/processing?
- Did generated images appear in app?
- Did downloads work?

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
