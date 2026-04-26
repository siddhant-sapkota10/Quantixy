export const DASHBOARD_NAV = [
  { href: "/", label: "Home", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5z" },
  { href: "/play", label: "Play", icon: "M13 2 4 14h7l-1 8 10-12h-7l1-8z" },
  { href: "/loadout", label: "Loadout", icon: "M5 4h14l-2 16H7L5 4zm4 4h6m-7 4h8" },
  { href: "/shop", label: "Shop", icon: "M6 7h12l-1 13H7L6 7zm3 0a3 3 0 0 1 6 0" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0" },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    icon: "M7 9H5a3 3 0 0 1 0-6h2m10 6h2a3 3 0 0 0 0-6h-2M7 4h10v6a5 5 0 0 1-10 0V4zm5 11v4m-4 0h8",
  },
] as const;

export function isDashboardNavActive(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/";
  return Boolean(pathname?.startsWith(href));
}
