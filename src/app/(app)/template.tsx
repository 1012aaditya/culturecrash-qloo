/** Re-mounts on every navigation (not on data refreshes), so each new page eases in. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cc-page">{children}</div>;
}
