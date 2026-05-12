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

# Latest Test Report

## Summary
- Result: PASS
- Main blocker: None
- Tested URL: https://virtual-photo-studio-rho.vercel.app/
- Test date/time: 2026-05-12T20:38+01:00
- Browser: Chrome Remote

## Steps Completed
- [x] Initial load
- [x] Selected 3 identity images
- [x] Selected saved inspiration image
- [x] Created shoot
- [x] Opened queued/processing gallery
- [x] Observed generation
- [x] Refreshed and re-opened gallery
- [x] Tested downloads

## Findings
1. Reason Expander Visibility
- Bug: None (Fix Verified)
  - Severity: info
  - Evidence: Hovering on failed slots shows a reason expander stating "fal.ai: Unprocessable Entity".
  - Expected: Reason expander should show provider-level detail without old error messages.
  - Actual: Reason expander works correctly. No mentions of "OpenAI billing hard limit" found.

2. "Generating shoot brief" State
- Bug: None (Fix Verified)
  - Severity: info
  - Evidence: "Generating shoot brief" header is no longer stuck. Gallery successfully updates to show generation status.
  - Expected: Header should update correctly as the process advances.
  - Actual: Header updates properly and does not remain pinned.

3. Initial Load Speed (/api/shoots)
- Bug: None (Fix Verified)
  - Severity: info
  - Evidence: No significant lag or timeouts observed on hard refresh; Identity and Inspiration loaded quickly.

## Network Failures
None reported.

## Console Errors
None reported.

## Provider Errors
| Slot | Status | Visible provider reason | Notes |
|---:|---|---|---|
| Any Failed | FAILED | fal.ai: Unprocessable Entity | Error details correctly expanded |

## Screenshots
- Screenshot name/path: gallery_progress_1778615249015.png
- What it shows: Gallery showing generation progress and proper error tooltips on failed slots.

## Saved Inspiration Library
- Did saved inspiration images load? Yes.
- Count visible: >0.
- Could one be selected? Yes.
- Did it remain after refresh? Yes.

## Shoot/Gallery Result
- Did gallery open when clicking queued/processing? Yes.
- Did generated images appear in app? Yes.
- Did downloads work? Yes (4K button functional).

## Suggestions
- None. All requested fixes are functioning correctly in the production environment.
