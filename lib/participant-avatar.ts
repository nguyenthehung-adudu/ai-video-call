/** Never returns empty/undefined; Dicebear initials as final fallback. */
export function memberAvatarUrl(
  image: string | undefined | null,
  nameOrId: string,
): string {
  const trimmed = image?.trim();
  if (trimmed) return trimmed;
  const seed = nameOrId?.trim() || 'User';
  return dicebearInitials(seed);
}

/** Public Dicebear initials URL for any seed. */
export function dicebearInitials(seed: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || 'User')}`;
}
