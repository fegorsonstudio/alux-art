# Virtual Photo Studio — Browser Test Instructions
**For: AI Browser Assistant**
**App URL:** https://virtual-photo-studio-rho.vercel.app
**Report destination:** Paste findings back to Claude Code (the developer AI)

---

## Image Files — Already on Desktop

| Upload set | Folder path | What to select |
|------------|-------------|----------------|
| Identity photos | `C:\Users\FUJITSU\Desktop\identity\` | Select ALL files in this folder |
| Inspiration photo | `C:\Users\FUJITSU\Desktop\inspiration\` | Select ALL files in this folder |

---

## Setup

1. Open Google Chrome.
2. Open DevTools (`F12`) → **Console** tab (keep visible). Also open **Network** tab → check **Preserve log**.
3. Navigate to: `https://virtual-photo-studio-rho.vercel.app`

---

## Part A — Fix Existing Images (do this first)

### A1 — Log In
- Click **Sign in**. Ask the human to type the email and complete login.
- Wait for the workspace to load.
- **Report:** Login success? Any error?

### A2 — Inspect the Shoots List
After login, the right panel shows **"Your Shoots (N)"** with a scrollable list of all past shoots.

- Scroll through the list and count:
  - How many shoots show status **COMPLETE**?
  - How many show **FAILED**?
  - How many show anything else (PROCESSING, QUEUED, etc.)?
- **Report:** exact counts.

### A3 — Open Every COMPLETE Shoot and Check Images

For each shoot with **COMPLETE** status (up to 10, starting from the most recent):

1. Click the shoot card to open its gallery in the panel below.
2. Wait up to 5 seconds for images to load.
3. For each shoot, report:
   - **Shoot date**
   - **Total image slots** shown in the grid
   - **How many show an actual image** (not blank, not a spinner, not "FAILED")
   - **How many show "FAILED"**
   - **How many are blank / show a spinner with no image**
4. For any slot that shows an image: describe the image briefly (is it a real generated portrait? Or a test/placeholder image?)
5. For any slot that is blank despite status COMPLETE: open **Network tab** and check if a request to `generated-previews` storage was made. What was the response code?

**Report all findings slot-by-slot for the 3 most recent COMPLETE shoots.**

### A4 — Test the Delete Button

- Find any shoot with **FAILED** status in the list.
- To the right of the shoot card you should see a small **✕** button.
- Click it. A **"Delete"** and **"Cancel"** confirmation should appear inline.
- Click **"Delete"**.
- **Report:**
  - Did the shoot disappear from the list immediately?
  - Any error in console?

- Find any shoot that is **actively running** (PROCESSING or QUEUED status). If none exist, skip this sub-step.
- Its delete button should say **"Stop"** (orange color).
- Click **"Stop"** → confirm with **"Delete"**.
- **Report:** Did it disappear? Did the status change first?

---

## Part B — Full New Shoot Test

### B1 — Upload Identity Photos
- Find **IDENTITY (MIN. 3)** section. Click its upload area.
- In the file picker navigate to: `C:\Users\FUJITSU\Desktop\identity\`
- Select all files (Ctrl+A → Open).
- Wait for all thumbnails with "OK" badges.
- **Report:** file count, thumbnail count, errors, upload time.

### B2 — Upload Inspiration Photo
- Find **INSPIRATION (MIN. 1)** section. Click its upload area.
- Navigate to: `C:\Users\FUJITSU\Desktop\inspiration\`
- Select all files (Ctrl+A → Open).
- **Report:** file count, thumbnail count, errors.

### B3 — Configure and Create
- Settings: **fast** mode, **Instagram 4:5**, **NGN**, **10 images**.
- Click **Admin: Generate Free** (or the Generate button).
- **Report:** status badge after creation, any errors.

### B4 — Watch BASE_LOCKING
- Watch for the **"Building your character base..."** banner.
- Wait up to 3 minutes.
- **Report:** did it appear? how long? what appeared next?

### B5 — BASE_REVIEW: Critical Test
After BASE_LOCKING ends, a card says **"Does this look like you?"**

- **Report:**
  - Did the card appear?
  - Did a portrait image load inside it? (yes / stuck on "Loading preview...")
  - If stuck: paste the `/api/characters/[uuid]` network response and last 15 SSE lines.
  - If loaded: describe the image. Does it look like the person from the identity photos?

### B6 — Approve and Watch Generation
- If image loaded, click **"Looks good — generate my photos"**.
- Watch slots fill in.
- **Report:** how many slots completed? What do the images look like? Any failures?

---

## Part C — Report Images Not Showing

After completing Parts A and B, compile this section for Claude Code:

For each COMPLETE shoot where images were NOT showing, report:

1. **Shoot ID** (visible in the URL when you open the gallery, or in DevTools network tab — look for `/api/shoots/[uuid]`)
2. **Number of slots COMPLETE in DB vs showing in UI**
3. **Network request for the broken slot:** In DevTools Network, filter by `generated-previews`. Is the signed URL request returning 200 or 403/404?
4. **Console errors** related to image loading (CORS errors, 403s, etc.)
5. **Does the image URL start with** `https://owdfoxglbxrqhgqbvkon.supabase.co`? Paste the first 80 characters of one broken URL.

---

## Final Report Format

```
## TEST REPORT — Virtual Photo Studio
**Date/Time:** [fill in]

### Part A — Existing Shoots

Shoots list:
- COMPLETE: [count]
- FAILED: [count]
- Other statuses: [list]

Most recent COMPLETE shoot (date, shoot ID if visible):
- Total slots: [n]  |  Showing images: [n]  |  Failed: [n]  |  Blank: [n]
- Image description: [what you see]

Second COMPLETE shoot:
[same format]

Third COMPLETE shoot:
[same format]

Delete button test:
- FAILED shoot deleted: [yes/no, any error]
- Active shoot stopped: [yes/no / skipped]

### Part B — New Shoot

B1 Identity upload: [file count / thumbnail count / errors / time]
B2 Inspiration upload: [file count / thumbnail count / errors]
B3 Shoot creation: [status badge / errors]
B4 BASE_LOCKING: [appeared? / duration / what next]
B5 BASE_REVIEW: [image loaded? / description / or network data if stuck]
B6 Generation: [slots completed / image quality / errors]

### Part C — Broken Images Detail

[For each COMPLETE shoot with missing images:]
Shoot ID: [uuid]
Slots complete in DB: [n] | Showing in UI: [n]
Broken URL starts with: [first 80 chars]
Network response on broken URL: [status code]
Console errors: [paste]

### Console & Network Summary
All console errors:
[paste]

Failed network requests:
[paste URL + status for each]
```

---

## Notes
- Admin login: `fegorsonphotography@gmail.com` — ask human for password.
- If Paystack payment modal appears: report it, do not pay. Ask human to close it.
- **Part A is the priority.** If you run out of time, skip Part B.
- The shoot ID is the UUID in URLs like `/api/shoots/abc-123` — capture it from DevTools Network tab.
