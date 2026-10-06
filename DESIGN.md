# Alux Art — Design Guide

How Alux Art looks, in light and dark. Read it before building or changing a
page, and before making the studio's own social images.

It is written from the pages people use today — the customer studio
(`/studio`), the marketplace and the creator sign-up — so new work matches
them. Nothing here is aspirational: where the live site falls short of it, the
gap is listed at the end.

---

## The four looks, and where each belongs

| Look | Where it is used | Modes |
|---|---|---|
| **App** — pastel sky, frosted panels, teal | Every page someone signs in to: `/studio`, `/marketplace`, `/become-creator`, `/creator-dashboard`, and new admin tools such as `/admin/carousel` | Light (default) and Dark, chosen by the person |
| **Home** — dark editorial | The public home page `/` only | Dark only |
| **Social deck** — dark green and mint | Images we render, not web pages: Instagram carousel slides, story GIFs, the GIF Maker's word panel | One, fixed |
| **Old admin** — black and gold | `/admin`, `/admin/template-lab` | Dark only. Legacy: never use it for a new page |

Everything below is the **App** look unless a section says otherwise.

---

## Light and dark mode

- Every App page offers both. **Light is the default.**
- The person switches with a **Light/Dark button in the top bar**. It names the
  mode it switches *to* — "Dark" while the page is light, "Light" while it is
  dark — and carries `aria-pressed`.
- The choice is kept in `localStorage` under **`studio-theme`**: one key for the
  whole site, so it follows the person from page to page. Pages do **not**
  follow the phone's own dark setting; keep it that way so every page behaves
  alike.
- The page's root element carries `data-theme="light"` or `data-theme="dark"`,
  and **every colour has a dark value**. A colour written only for light is a
  bug: dark teal text on the dark panel cannot be read, and it has shipped
  before (see the comment on the retouch block in `app/workspace.module.css`).

The switch, exactly as `/studio`, `/marketplace` and `/become-creator` do it:

```tsx
const [theme, setTheme] = useState<"light" | "dark">("light");

useEffect(() => {
  const stored = localStorage.getItem("studio-theme");
  if (stored === "dark" || stored === "light") setTheme(stored);
}, []);

const toggleTheme = () => {
  setTheme((prev) => {
    const next = prev === "dark" ? "light" : "dark";
    localStorage.setItem("studio-theme", next);
    return next;
  });
};

// <div className={styles.app} data-theme={theme}>
// <button className={styles.themeToggle} onClick={toggleTheme} aria-pressed={theme === "dark"}>
//   {theme === "dark" ? "Light" : "Dark"}
// </button>
```

---

## Colour

The light values are the live studio's (`app/workspace.module.css`); the dark
values are the same file's `[data-theme="dark"]` rules.

### The ground

The page is a sky: three soft glows over a diagonal gradient, with a fixed
layer of faint cloud bands on top.

| Role | Light | Dark |
|---|---|---|
| Sky gradient, 135° | `#fff8ea` → `#e5fbf6` (40%) → `#d9efff` | `#142629` → `#102f34` (44%) → `#172b3d` |
| Glow, top left | `rgba(144,220,220,.62)` | `rgba(53,146,154,.30)` |
| Glow, top right | `rgba(255,190,176,.48)` | `rgba(191,98,92,.20)` |
| Glow, bottom right | `rgba(183,224,252,.72)` | `rgba(79,134,184,.30)` |
| Cloud bands (fixed layer) | white `.52`, mint `rgba(172,238,222,.46)`, blue `rgba(159,210,247,.38)`; layer opacity `.8` | `rgba(115,221,207,.12)`, `rgba(255,179,165,.10)`, `rgba(141,204,249,.12)`; opacity `1` |

### Surfaces

| Role | Light | Dark |
|---|---|---|
| Top bar | `rgba(255,248,234,.82)` + `blur(18px)`, bottom line `rgba(255,255,255,.74)`, shadow `0 10px 30px rgba(47,142,154,.08)` | `rgba(19,37,41,.84)`, line `rgba(155,232,226,.13)`, shadow `0 10px 30px rgba(0,0,0,.18)` |
| Panel | `rgba(255,255,255,.74)`, border `rgba(255,255,255,.88)`, shadow `0 18px 50px rgba(53,130,143,.12)` | `rgba(19,41,45,.72)`, border `rgba(180,242,236,.14)`, shadow `0 18px 50px rgba(0,0,0,.18)` |
| Panel corner washes | mint `rgba(169,235,221,.52)`, coral `rgba(255,196,184,.36)`, blue `rgba(183,224,252,.44)` | `rgba(105,229,210,.14)`, `rgba(255,176,163,.10)`, `rgba(135,199,247,.13)` |
| Row or tile inside a panel | `rgba(255,255,255,.64)`, border `rgba(255,255,255,.84)`; hover `#fff` | `rgba(255,255,255,.07)`, border `rgba(180,242,236,.12)`; hover `rgba(255,255,255,.11)` |
| Field | `rgba(255,255,255,.78)`, border `rgba(66,156,166,.22)`; focus `#fff`, border `rgba(66,156,166,.62)` | `rgba(255,255,255,.08)`, border `rgba(155,232,226,.18)` |

### Text

| Role | Light | Dark |
|---|---|---|
| Body | `#263235` | `#eaf8f6` |
| Headings, brand name | `#263235` | `#eefbf9` |
| Labels | `#4e7076` | `#acd4d7` |
| Helper text, dates, meta | `#5d7a80` – `#627d82` | `#9fc1c4` – `#b8d3d5` |
| Placeholder | `#8aa0a4` | `#89aeb2` |
| Panel titles | `#35747b` | `#9dece1` |

### Accent

| Role | Light | Dark |
|---|---|---|
| Teal — solid buttons, prices, links | `#2f8e9a`, hover `#267a85` | same fill |
| Teal text | `#2d727b`, hover `#245d66` | `#b8f3ee`, hover `#ffffff` |
| Selected pill or option | bg `#fff`, border `rgba(65,199,184,.72)`, text `#1d727c`, glow `inset 0 -12px 20px rgba(188,245,235,.62)` | bg `rgba(155,232,226,.16)`, border `rgba(155,232,226,.55)`, text `#fff`, glow `rgba(65,199,184,.14)` |
| Mint — checkboxes (`accent-color`), progress | `#55cdbc`; progress `#65d7c6` → `#ffffff` → `#8ecfff` | same |
| Coral — the second accent | `#ffb8aa` (pale), `#d56e62` (counts) | `#ffb8aa` |
| Rust — errors | `#a7463c` | `#ffb8aa` |

### Status chips

Small labels for where something stands. The same colours in both modes.
`0.7rem`, weight 750, uppercase, tracking `.05em`, padding `3px 8px`, radius 8px.

| State | Background | Text |
|---|---|---|
| Waiting on someone | `#fff2d6` | `#9b6a1b` |
| Queued, scheduled | `#d9efff` | `#2f6a98` |
| Ready, working | `#dbf8ef` | `#247861` |
| Done | `#e4fff8` | `#197463` |
| Failed | `#ffe1dc` | `#a7463c` |

### Messages

A line telling the person what just happened. Radius 8px, padding `10px 14px`, `0.82rem`.

| Kind | Light | Dark |
|---|---|---|
| Info, working | `rgba(217,239,255,.82)`, border `rgba(73,151,205,.24)`, text `#2f6a98` | `rgba(60,130,180,.14)`, border `rgba(120,190,230,.20)`, text `#a8d8f0` |
| Success | `rgba(228,255,248,.9)`, border `rgba(39,132,107,.22)`, text `#177767` | `rgba(30,80,55,.30)`, border `rgba(80,200,140,.20)`, text `#7dd4a8` |
| Error | `rgba(255,225,220,.9)`, border `rgba(167,70,60,.24)`, text `#a7463c` | `rgba(167,70,60,.18)`, border `rgba(255,184,170,.22)`, text `#ffb8aa` |

The dark message colours are the studio's dark banners (`.baseLockingBanner`,
`.processingNotice`, `.baseRejectedBanner`); the studio's own `.statusBar` has
no dark version yet.

### Ready-made tokens

Paste this at the root of a new page's CSS module and build every colour from
the variables — then the dark mode is already done. `/admin/carousel`
(`app/admin/carousel/carousel.module.css`) is built on exactly this.

```css
.app {
  /* ground */
  --sky-1: #fff8ea; --sky-2: #e5fbf6; --sky-3: #d9efff;
  --glow-1: rgba(144, 220, 220, 0.62); --glow-2: rgba(255, 190, 176, 0.48); --glow-3: rgba(183, 224, 252, 0.72);
  --band-1: rgba(255, 255, 255, 0.52); --band-2: rgba(172, 238, 222, 0.46); --band-3: rgba(159, 210, 247, 0.38);
  --band-opacity: 0.8;
  /* surfaces */
  --bar-bg: rgba(255, 248, 234, 0.82); --bar-line: rgba(255, 255, 255, 0.74); --bar-shadow: 0 10px 30px rgba(47, 142, 154, 0.08);
  --panel-bg: rgba(255, 255, 255, 0.74); --panel-line: rgba(255, 255, 255, 0.88); --panel-shadow: 0 18px 50px rgba(53, 130, 143, 0.12);
  --wash-1: rgba(169, 235, 221, 0.52); --wash-2: rgba(255, 196, 184, 0.36); --wash-3: rgba(183, 224, 252, 0.44);
  --tile-bg: rgba(255, 255, 255, 0.64); --tile-line: rgba(255, 255, 255, 0.84); --tile-hover-bg: #ffffff;
  --field-bg: rgba(255, 255, 255, 0.78); --field-line: rgba(66, 156, 166, 0.22);
  --field-focus-bg: #ffffff; --field-focus-line: rgba(66, 156, 166, 0.62);
  --control-bg: rgba(255, 255, 255, 0.68); --control-line: rgba(67, 159, 169, 0.24);
  --control-hover-bg: #ffffff; --control-hover-line: rgba(67, 159, 169, 0.52);
  /* text */
  --ink: #263235; --heading: #263235; --label: #4e7076; --meta: #627d82; --placeholder: #8aa0a4; --panel-title: #35747b;
  /* accent */
  --teal: #2f8e9a; --teal-hover: #267a85; --teal-ink: #2d727b; --teal-ink-hover: #245d66;
  --teal-soft-bg: rgba(47, 142, 154, 0.07); --teal-soft-line: rgba(47, 142, 154, 0.28);
  --selected-bg: #ffffff; --selected-line: rgba(65, 199, 184, 0.72); --selected-ink: #1d727c;
  --selected-glow: inset 0 -12px 20px rgba(188, 245, 235, 0.62);
  --mint: #55cdbc;
  --danger-bg: rgba(255, 255, 255, 0.7); --danger-line: rgba(213, 110, 98, 0.25); --danger-ink: #a9544d;
  --warn-ink: #9b6a1b;
  --cta: linear-gradient(135deg, #ffffff 0%, #aff0e4 48%, #9fd7ff 100%);
  --cta-ink: #263235; --cta-shadow: 0 16px 34px rgba(48, 141, 151, 0.18);
  /* top-bar buttons */
  --quiet-bg: rgba(255, 255, 255, 0.76); --quiet-line: rgba(67, 159, 169, 0.22); --quiet-ink: #3f6166;
  --quiet-hover-line: rgba(67, 159, 169, 0.48); --quiet-hover-ink: #245d66;
  /* messages */
  --info-bg: rgba(217, 239, 255, 0.82); --info-line: rgba(73, 151, 205, 0.24); --info-ink: #2f6a98;
  --ok-bg: rgba(228, 255, 248, 0.9); --ok-line: rgba(39, 132, 107, 0.22); --ok-ink: #177767;
  --error-bg: rgba(255, 225, 220, 0.9); --error-line: rgba(167, 70, 60, 0.24); --error-ink: #a7463c;
}

.app[data-theme="dark"] {
  --sky-1: #142629; --sky-2: #102f34; --sky-3: #172b3d;
  --glow-1: rgba(53, 146, 154, 0.3); --glow-2: rgba(191, 98, 92, 0.2); --glow-3: rgba(79, 134, 184, 0.3);
  --band-1: rgba(115, 221, 207, 0.12); --band-2: rgba(255, 179, 165, 0.1); --band-3: rgba(141, 204, 249, 0.12);
  --band-opacity: 1;
  --bar-bg: rgba(19, 37, 41, 0.84); --bar-line: rgba(155, 232, 226, 0.13); --bar-shadow: 0 10px 30px rgba(0, 0, 0, 0.18);
  --panel-bg: rgba(19, 41, 45, 0.72); --panel-line: rgba(180, 242, 236, 0.14); --panel-shadow: 0 18px 50px rgba(0, 0, 0, 0.18);
  --wash-1: rgba(105, 229, 210, 0.14); --wash-2: rgba(255, 176, 163, 0.1); --wash-3: rgba(135, 199, 247, 0.13);
  --tile-bg: rgba(255, 255, 255, 0.07); --tile-line: rgba(180, 242, 236, 0.12); --tile-hover-bg: rgba(255, 255, 255, 0.11);
  --field-bg: rgba(255, 255, 255, 0.08); --field-line: rgba(155, 232, 226, 0.18);
  --field-focus-bg: rgba(255, 255, 255, 0.12); --field-focus-line: rgba(155, 232, 226, 0.45);
  --control-bg: rgba(255, 255, 255, 0.08); --control-line: rgba(155, 232, 226, 0.18);
  --control-hover-bg: rgba(255, 255, 255, 0.12); --control-hover-line: rgba(155, 232, 226, 0.45);
  --ink: #eaf8f6; --heading: #eefbf9; --label: #acd4d7; --meta: #9fc1c4; --placeholder: #89aeb2; --panel-title: #9dece1;
  --teal-ink: #b8f3ee; --teal-ink-hover: #ffffff;
  --teal-soft-bg: rgba(67, 159, 169, 0.12); --teal-soft-line: rgba(67, 159, 169, 0.3);
  --selected-bg: rgba(155, 232, 226, 0.16); --selected-line: rgba(155, 232, 226, 0.55); --selected-ink: #ffffff;
  --selected-glow: inset 0 -12px 20px rgba(65, 199, 184, 0.14);
  --danger-bg: rgba(255, 255, 255, 0.08); --danger-line: rgba(255, 176, 163, 0.26); --danger-ink: #ffb8aa;
  --warn-ink: #ffd966;
  --cta: linear-gradient(135deg, #ffffff 0%, #88eadb 48%, #83c9ff 100%);
  --quiet-bg: rgba(233, 250, 248, 0.08); --quiet-line: rgba(155, 232, 226, 0.2); --quiet-ink: #d8f5f2;
  --quiet-hover-line: rgba(155, 232, 226, 0.45); --quiet-hover-ink: #ffffff;
  --info-bg: rgba(60, 130, 180, 0.14); --info-line: rgba(120, 190, 230, 0.2); --info-ink: #a8d8f0;
  --ok-bg: rgba(30, 80, 55, 0.3); --ok-line: rgba(80, 200, 140, 0.2); --ok-ink: #7dd4a8;
  --error-bg: rgba(167, 70, 60, 0.18); --error-line: rgba(255, 184, 170, 0.22); --error-ink: #ffb8aa;
}
```

The two field-focus values in dark are the only ones not taken from the live
studio, which keeps its dark fields unchanged on focus; they match its dark
hover so a focused field still shows.

---

## Type

- **Outfit for everything**, loaded with `next/font` in `app/layout.tsx`:
  `font-family: var(--font-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;`
  Arabic and Chinese switch to Noto automatically (`app/globals.css`).

| Use | Size | Weight | Notes |
|---|---|---|---|
| Brand name in the top bar | 1.08rem | 800 | |
| Primary button | 1rem | 800 | |
| Body, fields | 0.875rem | 400 | line-height about 1.5 |
| Secondary text, buttons | 0.8rem | 600–700 | |
| Helper text | 0.76rem | 400 | |
| Panel titles | 0.75rem | 750 | uppercase, tracking `.1em` |
| Labels | 0.75rem | 750 | uppercase, tracking `.08em` |
| Status chips | 0.7rem | 750 | uppercase, tracking `.05em` |

- Times, prices and counts that line up in a list: `font-variant-numeric: tabular-nums`.
- On phones, fields are forced to 16px below 768px wide so iPhones don't zoom in
  (`app/globals.css`).

---

## Shape and depth

- **Radius:** 8px for controls, chips, tiles and images; 12px for panels; 6px
  for small inline buttons. Avoid fully round pill buttons.
- **Depth** comes from soft shadows — tinted teal in light, low black in dark —
  never from hard borders alone.
- **Panels are frosted glass:** a translucent fill and three faint colour
  washes in their corners (a `::before` layer with the children raised above it).

---

## Layout

- **Top bar:** logo tile (32px, white, radius 8px, `/logo.png`) and the name;
  on the right, page links, the Light/Dark button and sign out. Padding
  `14px 24px` (`10px 14px` on phones, logo 26px).
- **Content:** max width 1120px, padding `32px 24px`. Tools use two columns —
  380px and the rest, gap 24px — stacking to one column under 800px.
- **Inside a panel:** padding 24px, gap 20px (`14px 12px` and 14px on phones).
- **Breakpoints in use:** 800px (columns stack), 600px (phone spacing), 375px
  (very small phones drop extra top-bar links).
- The body keeps the browser's default 8px margin on every page.
- **Don't rely on `position: sticky`.** `html, body { overflow-x: hidden }` in
  `app/globals.css` stops it working on every page. Something that must stay
  in view gets its own scrolling box — the carousel studio's list and editor
  scroll on their own for this reason.

---

## Components

| Component | Recipe |
|---|---|
| **Panel** | Surface colours above, radius 12px, padding 24px, a panel title (uppercase label style) first |
| **Label + helper** | Label above the control; helper text under it in the helper style |
| **Field** | Padding `10px 12px`, 0.875rem, radius 8px; focus brightens the border (and goes white in light) |
| **Choice pills** | 0.8rem, padding `6px 12px`, radius 8px; selected = the "selected" colours with the inner glow |
| **Primary button** | The `--cta` gradient, `--cta-ink` text, 800, radius 8px, shadow `--cta-shadow`; hover lifts 1px. One per view — the main thing to do (Pay, Approve, Schedule) |
| **Solid teal button** | `#2f8e9a`, white text, 700 — confirming a small step, such as Save in an edit box |
| **Outline teal button** | `--teal-soft-bg`, border `--teal-soft-line`, `--teal-ink` text, 700 — secondary actions |
| **Quiet button** | The top-bar style (`--quiet-*`) — navigation, theme, sign out |
| **Destructive button** | `--danger-*`. Anything that deletes or withdraws asks twice: a second click, or Yes/No |
| **Upload zone** | Dashed 1px `rgba(55,152,163,.42)`, radius 8px, light mint-to-blue fill; hover turns solid white and lifts 1px. Dark: border `rgba(130,226,216,.28)`, fill `rgba(33,81,84,.82)` → `rgba(31,59,83,.72)` |
| **List row / card** | Tile colours, padding `14px 16px`, radius 8px; hover border `rgba(67,159,169,.48)`; selected border `rgba(67,159,169,.72)` |
| **Image tile** | Radius 8px, shadow `0 8px 20px rgba(47,142,154,.12)`; generated photos are 4:5 |
| **Spinner** | 20px ring, `rgba(47,142,154,.16)` with a `#2f8e9a` top |
| **Focus** | Every clickable thing: `outline: 2px solid #fff; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(65,199,184,.34)` |

---

## Motion

- 100–150ms on colour, border and background, easing `cubic-bezier(0.23, 1, 0.32, 1)`.
- Pressing a button, pill or card: `transform: scale(0.97)`.
- A 1px hover lift only on the primary button, upload zones and list cards —
  and none on touch screens (`@media (hover: none)`).
- Gallery images enter by fading up 8px over 280ms, 40ms apart.
- `prefers-reduced-motion: reduce` turns transitions and entrances off.

---

## Words on screen

- Plain language: the owner and the customers are not developers. A button
  says what happens ("Approve", "Schedule", "Upload to GIPHY"); an error says
  what went wrong and what to do next.
- Times are Lagos time. Money is naira with thousands separators: ₦1,000.
- Customer-facing text goes through the translation dictionaries (`useT`), and
  a new key goes into all seven languages. Admin tools may be English only.

---

## Home page — dark editorial

The public home page only (`app/landing.module.css`).

- Ground `#080808`; text cream `#fff8ea`, with opacity for hierarchy — links
  `.6`, body `.55`, eyebrow `.45`, notes `.4`; hairlines `rgba(255,248,234,.06)`;
  cards `#111`, or `#111` → `#1a2a2b`.
- Primary button: solid teal `#2f8e9a`, cream text, 700, padding `14px 36px`,
  radius 8px; hover `#267d88` and a 1px lift. Outline button: border
  `rgba(255,248,234,.2)`, turning teal on hover.
- Headline: `clamp(2.6rem, 6vw, 4.2rem)`, weight 800, line-height 1.08,
  tracking `-0.02em`.
- The browser bar and the installed app use `#0a0e14` (`app/manifest.ts`,
  `app/layout.tsx`).

---

## Social deck — slides and GIFs

Images we make for Instagram, drawn on the server by `lib/carousel/render.ts`
and `lib/gif-loop.ts`, in Outfit (`deploy/fonts`, installed by
`deploy/install-fonts.sh`).

- **Slides:** 1080 × 1350 (4:5). Ground `#0b2018` with a soft lift `#12352a`
  toward the centre; mint `#43ccb2` for the rule above each headline, eyebrows,
  the closing button and the photo pills; corner brackets in mint at 45%;
  headlines white, weight 800, tracking `-0.02em`; body `#a9c4ba`; ink `#06150f`
  on mint.
- **Slide 1 is always a photograph** — the before. The cover pairs the before
  and after under its headline; text cards carry eyebrow, headline and body;
  the last card has the mint button.
- **No emoji on slides.** The naira sign is drawn in DejaVu because Outfit has
  none; that is expected.
- **Story GIFs and the GIF Maker:** three or four huge words on a mint `#43ccb2`
  panel, in ink, beside the photograph.
- The words follow `tools/carousel/COPY-FORMULA.md`.

---

## Old admin — black and gold

`/admin` and Template Lab (`app/admin/admin.module.css`): ground `#050505`,
panels `#0e0e0e` with `#1a1a1a` borders, gold `#c9a96e`, mint `#44d4aa`, red
`#ff6b6b`, the system font. Keep it working; build new admin tools in the App
look, as `/admin/carousel` is.

---

## Before a page ships

- Look at it in **both modes**.
- At **phone width** (390px) and on a wide screen.
- With the **keyboard**: every control reachable, focus visible.
- With **long words** — Nigerian names, long headlines, ₦ prices.

---

## Known gaps

- `/creator-dashboard` and the lighting workbench have no dark mode yet.
- The studio's `.statusBar` messages have no dark version.
- `position: sticky` does nothing on any page (see Layout).
- `/admin` and Template Lab still use the old black-and-gold look.
