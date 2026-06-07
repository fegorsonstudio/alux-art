# Story Workflow End-to-End Test

**Branch under test:** `feature/story-photoshoot`  
**Test URL:** `http://178.104.133.89:3001` (feature branch running on port 3001 — NOT the production app on port 3000)  
**Production URL (do not touch):** `https://aluxartandframes.shop`  
**Report results back to:** the primary Claude agent in this project session

---

## Pre-conditions (Admin sets up before handing off to test agent)

Before the test agent begins, the primary agent or developer must:

1. SSH into VPS and deploy the feature branch on port 3001:
   ```bash
   ssh user@178.104.133.89
   cd /var/www
   git clone <repo-url> aluxart-story-test || (cd aluxart-story-test && git fetch)
   cd aluxart-story-test
   git checkout feature/story-photoshoot
   git pull origin feature/story-photoshoot
   cp /var/www/aluxart/.env.local .env.local   # copy env from production app
   npm install
   PORT=3001 npm run build && PORT=3001 npm start &
   ```
2. Confirm `http://178.104.133.89:3001` returns HTTP 200 before handing off.
3. Provide the test agent with:
   - Admin email + password for `aluxartandframes.shop` auth (same Supabase project)
   - A test creator account email + password (must have `creator_status = approved` in Supabase)

---

## Test Agent Instructions

You are a test agent. Your job is to run every step below, record what you observe, and return a structured report. Do not skip steps. Do not assume a step passed — verify it.

Use Playwright to drive the browser. All tests run against `http://178.104.133.89:3001` unless otherwise stated.

---

## Part 1 — Stories Page (Public, No Login)

**Goal:** Confirm the /stories page is publicly accessible and matches the app design.

### Steps

1. Navigate to `http://178.104.133.89:3001/stories` without logging in.
2. Confirm the page loads (HTTP 200, no redirect to /login).
3. Confirm the page shows:
   - "PHOTO STORIES" amber eyebrow text
   - "Live the Story" heading
   - All / Solo / Duo / Group filter pills
   - Either a story grid OR the empty state: "No stories published yet."
4. Click each filter pill (Solo, Duo, Group, All) and confirm the page does not crash.
5. Check the nav: should show "Alux Art" logo + "Marketplace" and "Stories" links.
6. Check browser console for errors.

### Pass criteria

- No redirect to /login
- Correct design: warm cream-to-teal gradient background, amber eyebrow text, teal filter pills
- Filter pills are interactive (no JS errors on click)
- Zero console errors

### Report

- Did the page load without redirect? [yes/no]
- Design matches description? [yes/no — list any differences]
- Console errors? [list or "none"]

---

## Part 2 — Marketplace: Stories Filter

**Goal:** Confirm the "Stories" category filter exists in the main marketplace.

### Steps

1. Navigate to `http://178.104.133.89:3001/marketplace`.
2. Look at the category filter pills (All, Portrait, Editorial, Corporate, etc.).
3. Confirm "Stories" appears as a filter option (with a book icon or similar).
4. Click "Stories" filter — confirm the grid refreshes (or shows empty if no stories published yet).
5. Confirm no crash or error.

### Report

- "Stories" filter pill exists in marketplace? [yes/no]
- Clicking it caused a crash? [yes/no]
- Any console errors? [list or "none"]

---

## Part 3 — Creator Dashboard: Create a Story Template

**Goal:** Confirm a creator can build a story template with scenes, role chips, and publish it.

### Steps

1. Navigate to `http://178.104.133.89:3001/login`.
2. Log in with the **creator account** (must have creator_status = approved).
3. Navigate to `http://178.104.133.89:3001/creator-dashboard`.
4. Click **New Template**.
5. Fill in the basic template fields:
   - Title: `Stadium Day Out`
   - Category: `Other`
   - Description: `Step into match day. From the gates to the pitch-side — five scenes, one day.`
   - 5-image price: `15000`
   - 10-image price: `25000`
6. Look for the **"This is a Story"** toggle/checkbox. Confirm it exists.
7. Enable the **"This is a Story"** toggle.
8. Confirm additional fields appear:
   - Story type selector: Solo / Duo / Group pills
   - Default role input
   - Role chips input
   - Scene builder section
9. Select **Solo** story type.
10. In the **Default role** field, type: `fan in the stands`
11. In the **Role chips** field, type: `Devoted fan, VIP guest, Pitch-side reporter, Media photographer`
12. In the **Scene Builder**, verify at least one scene card exists.
13. Fill in Scene 1:
    - Title: `Arrival at the Gates`
    - Description: `Subject arrives at the main stadium entrance, golden hour light, crowds streaming in`
    - Environment: `Exterior stadium gates, golden hour`
    - Wardrobe: `Team jersey, scarf, casual jeans`
14. Click **Add Scene** to add Scene 2. Fill in:
    - Title: `The Terraces`
    - Description: `Packed terrace stand, roaring crowd around the subject`
    - Environment: `Interior stadium stands, floodlit`
    - Wardrobe: `Same jersey, scarf raised`
15. Click **Add Scene** for Scene 3. Fill in:
    - Title: `Post-Match Celebration`
    - Description: `Outside the stadium after the final whistle, celebratory atmosphere`
    - Environment: `Stadium exterior, evening, confetti`
    - Wardrobe: `Jersey, scarf around neck`
16. Verify there are now 3 scene cards.
17. Test the reorder buttons: click "Move down" on Scene 1 — confirm Scene 1 and Scene 2 swap positions.
18. Click "Move up" on what is now Scene 1 — confirm they swap back.
19. Click **Save as draft** (or Create template, depending on UI label).
20. Confirm the save succeeds (no error toast, panel closes or success indicator).

### Pass criteria

- "This is a Story" toggle exists and shows/hides story fields correctly
- Solo / Duo / Group type selection works
- Scene cards support add, remove, and reorder
- Save completes without error

### Report

- "This is a Story" toggle found? [yes/no]
- Story fields appeared on toggle? [yes/no — list missing fields if any]
- Scene add/remove/reorder worked? [yes/no]
- Save succeeded? [yes/no]
- Any errors during save? [list or "none"]
- Template ID from the URL or response (if visible)? [record it]

---

## Part 4 — Publish the Story Template

**Goal:** Confirm the story template can be published and appears on /stories.

### Steps

1. After saving, find the template row in the creator dashboard.
2. Click the **Publish** toggle (eye icon) on the `Stadium Day Out` template.
3. Confirm the status changes to "published" without a full page reload.
4. Navigate to `http://178.104.133.89:3001/stories`.
5. Confirm the `Stadium Day Out` story card appears in the grid.
6. Confirm the card shows:
   - Cover image (or placeholder if no cover set)
   - A "STORY" amber badge
   - "Solo" type pill
   - Scene count (e.g. "3 scenes")
   - Title: "Stadium Day Out"
   - Price displayed (from NGN or USD depending on currency toggle)
7. Click the **Solo** filter pill — confirm the card still appears.
8. Click the **Duo** filter pill — confirm the card disappears (it's Solo type).
9. Click **All** — confirm the card reappears.

### Pass criteria

- Template publishes without full reload
- Card appears on /stories with amber STORY badge
- Type filter correctly shows/hides the card

### Report

- Template published successfully? [yes/no]
- Card appeared on /stories? [yes/no]
- Amber STORY badge visible? [yes/no]
- Scene count badge visible? [yes/no — what did it show?]
- Type filter worked correctly? [yes/no]
- Any console errors? [list or "none"]

---

## Part 5 — Template Page: Scene Timeline

**Goal:** Confirm the template detail page shows a Scene Timeline for story templates.

### Steps

1. On the /stories page, click the `Stadium Day Out` card.
2. Confirm you land on `http://178.104.133.89:3001/marketplace/[id]`.
3. Look for a **Scene Timeline** section (instead of or alongside the normal gallery).
4. Confirm the timeline shows 3 scenes with their titles and descriptions.
5. Confirm Scene 1 is "Arrival at the Gates" (or whichever is first after your reorder test).
6. Confirm scene titles and descriptions match what was entered.
7. Check that the 5-image and 10-image package selector is present.
8. Confirm pricing is visible (NGN amounts).

### Pass criteria

- Scene Timeline section exists
- All 3 scenes visible with titles and descriptions
- Package selector present

### Report

- Scene Timeline found? [yes/no]
- All 3 scenes visible? [yes/no]
- Scene titles correct? [yes/no — list if different]
- Package selector present? [yes/no]
- Any console errors? [list or "none"]

---

## Part 6 — Checkout: Role Prompt and Booking (Admin Free Shoot)

**Goal:** Confirm the checkout panel shows story-specific UI and the booking can complete.

### Steps

1. Log out of the creator account and log in with the **admin account**.
2. Navigate back to the `Stadium Day Out` template page.
3. Click **Book This Style** (or the CTA button on the template page).
4. The checkout / side panel should open.
5. Look for the role prompt section: "YOUR ANGLE IN THIS STORY" or similar heading.
6. Confirm it shows:
   - A text input pre-filled with "I'm the "
   - Role chip suggestions: "Devoted fan", "VIP guest", "Pitch-side reporter", "Media photographer"
7. Click the **"Devoted fan"** chip — confirm it fills the input to "I'm the Devoted fan".
8. Manually clear the field and type: `I'm the referee`
9. Confirm there is **no** co-star upload section (this is Solo type).
10. Upload **3 identity photos** (any face photos you have).
11. Confirm the **Pay / Start** button becomes enabled after uploading identity photos.
12. Confirm the button is enabled (admin should get a free/admin bypass path).
13. Click the button to start the shoot.
14. Confirm a shoot is created (you should see a redirect to `/studio` or a shoot status page).

### Pass criteria

- Role prompt section visible for story templates
- Role chip click fills the input
- No co-star section for Solo story
- canPay guard works (button enabled after identity upload)
- Booking / shoot creation succeeds

### Report

- Role prompt section visible? [yes/no]
- Role chips worked? [yes/no]
- Co-star section absent for Solo? [yes/no]
- Button enabled after uploading identity photos? [yes/no]
- Shoot created successfully? [yes/no]
- Shoot ID (from URL or response)? [record it]
- Any errors during booking? [list or "none"]

---

## Part 7 — Generation: Scene Slots

**Goal:** Confirm the shoot creates the correct number of image slots and each slot maps to a scene.

### Steps

1. After booking, navigate to the shoot detail page (Studio or shoot status URL).
2. Confirm you can see the list of image slots (should be 5 for 5-image package).
3. Check the slot labels or scene assignments — ideally slot 1 = Scene 1, slot 2 = Scene 2, etc.
4. Watch the first slot begin generating (or trigger generation if there is a Start button).
5. Wait up to 3 minutes for at least 1 slot to complete.
6. Confirm the completed image appears in the UI.
7. Open the browser Network tab and confirm:
   - No `fal.ai` or `fal.media` URLs appear in responses sent to the frontend
   - Images are served via your own storage URLs (Supabase or R2), not fal.ai direct links
8. If a slot fails, confirm a **Retry** button appears for that slot.

### Pass criteria

- Correct slot count (5 for 5-image package)
- Generation starts without 504 timeout
- At least 1 image completes and is visible
- No fal.ai URLs leak to the frontend
- Retry button visible on failed slots

### Report

- Slot count correct? [yes/no — how many?]
- Generation started without errors? [yes/no]
- Any 504 timeouts? [yes/no]
- At least 1 image completed? [yes/no]
- fal.ai URLs visible in Network tab? [yes/no — list if yes]
- Retry button appeared on failed slots? [yes/no / n/a]
- Console/network errors? [list or "none"]

---

## Part 8 — Duo Story: Co-star Upload Guard

**Goal:** Confirm canPay is blocked until co-star upload + consent are both present for a Duo story.

### Steps

1. Go back to the creator dashboard.
2. Create a second template: Title `Best Friends Shoot`, type = **Duo**, 1 scene minimum.
3. Publish it.
4. Navigate to the template page and open checkout.
5. Confirm a **Co-star photos** upload section appears.
6. Confirm a **consent checkbox** appears ("I confirm I have permission to use this person's photo").
7. Try to click Pay/Start **before** uploading a co-star photo — confirm button is disabled.
8. Upload a co-star photo but **do not check the consent box** — confirm button is still disabled.
9. Check the consent box — confirm button is now enabled (assuming identity photos are also uploaded).

### Pass criteria

- Co-star upload section visible for Duo stories
- Consent checkbox present
- canPay correctly blocked until both co-star photo + consent are present

### Report

- Co-star section visible for Duo? [yes/no]
- Consent checkbox present? [yes/no]
- Button disabled without co-star photo? [yes/no]
- Button disabled without consent (photo present but consent unchecked)? [yes/no]
- Button enabled after both? [yes/no]

---

## Part 9 — Console & Network Error Summary

After completing all parts:

1. Open DevTools → Console → filter by Errors.
2. Open Network tab → filter by 4xx and 5xx.
3. Record all failures.

---

## Summary Report Format

Return results in exactly this format:

```
STORY WORKFLOW TEST REPORT
Branch: feature/story-photoshoot
Test URL: http://178.104.133.89:3001
Tested by: [agent name or session ID]
Date: [date]

PART 1 — Stories Page (Public)
  Loads without login redirect: [yes/no]
  Design correct (cream/teal/amber): [yes/no]
  Filter pills work: [yes/no]
  Console errors: [list or "none"]

PART 2 — Marketplace Stories Filter
  "Stories" filter pill exists: [yes/no]
  No crash on click: [yes/no]

PART 3 — Create Story Template
  "This is a Story" toggle found: [yes/no]
  Story fields appeared on toggle: [yes/no]
  Scenes: add/remove/reorder all worked: [yes/no]
  Save succeeded: [yes/no]
  Errors during save: [list or "none"]

PART 4 — Publish & Stories Page
  Published without full reload: [yes/no]
  Card appeared on /stories: [yes/no]
  STORY amber badge visible: [yes/no]
  Scene count badge visible: [yes/no — value shown]
  Type filter (Solo/Duo/Group) worked: [yes/no]

PART 5 — Template Page Scene Timeline
  Scene Timeline section found: [yes/no]
  All 3 scenes visible with titles: [yes/no]
  Package selector present: [yes/no]

PART 6 — Checkout Role Prompt & Booking
  Role prompt section visible: [yes/no]
  Role chips filled input on click: [yes/no]
  Co-star section absent for Solo: [yes/no]
  canPay enabled after identity upload: [yes/no]
  Booking succeeded: [yes/no]
  Shoot ID: [value]

PART 7 — Generation
  Correct slot count (5): [yes/no — actual count]
  Generation started without 504: [yes/no]
  At least 1 image completed: [yes/no]
  fal.ai URL leaks in Network tab: [yes/no — list if yes]
  Retry button on failed slots: [yes/no/n/a]

PART 8 — Duo canPay Guard
  Co-star section visible for Duo: [yes/no]
  Consent checkbox present: [yes/no]
  canPay blocked without co-star: [yes/no]
  canPay blocked without consent: [yes/no]
  canPay enabled after both: [yes/no]

PART 9 — Errors
  Console errors: [list or "none"]
  Failed API requests (4xx/5xx): [list or "none"]

OVERALL: Pass / Fail / Needs attention

Issues that must be fixed before merging to main:
  1. [list]
  2. [list]

Issues that are minor (can fix after merge):
  1. [list]
```

---

## Notes for the Test Agent

- The database is the **same Supabase project** as production (`owdfoxglbxrqhgqbvkon`). Any templates or shoots created during this test will be real entries in the DB. Clean up test templates after the test by deleting them from the creator dashboard.
- If `http://178.104.133.89:3001` is not reachable, stop and report `BLOCKED — test server not running on port 3001`.
- If the VPS only has port 3000 accessible, the primary agent needs to set up the alternate port deployment first.
- Generation may take 1–3 minutes per image. Wait at least 3 minutes before reporting a generation failure.
- Do not test against `https://aluxartandframes.shop` (production). Only use port 3001.
