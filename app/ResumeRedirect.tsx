"use client";

import { useEffect } from "react";

// After a mid-checkout Google sign-in, the OAuth `next` param sometimes doesn't
// survive (Supabase can bounce the user to the Site URL / home). This catches that:
// if a checkout resume is pending and we didn't land on that template page, send
// the buyer straight back to it in resume mode so their saved config + photos load.
const KEY = "aluxart_resume_tid";

export default function ResumeRedirect() {
  useEffect(() => {
    const path = window.location.pathname;
    // Never fire while heading INTO sign-in (the flag is set just before /login), only
    // once the buyer has come back out to a normal page.
    if (path === "/login" || path.startsWith("/api/")) return;
    let tid: string | null = null;
    try { tid = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (!tid) return;
    const target = `/marketplace/${tid}`;
    if (path !== target) {
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      window.location.replace(`${target}?resume=1`);
    }
    // If we ARE already on the target page, leave the flag for the page to consume.
  }, []);

  return null;
}
