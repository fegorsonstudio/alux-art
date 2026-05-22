export interface ThemeDef {
  value: string;
  label: string;
  desc: string;
  previewBg: string;
  previewAccent: string;
  dark: boolean;
  vars: Record<string, string>;
}

export interface FontDef {
  value: string;
  label: string;
  desc: string;
  heading: string;
  body: string;
  googleUrl: string | null;
}

export const THEMES: ThemeDef[] = [
  {
    value: "alux",
    label: "Alux",
    desc: "Warm teal gradient",
    previewBg: "linear-gradient(135deg,#fff8ea,#e5fbf6,#d9efff)",
    previewAccent: "#2f8e9a",
    dark: false,
    vars: {
      "--st-bg": "linear-gradient(135deg,#fff8ea 0%,#e5fbf6 40%,#d9efff 100%)",
      "--st-text": "#263235",
      "--st-text-muted": "#4e7076",
      "--st-accent": "#2f8e9a",
      "--st-accent-dim": "rgba(47,142,154,0.1)",
      "--st-surface": "rgba(255,255,255,0.74)",
      "--st-surface-border": "rgba(255,255,255,0.88)",
      "--st-nav-bg": "rgba(255,248,234,0.88)",
      "--st-btn-bg": "linear-gradient(135deg,#ffffff 0%,#aff0e4 48%,#9fd7ff 100%)",
      "--st-btn-text": "#263235",
      "--st-shadow": "rgba(53,130,143,0.12)",
    },
  },
  {
    value: "noir",
    label: "Noir",
    desc: "Editorial black & gold",
    previewBg: "linear-gradient(135deg,#111,#222)",
    previewAccent: "#c9a84c",
    dark: true,
    vars: {
      "--st-bg": "linear-gradient(160deg,#0f0f0f 0%,#1c1c1c 50%,#0d0d0d 100%)",
      "--st-text": "#f0ece4",
      "--st-text-muted": "#8a8278",
      "--st-accent": "#c9a84c",
      "--st-accent-dim": "rgba(201,168,76,0.12)",
      "--st-surface": "rgba(28,28,28,0.95)",
      "--st-surface-border": "rgba(201,168,76,0.16)",
      "--st-nav-bg": "rgba(10,10,10,0.96)",
      "--st-btn-bg": "linear-gradient(135deg,#c9a84c,#a88830)",
      "--st-btn-text": "#0f0f0f",
      "--st-shadow": "rgba(0,0,0,0.42)",
    },
  },
  {
    value: "bloom",
    label: "Bloom",
    desc: "Soft rose & blush",
    previewBg: "linear-gradient(135deg,#fff5f7,#fce4ec,#f8bbd9)",
    previewAccent: "#d63060",
    dark: false,
    vars: {
      "--st-bg": "linear-gradient(135deg,#fff5f7 0%,#fce4ec 45%,#f8bbd9 100%)",
      "--st-text": "#3d1a24",
      "--st-text-muted": "#9a6072",
      "--st-accent": "#d63060",
      "--st-accent-dim": "rgba(214,48,96,0.1)",
      "--st-surface": "rgba(255,255,255,0.82)",
      "--st-surface-border": "rgba(255,255,255,0.92)",
      "--st-nav-bg": "rgba(255,240,245,0.92)",
      "--st-btn-bg": "linear-gradient(135deg,#d63060,#e8668e)",
      "--st-btn-text": "#ffffff",
      "--st-shadow": "rgba(180,60,90,0.1)",
    },
  },
  {
    value: "minimal",
    label: "Minimal",
    desc: "Clean white & black",
    previewBg: "#f8f7f5",
    previewAccent: "#111111",
    dark: false,
    vars: {
      "--st-bg": "#f8f7f5",
      "--st-text": "#111111",
      "--st-text-muted": "#666666",
      "--st-accent": "#111111",
      "--st-accent-dim": "rgba(0,0,0,0.06)",
      "--st-surface": "#ffffff",
      "--st-surface-border": "rgba(0,0,0,0.08)",
      "--st-nav-bg": "rgba(248,247,245,0.96)",
      "--st-btn-bg": "#111111",
      "--st-btn-text": "#ffffff",
      "--st-shadow": "rgba(0,0,0,0.08)",
    },
  },
  {
    value: "lagos",
    label: "Lagos",
    desc: "Vibrant orange & warm cream",
    previewBg: "linear-gradient(135deg,#fffbf0,#fff3e0,#fbe9c8)",
    previewAccent: "#e65c1a",
    dark: false,
    vars: {
      "--st-bg": "linear-gradient(135deg,#fffbf0 0%,#fff3e0 45%,#fbe9c8 100%)",
      "--st-text": "#1e1208",
      "--st-text-muted": "#7a5832",
      "--st-accent": "#e65c1a",
      "--st-accent-dim": "rgba(230,92,26,0.1)",
      "--st-surface": "rgba(255,255,255,0.82)",
      "--st-surface-border": "rgba(255,255,255,0.92)",
      "--st-nav-bg": "rgba(255,251,240,0.94)",
      "--st-btn-bg": "linear-gradient(135deg,#e65c1a,#f07b3e)",
      "--st-btn-text": "#ffffff",
      "--st-shadow": "rgba(180,80,20,0.1)",
    },
  },
  {
    value: "dusk",
    label: "Dusk",
    desc: "Deep purple twilight",
    previewBg: "linear-gradient(135deg,#1a0a2e,#2d1b4e,#1e0f38)",
    previewAccent: "#c084f5",
    dark: true,
    vars: {
      "--st-bg": "linear-gradient(160deg,#1a0a2e 0%,#2d1b4e 45%,#1e0f38 100%)",
      "--st-text": "#f0e8ff",
      "--st-text-muted": "#9980c8",
      "--st-accent": "#c084f5",
      "--st-accent-dim": "rgba(192,132,245,0.12)",
      "--st-surface": "rgba(40,18,68,0.88)",
      "--st-surface-border": "rgba(192,132,245,0.18)",
      "--st-nav-bg": "rgba(20,8,38,0.96)",
      "--st-btn-bg": "linear-gradient(135deg,#c084f5,#a855f7)",
      "--st-btn-text": "#1a0a2e",
      "--st-shadow": "rgba(0,0,0,0.38)",
    },
  },
];

export const FONTS: FontDef[] = [
  {
    value: "default",
    label: "Default",
    desc: "Clean system sans-serif",
    heading: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
    body: "var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
    googleUrl: null,
  },
  {
    value: "editorial",
    label: "Editorial",
    desc: "Playfair Display + Lato",
    heading: "'Playfair Display', Georgia, serif",
    body: "'Lato', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Lato:wght@300;400;700&display=swap",
  },
  {
    value: "modern",
    label: "Modern",
    desc: "DM Serif Display + DM Sans",
    heading: "'DM Serif Display', Georgia, serif",
    body: "'DM Sans', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap",
  },
  {
    value: "luxury",
    label: "Luxury",
    desc: "Cormorant Garamond + Montserrat",
    heading: "'Cormorant Garamond', Georgia, serif",
    body: "'Montserrat', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;600;700&family=Montserrat:wght@300;400;500;600&display=swap",
  },
  {
    value: "bold",
    label: "Bold",
    desc: "Space Grotesk — strong geometric",
    heading: "'Space Grotesk', system-ui, sans-serif",
    body: "'Space Grotesk', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap",
  },
  {
    value: "warm",
    label: "Warm",
    desc: "Libre Baskerville + Source Sans",
    heading: "'Libre Baskerville', Georgia, serif",
    body: "'Source Sans 3', system-ui, sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Libre+Baskerville:wght@400;700&family=Source+Sans+3:wght@300;400;600&display=swap",
  },
];

export function getTheme(value: string): ThemeDef {
  return THEMES.find(t => t.value === value) ?? THEMES[0];
}

export function getFont(value: string): FontDef {
  return FONTS.find(f => f.value === value) ?? FONTS[0];
}
