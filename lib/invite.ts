/** Build a pipe-delimited search string from email list (lowercased, sorted). */
export function buildInvitedEmailsStr(emails: string[]): string {
  const parts = emails
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean)
    .sort();
  if (!parts.length) return '';
  return `|${parts.join('|')}|`;
}

/** Parse comma/semicolon/space separated email string into trimmed array. */
export function parseEmailList(input: string): string[] {
  return input
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when `invitedStr` (pipe-formatted) contains the given email (case-insensitive). */
export function isEmailInvited(
  invitedStr: string | undefined,
  email: string | undefined,
): boolean {
  if (!invitedStr || !email) return false;
  return invitedStr.includes(`|${email.toLowerCase().trim()}|`);
}
