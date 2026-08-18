export function isAdminRole(role: string | null | undefined): boolean {
  return String(role ?? "").toUpperCase() === "ADMIN";
}
