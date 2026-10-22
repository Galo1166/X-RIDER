"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRider } from "@/lib/rider";
import { useToast } from "@/components/Toast";

export default function RiderAccount() {
  const { user, profile, logOut } = useRider();
  const router = useRouter(), toast = useToast();
  const [dark, setDark] = useState(false), [busy, setBusy] = useState(false);

  useEffect(() => {
    const theme = document.documentElement.dataset.theme;
    setDark(theme ? theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches);
  }, []);

  const toggleTheme = () => {
    const theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("xr_theme", theme);
    setDark(!dark);
  };
  const contactSupport = async () => {
    setBusy(true);
    try {
      await api.createSupportTicket({ subject: "Rider account support", message: "I need help with my X-RIDER rider account." });
      toast("Support request submitted.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not submit a support request.");
    } finally {
      setBusy(false);
    }
  };

  if (!user || !profile) return null;
  return (
    <main className="page rider-page"><div className="wrap">
      <h1>Account</h1>
      <div className="card gl" style={{ gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "center" }}>
        <div className="av">🧑🏾</div>
        <div>
          <b>{user.name}</b>
          <div className="mut">{user.phone}</div>
          <div className="mut">🏍️ {profile.vehicleType ?? "Vehicle"} · {profile.plate} · Approved rider</div>
          {profile.operatingArea && <div className="mut">📍 {profile.operatingArea}</div>}
        </div>
      </div>
      <h2 style={{ marginTop: 6 }}>Preferences</h2>
      <button className="mr" onClick={toggleTheme}>🌙 Dark mode <em>{dark ? "On" : "Off"}</em></button>
      <button className="mr" disabled={busy} onClick={() => void contactSupport()}>❓ {busy ? "Contacting support…" : "Contact support"}</button>
      <button className="mr" onClick={async () => { try { await logOut(); router.replace("/rider/login"); } catch (error) { toast(error instanceof Error ? error.message : "Could not log out."); } }}>🚪 Log out</button>
    </div></main>
  );
}
