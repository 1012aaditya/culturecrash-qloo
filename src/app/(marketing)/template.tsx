/** Re-mounts on every navigation, so each marketing page eases in. */
export default function MarketingTemplate({ children }: { children: React.ReactNode }) {
  return <div className="cc-page">{children}</div>;
}
