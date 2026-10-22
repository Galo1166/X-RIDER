"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type RiderEarning } from "@/lib/api";
import { useRider } from "@/lib/rider";
import { naira } from "@/lib/pricing";
import { useToast } from "@/components/Toast";

const PERIODS = [["d", "Today"], ["w", "This week"], ["a", "All time"]] as const;
type Period = typeof PERIODS[number][0];

function lagosDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function Earnings() {
  const { profile } = useRider();
  const toast = useToast();
  const [period, setPeriod] = useState<Period>("d");
  const [earnings, setEarnings] = useState<RiderEarning[]>([]);

  useEffect(() => {
    let active = true;
    api.riderEarnings()
      .then((rows) => { if (active) setEarnings(rows); })
      .catch((error: unknown) => toast(error instanceof Error ? error.message : "Could not load rider earnings."));
    return () => { active = false; };
  }, [toast]);

  const selected = useMemo(() => {
    const now = Date.now();
    return earnings.filter((earning) => period === "d"
      ? earning.serviceDate === lagosDateKey(new Date())
      : period === "w" ? earning.deliveredAt >= now - 7 * 864e5 : true);
  }, [earnings, period]);
  const gross = selected.reduce((total, earning) => total + earning.price, 0);
  const commission = selected.reduce((total, earning) => total + earning.commissionAmount, 0);
  const retained = gross - commission;

  return (
    <main className="page rider-page"><div className="wrap">
      <h1>Earnings</h1>
      <div className="seg">{PERIODS.map(([key, label]) => <button key={key} className={period === key ? "on" : ""} onClick={() => setPeriod(key)}>{label}</button>)}</div>
      <div className="stats">
        <div className="gl"><b>{naira(gross)}</b><small className="mut">Cash collected</small></div>
        <div className="gl"><b>-{naira(commission)}</b><small className="mut">Recorded commission</small></div>
        <div className="gl"><b>{naira(retained)}</b><small className="mut">After commission</small></div>
      </div>
      <div className="card gl">
        <div className="ch"><b>Outstanding commission</b><b style={{ fontSize: 22 }}>{naira(profile?.commissionDue ?? 0)}</b></div>
        <small className="mut">{profile?.commissionOverdue ? "Overdue. Contact X-RIDER to arrange settlement." : "Commission is tracked by X-RIDER. Contact operations to record a settlement."}</small>
      </div>
      <h2>Completed deliveries <small className="mut">({selected.length})</small></h2>
      {selected.length === 0 ? <p className="mut">No completed deliveries in this period.</p> : selected.map((earning) => (
        <div className="card gl" key={earning.id}>
          <div className="ch"><b>{earning.to}</b><b>{naira(earning.price)}</b></div>
          <small className="mut">From {earning.from} · {new Date(earning.deliveredAt).toLocaleString("en-NG")} · Commission {naira(earning.commissionAmount)} · {earning.settled ? "Settled" : "Outstanding"}</small>
        </div>
      ))}
    </div></main>
  );
}
