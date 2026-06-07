# Browser Agent Test Instructions: Creator Dashboard & Collage Cover Creator

**App URL:** https://aluxartandframes.shop  
**Focus:** Functionality, speed, and visual correctness of the creator dashboard and collage/cover creator.

---

## Setup

1. Open https://aluxartandframes.shop
2. Click **Log in** and sign in with a creator account (must have creator status: approved).
3. After login, navigate to https://aluxartandframes.shop/creator-dashboard
4. Open DevTools → Network tab. Set throttle to **No throttling**. Keep it open throughout.

---

## Part 1 — Dashboard Load Speed

**What to measure:** Time from navigation to fully painted dashboard (stats visible, template list visible).

### Steps

1. Hard-reload the creator dashboard (`Ctrl+Shift+R` or `Cmd+Shift+R`).
2. In the Network tab, record the time for `GET /api/creator-dashboard` to complete.
3. Note when the stats grid (Total Templates, Published, Sales, Earned) becomes visible on screen.
4. Note when the template list rows appear.

### Pass criteria

- `GET /api/creator-dashboard` response: **under 2 seconds**
- Full page painted (stats + template rows visible): **under 3 seconds** on desktop
- No spinner stuck indefinitely; no blank sections after load

### What to report

- Actual response time for `/api/creator-dashboard`
- Any requests that took longer than 2 seconds (list URL + duration)
- Whether images in the template list load or show broken icons

---

## Part 2 — Template Form Panel Speed

**What to measure:** Time to open and close the edit/create panel.

### Steps

1. Click the **New Template** button.
2. Record the time for the form panel to appear (title field visible and focusable).
3. Fill in:
   - **Title:** `Speed Test Template`
   - **Category:** Portrait
   - **10-image price:** `20000`
4. Click **Save as draft** → **Create template**.
5. Record how long it takes for the panel to close and the new template row to appear in the list.

### Pass criteria

- Panel open: **under 300 ms** (no async fetch needed to open)
- Save + panel close + list update: **under 3 seconds**
- New template row appears without full page reload

### What to report

- Any lag opening the panel
- Time for `POST /api/templates` in the Network tab
- Whether the new row appears immediately or requires a manual refresh

---

## Part 3 — Image Upload to a Template

**What to measure:** Upload speed and preview appearance for reference images.

### Steps

1. Click **Edit** on any existing template (or the one created in Part 2).
2. Scroll to the **Reference Images** section.
3. Click the upload zone and select any JPEG or PNG image from your device (ideally 1–3 MB).
4. Watch for the upload progress indicator.
5. Note when the image thumbnail appears in the list.

### Pass criteria

- Progress indicator appears within **1 second** of file selection
- Thumbnail appears within **5 seconds** for a 2 MB file on a standard connection
- No error toast after upload

### What to report

- Time for `POST /api/upload/file` in Network tab
- Whether the progress bar reaches 100% and then the thumbnail appears
- Any CORS errors or 4xx/5xx responses in the Network tab

---

## Part 4 — Collage Cover Creator Speed & Functionality

**What to measure:** Time to open the editor, canvas render speed, and save speed.

### Pre-condition

The template must have **at least 2 gallery/sample images**. If not, upload 2 images to the Gallery section of any template first, then save the template before continuing.

### Steps

**Opening the editor:**

1. Click **Edit** on a template that has 2+ gallery images.
2. Scroll to the **Gallery Images** section.
3. Click **"Create collage cover from gallery"**.
4. Record how long until the CollageEditor modal opens and the canvas preview is visible.

**Hero + tile selection:**

5. Click any image to set it as the **Hero** (background). The badge "Hero" should appear on it.
6. Click 2 other images to select them as **tiles**. Each should show a numbered badge (1, 2).
7. Note whether the canvas preview updates within **500 ms** of each click.

**Style adjustments:**

8. Switch **Frame Style** from Polaroid → Rounded → Plain. After each click, verify the canvas preview re-renders.
9. Switch **Shadow** from None → Soft → Medium → Heavy. Verify canvas re-renders each time.
10. Toggle the **Gradient overlay** on and off. Verify the darkening on the lower half of the preview appears/disappears.
11. All re-renders should complete within **500 ms** of the click.

**Save:**

12. Click **Save as cover**.
13. Record the time until:
    - The upload completes (`POST /api/upload/file` in Network tab)
    - The PATCH to update the template (`PATCH /api/templates/{id}`) completes
    - The modal closes
    - The cover image thumbnail updates in the Edit form

### Pass criteria

- Editor opens and canvas visible: **under 1 second**
- Canvas re-renders on interaction: **under 500 ms** each
- Save flow (upload → PATCH → close): **under 6 seconds**
- Cover image in the template form updates to the new collage after save

### What to report

- Time to open the collage editor
- Whether canvas re-renders felt instant or laggy during style changes
- Actual durations for `POST /api/upload/file` and `PATCH /api/templates/{id}` in Network tab
- Whether the cover thumbnail in the form refreshed after save
- Any canvas errors in the browser console (`console.error` or `Uncaught`)

---

## Part 5 — Publish / Unpublish Toggle Speed

### Steps

1. On a template with status **draft**, click the **Publish toggle** (eye icon).
2. Record how long until the status badge changes to **published**.
3. Click the toggle again to unpublish.
4. Record how long until the badge reverts to **draft**.

### Pass criteria

- Each toggle: **under 2 seconds** end-to-end
- No full page reload — only the affected row should update

### What to report

- Actual time for the PATCH request in Network tab
- Whether both states (publish + unpublish) work correctly

---

## Part 6 — QR Share Card

### Steps

1. Click the **QR Code** icon on any published template.
2. Confirm the share card modal opens with:
   - Dark background (navy gradient)
   - White QR code plinth in the centre
   - Creator handle in purple below the QR
   - Platform URL below the handle
   - iPhone / Android instruction columns at the bottom (fully visible, not clipped)
3. Click **Download Card** and confirm the downloaded PNG also shows the instruction columns.

### Pass criteria

- Modal opens: **under 500 ms**
- All sections visible without scrolling inside the card
- Downloaded PNG shows the full card including iPhone/Android instructions

### What to report

- Whether the instruction columns are visible in the live card
- Whether the downloaded PNG shows the instructions
- Any clipping or overflow issues

---

## Part 7 — Console & Network Error Check

After completing all the above:

1. Open DevTools → **Console** tab.
2. Filter by **Errors** only.
3. Record any red error messages.
4. Open the **Network** tab, filter by **4xx** and **5xx** status codes.
5. Record any failed requests (URL + status code).

### Pass criteria

- Zero console errors during normal use
- No 4xx or 5xx responses from `/api/*` routes during the test flows above

---

## Summary Report Format

After testing, report results in this structure:

```
PART 1 — Dashboard Load
  /api/creator-dashboard response time: Xs
  Full page paint time: Xs
  Slow requests: [list or "none"]
  Broken images: [yes/no]

PART 2 — Template Form
  Panel open time: Xms
  POST /api/templates time: Xs
  New row appeared without reload: [yes/no]

PART 3 — Image Upload
  POST /api/upload/file time: Xs
  Thumbnail appeared: [yes/no]
  Errors: [list or "none"]

PART 4 — Collage Editor
  Editor open time: Xms
  Canvas re-render felt: [instant / slightly laggy / slow]
  POST /api/upload/file time: Xs
  PATCH /api/templates time: Xs
  Cover thumbnail updated: [yes/no]
  Console errors: [list or "none"]

PART 5 — Publish Toggle
  Publish time: Xs
  Unpublish time: Xs

PART 6 — QR Card
  Instructions visible in card: [yes/no]
  Instructions visible in PNG: [yes/no]
  Clipping issues: [list or "none"]

PART 7 — Errors
  Console errors: [list or "none"]
  Failed API requests: [list or "none"]

OVERALL: Pass / Fail / Needs attention
Issues to fix: [list]
```
