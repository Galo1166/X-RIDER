"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/home", "Home", "home"],
  ["/activity", "Activity", "history"],
  ["/account", "Account", "person"],
] as const;
type Tab = readonly [string, string, string?];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <path d="m3 11 9-8 9 8v9H3v-9Zm6 9v-6h6v6" />,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5m4-1v5l3 2" /></>,
    person: <><circle cx="12" cy="8" r="3" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

export default function BottomNav({ tabs = TABS, className = "" }: { tabs?: readonly Tab[]; className?: string }) {
  const path = usePathname();
  return (
    <nav className={`nav gl${className ? ` ${className}` : ""}`}>
      {tabs.map(([href, label, icon]) => (
        <Link key={href} href={href} className={path === href ? "on" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <Icon name={icon ?? label.toLowerCase()} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
