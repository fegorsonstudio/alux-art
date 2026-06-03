export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
