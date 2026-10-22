"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Order } from "@/lib/api";
import { naira } from "@/lib/pricing";
import { useTrip } from "@/lib/trip";
import { useToast } from "@/components/Toast";
import Receipt from "@/components/Receipt";
import Modal from "@/components/Modal";

const FILTERS = ["All", "In progress", "Delivered", "Cancelled", "Scheduled"] as const;
const PROBLEMS = ["Package damaged", "Rider was rude", "Wrong charge", "Delivery was late", "Other"];
const tm = (n?: number) => (n ? new Date(n).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }) : "—");
const dt = (n: number) => new Date(n).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ACTIVE = ["Searching", "Rider assigned", "At pickup", "Picked up", "Out for delivery"];
const cls = (s: string) => (s === "Delivered" ? "" : s === "Scheduled" || ACTIVE.includes(s) ? " wt" : " no");

export default function Activity() {
  const router = useRouter(), toast = useToast(), { setDraft } = useTrip();
  const [orders, setOrders] = useState<Order[] | null>(null), [f, setF] = useState<(typeof FILTERS)[number]>("All"), [open, setOpen] = useState("");
  const [rc, setRc] = useState<Order | null>(null), [rp, setRp] = useState<Order | null>(null), [reason, setReason] = useState(""), [text, setText] = useState("");
  const load = () => api.listOrders().then(setOrders);
  useEffect(() => { load(); }, []);

  const list = (orders ?? []).filter((o) => f === "All" || (f === "In progress" ? ACTIVE.includes(o.status) : o.status === f));
  return (
    <main className="page"><div className="wrap">
      <h1>Activity</h1>
      <div className="seg">{FILTERS.map((x) => <button key={x} className={f === x ? "on" : ""} onClick={() => setF(x)}>{x}</button>)}</div>
      {orders === null ? <p className="mut">Loading…</p> : list.length === 0 ? (
        <div style={{ textAlign: "center", padding: 24 }}><div style={{ fontSize: 48 }}>🛵</div><h2>No deliveries yet</h2><p className="mut">Your orders will show up here</p></div>
      ) : list.map((o) => {
        const isOpen = open === o.id, done = o.status === "Delivered";
        return (
          <div key={o.id} className="card gl" style={{ cursor: "pointer" }} onClick={() => setOpen(isOpen ? "" : o.id)}>
            <div className="ch"><b>{o.to}</b><span className={`bd${cls(o.status)}`}>{o.status}</span></div>
            <small className="mut">From {o.from}</small>
            <div className="ch"><small className="mut">{dt(o.createdAt)} · {o.mode}</small><span className="mut" style={{ fontSize: 13 }}>{isOpen ? "Hide ▲" : "Details ▼"}</span></div>
            <b>{naira(o.price)} cash</b>
            {isOpen && (
              <div style={{ display: "grid", gap: 12, borderTop: "1px solid var(--ln)", marginTop: 8, paddingTop: 12, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
                <div className="rm"><svg viewBox="0 0 300 130" preserveAspectRatio="none">
                  <path d="M30 100C90 90 110 45 170 50S250 30 270 28" fill="none" stroke="var(--g)" strokeWidth={5} strokeLinecap="round" strokeDasharray={done ? undefined : "2 10"} />
                  <circle cx={30} cy={100} r={8} fill="var(--g)" stroke="#fff" strokeWidth={3} /><rect x={262} y={20} width={16} height={16} fill="#111" stroke="#fff" strokeWidth={3} />
                </svg></div>
                {o.rider ? (
                  <div className="rider"><div className="av" style={{ width: 44, height: 44, fontSize: 22 }}>🧑🏾</div><div><b>{o.rider.name}</b><div className="mut">⭐ {o.rider.rating} · Dispatch rider</div></div><div className="pl">{o.rider.plate}</div></div>
                ) : <div className="mut">No rider was assigned</div>}
                <div className="tl">
                  <div><i className="on" />Requested <b>{tm(o.reqAt)}</b></div>
                  {o.arrivedAt && <div><i className="on" />Rider arrived at pickup <b>{tm(o.arrivedAt)}</b></div>}
                  <div><i className={o.pickAt ? "on" : ""} />Picked up <b>{tm(o.pickAt)}</b></div>
                  <div><i className={done ? "on" : ""} />{o.status} <b>{o.status === "Scheduled" && o.scheduledFor ? dt(new Date(o.scheduledFor).getTime()) : tm(o.endAt)}</b></div>
                </div>
                <div className="kv">
                  <span>Order ID</span><b>{o.id}</b><span>Distance</span><b>{o.km.toFixed(1)} km</b>
                  <span>{o.mode === "Receive" ? "Sender's phone" : "Receiver's phone"}</span><b>{o.phone || "—"}</b>
                  <span>Package</span><b>{o.pk || "—"}</b><span>Your rating</span><b>{o.rate ? `${o.rate} ★` : "—"}</b>
                  <span>Feedback</span><b>{o.tags?.join(", ") || "—"}</b><span>Payment</span><b>Cash</b><span>Total</span><b>{naira(o.price)}</b>
                </div>
                {o.comment && <div className="mut">“{o.comment}”</div>}
                {o.note && <div className="mut">Note: {o.note}</div>}
                {o.reason && <div className="mut">Cancelled: {o.reason}</div>}
                {o.issue && <div className="mut">Reported: {o.issue}</div>}
                <div className="acts">
                  {ACTIVE.includes(o.status) && <button onClick={() => router.push("/home")}>Track delivery</button>}
                  {done && <button onClick={() => setRc(o)}>🧾 Receipt</button>}
                  {done && <button onClick={() => { setRp(o); setReason(""); setText(""); }}>⚠️ Report</button>}
                  <button onClick={() => { setDraft({ from: o.from, to: o.to, mode: o.mode }); router.push("/home"); }}>Repeat</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {rc && <Receipt onClose={() => setRc(null)} o={{ id: rc.id, from: rc.from, to: rc.to, km: rc.km, price: rc.price, baseFare: rc.baseFare, distanceFare: rc.distanceFare, discount: rc.discount, rider: rc.rider?.name, at: rc.endAt ?? rc.createdAt }} />}
      {rp && (
        <Modal title="Report a problem" onClose={() => setRp(null)}>
          <div className="chips">{PROBLEMS.map((r) => <button key={r} className={`chip${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
          <textarea className="ta" placeholder="Tell us more (optional)" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn" disabled={!reason} onClick={async () => { await api.updateOrder(rp.id, { issue: reason + (text.trim() ? " – " + text.trim() : "") }); toast("Report sent. We'll review it"); setRp(null); load(); }}>Send report</button>
        </Modal>
      )}
    </div></main>
  );
}
