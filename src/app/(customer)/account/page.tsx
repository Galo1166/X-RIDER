"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type Order, type SupportTicket, type User } from "@/lib/api";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Sheet = "" | "promo" | "safe" | "help" | "notif" | "lang" | "terms" | "priv" | "del";
const FAQ: [string, string][] = [
  ["How do I pay?", "Pay the rider in cash when the package is delivered. No other payment method is available."],
  ["My rider is late", "Use Chat or Call from the tracking screen. You can cancel and choose a reason."],
  ["I was charged the wrong amount", "Open the order in Activity and tap Report."],
  ["How do I change an address?", "Cancel and request again, or tap Repeat on a past order."],
];
const list = (a: string[]): ReactNode => <ul>{a.map((x) => <li key={x}>{x}</li>)}</ul>;

export default function Account() {
  const router = useRouter(), toast = useToast();
  const [u, setU] = useState<User | null>(null), [n, setN] = useState(0), [sheet, setSheet] = useState<Sheet>(""), [pay, setPay] = useState(false), [dark, setDark] = useState(false);
  const [supportSubject, setSupportSubject] = useState("Delivery support");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [supportOrderId, setSupportOrderId] = useState("");
  const [promos, setPromos] = useState<{ code: string; label: string }[]>([]);
  const [supportBusy, setSupportBusy] = useState(false);
  useEffect(() => {
    api.me().then(setU); api.listOrders().then((o) => {
      setN(o.filter((x) => x.status === "Delivered").length);
      setCustomerOrders(o);
    });
    api.pricing().then((pricing) => setPromos(pricing.promos)).catch((error: unknown) => {
      toast(error instanceof Error ? error.message : "Could not load current promotions.");
    });
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : matchMedia("(prefers-color-scheme:dark)").matches);
  }, []);
  useEffect(() => {
    if (sheet !== "help") return;
    api.supportTickets().then(setSupportTickets).catch((error: unknown) => {
      toast(error instanceof Error ? error.message : "Could not load support cases.");
    });
  }, [sheet, toast]);
  const save = (p: Partial<User>) => {
    setU((x) => (x ? { ...x, ...p } : x));
    void api.updateMe(p).catch((error: unknown) => {
      toast(error instanceof Error ? error.message : "Could not save account changes.");
    });
  };
  const nf = u?.nf ?? {};
  const close = () => setSheet("");
  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupportBusy(true);
    try {
      await api.createSupportTicket({
        subject: supportSubject,
        message: supportMessage,
        ...(supportOrderId ? { orderId: supportOrderId } : {}),
      });
      setSupportMessage("");
      setSupportOrderId("");
      setSupportTickets(await api.supportTickets());
      toast("Support request sent.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not send support request.");
    } finally {
      setSupportBusy(false);
    }
  }
  const toggleTheme = () => { const t = dark ? "light" : "dark"; document.documentElement.dataset.theme = t; localStorage.setItem("xr_theme", t); setDark(!dark); };

  return (
    <main className="page"><div className="wrap">
      <h1>Account</h1>
      <div className="prof">
        <div className="av">🧑🏾</div>
        <div style={{ flex: 1 }}>
          <input placeholder="Your name" value={u?.name ?? ""} onChange={(e) => setU((x) => (x ? { ...x, name: e.target.value } : x))} onBlur={() => u && save({ name: u.name })} />
          <div className="mut" style={{ padding: "8px 0" }}>{u?.phone}</div>
          <input type="email" placeholder="Email" value={u?.email ?? ""} onChange={(e) => setU((x) => (x ? { ...x, email: e.target.value } : x))} onBlur={() => u && save({ email: u.email ?? "" })} />
        </div>
        {u?.role === "admin" && <div className="card gl"><div className="ch"><div><b>🛠️ Admin operations</b><div className="mut">Manage deliveries, riders, customers, and fares</div></div><Link className="mini" href="/admin">Open console ↗</Link></div></div>}
      </div>
      <div className="stats"><div className="gl"><b>{n}</b><small className="mut">Deliveries</small></div><div className="gl"><b>5.0 ⭐</b><small className="mut">Rating</small></div><div className="gl"><b>💵</b><small className="mut">Cash</small></div></div>
      <div className="card gl">
        <div className="ch"><div><b>🏍️ Become a rider</b><div className="mut">Apply and log in on the X-RIDER Rider app</div></div>
          <Link className="mini" href="/rider">Open rider app ↗</Link></div>
      </div>
      <label className="fld gl"><span>🏠</span><input placeholder="Add home address" value={u?.home ?? ""} onChange={(e) => save({ home: e.target.value })} /></label>
      <label className="fld gl"><span>💼</span><input placeholder="Add work address" value={u?.work ?? ""} onChange={(e) => save({ work: e.target.value })} /></label>

      <button className="mr" onClick={() => setPay(!pay)}>💵 Payment <em>Cash only</em></button>
      {pay && <div className="mut" style={{ padding: "4px 4px 10px" }}>Cash is the only payment method. Pay your rider on delivery.</div>}
      <button className="mr" onClick={() => setSheet("promo")}>🏷️ Promotions</button>
      <button className="mr" onClick={() => setSheet("safe")}>🛡️ Safety</button>
      <button className="mr" onClick={() => setSheet("help")}>❓ Help</button>
      <button className="mr" onClick={() => setSheet("notif")}>🔔 Notifications</button>
      <button className="mr" onClick={() => setSheet("lang")}>🌐 Language <em>English</em></button>
      <button className="mr" onClick={() => setSheet("terms")}>📄 Terms of Service</button>
      <button className="mr" onClick={() => setSheet("priv")}>🔐 Privacy Policy</button>
      <button className="mr" onClick={toggleTheme}>🌙 Dark mode <em>{dark ? "On" : "Off"}</em></button>
      <button className="mr" onClick={async () => { try { await api.logOut(); router.replace("/login"); } catch (error) { toast(error instanceof Error ? error.message : "Could not log out."); } }}>🚪 Log out</button>
      <button className="mr" style={{ color: "#ef4444" }} onClick={() => setSheet("del")}>🗑️ Delete account</button>

      {sheet === "promo" && <Modal title="Promotions" onClose={close}>{promos.length ? promos.map((promo) => <div className="card gl" key={promo.code}><b>{promo.code}</b><small className="mut">{promo.label}</small></div>) : <p className="mut">There are no active promotions right now.</p>}<p className="mut">Enter a code on the last step before requesting a rider.</p></Modal>}
      {sheet === "safe" && <Modal title="Safety" onClose={close}>{list(["Check the rider's name and plate number before handing over your package.", "Share your trip with someone you trust using Share trip.", "Tell the rider your PIN only at pickup.", "Never pay anything except the fare shown in the app, in cash."])}</Modal>}
      {sheet === "help" && <Modal title="Help & support" onClose={close}>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        <form onSubmit={(event) => void submitSupport(event)} style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <label className="booking-field-group">Subject<input className="booking-field" value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} minLength={3} maxLength={160} required /></label>
          <label className="booking-field-group">Related delivery (optional)<select className="booking-field" value={supportOrderId} onChange={(event) => setSupportOrderId(event.target.value)}><option value="">No specific delivery</option>{customerOrders.map((order) => <option key={order.id} value={order.id}>{order.id} · {order.status}</option>)}</select></label>
          <label className="booking-field-group">How can we help?<textarea className="ta" value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} minLength={5} maxLength={3000} required /></label>
          <button className="btn" type="submit" disabled={supportBusy || supportMessage.trim().length < 5}>{supportBusy ? "Sending…" : "Send support request"}</button>
        </form>
        {supportTickets.map((ticket) => <div className="card gl" key={ticket.id}><b>{ticket.subject}</b><small className="mut">{ticket.id} · {ticket.status.replace("_", " ")}</small>{ticket.resolution && <small>{ticket.resolution}</small>}</div>)}
      </Modal>}
      {sheet === "notif" && (
        <Modal title="Notifications" onClose={close}>
          {([["o", "Order updates"], ["c", "Chat messages"], ["p", "Promotions"]] as const).map(([k, l]) => (
            <label key={k} className="fld gl" style={{ padding: 12 }}><span style={{ flex: 1 }}>{l}</span><input type="checkbox" style={{ flex: "none" }} checked={nf[k] !== false} onChange={(e) => save({ nf: { ...nf, [k]: e.target.checked } })} /></label>
          ))}
        </Modal>
      )}
      {sheet === "lang" && <Modal title="Language" onClose={close}><p className="mut">English is the only language available right now. Hausa, Yoruba and Igbo are planned.</p></Modal>}
      {sheet === "terms" && <Modal title="Terms of Service" onClose={close}><p className="mut">Sample text. Replace with your own legal terms.</p>{list(["Payment is in cash only, paid to the rider on delivery.", "Do not send illegal or dangerous items.", "Riders are independent partners, not employees.", "Cancelling after a rider is on the way may be limited."])}</Modal>}
      {sheet === "priv" && <Modal title="Privacy Policy" onClose={close}><p className="mut">Sample text. Replace with your own policy.</p>{list(["We store your name, phone number, email and order history.", "Your location is used only to match you with riders.", "Rider documents are used only for verification.", "You can delete your account at any time."])}</Modal>}
      {sheet === "del" && (
        <Modal title="Delete account?" onClose={close}>
          <p className="mut">This permanently deletes your account, orders and saved places on this device.</p>
          <button className="btn" style={{ background: "#ef4444", color: "#fff", boxShadow: "none" }} onClick={async () => { try { await api.deleteAccount(); router.replace("/login"); } catch (error) { toast(error instanceof Error ? error.message : "Could not delete account."); } }}>Delete my account</button>
          <button className="btn sec" onClick={close}>Keep account</button>
        </Modal>
      )}
    </div></main>
  );
}
