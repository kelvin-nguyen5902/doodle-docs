// mirrors the backend/DB constraint: must start with a letter, then only
// letters, numbers, "." and "_"
export const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9._]*$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}
