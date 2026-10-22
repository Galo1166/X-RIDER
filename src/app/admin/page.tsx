"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, BadgeCheck, Banknote, Bike, ClipboardList, Headset, LayoutDashboard, LogOut, Percent,
  RefreshCw, Search, ShieldCheck, Tag, Users, Wallet,
} from "lucide-react";
import { api, type AdminCashRow, type AdminCommissionReport, type AdminOrder, type AdminRider, type AdminSummary, type AdminUser, type AuditEntry, type FareSettings, type Order, type PromoRecord, type SupportTicket } from "@/lib/api";
import { naira } from "@/lib/pricing";
import { useToast } from "@/components/Toast";

const SECTIONS = [
  ["overview", "Overview", LayoutDashboard],
  ["orders", "Orders", ClipboardList],
  ["riders", "Riders", Bike],
  ["users", "Customers & access", Users],
  ["cash", "Cash", Wallet],
  ["commission", "Commission", Percent],
  ["support", "Support", Headset],
  ["pricing", "Pricing & promos", Tag],
  ["admins", "Administrators", ShieldCheck],
  ["audit", "Audit history", Activity],
] as const;
type Section = typeof SECTIONS[number][0];

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatServiceDate(serviceDate: string) {
  const [year, month, day] = serviceDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function Panel({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return <section className="admin-panel"><div className="admin-panel-title"><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div></div>{children}</section>;
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="admin-empty">{children}</div>;
}

export default function AdminHome() {
  const router = useRouter();
  const toast = useToast();
  const [section, setSection] = useState<Section>("overview");
  const [adminName, setAdminName] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<AdminSummary | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [riders, setRiders] = useState<AdminRider[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userDetails, setUserDetails] = useState<(AdminUser & { orders: Order[] }) | null>(null);
  const [cash, setCash] = useState<AdminCashRow[]>([]);
  const [commissionReport, setCommissionReport] = useState<AdminCommissionReport | null>(null);
  const [commissionRate, setCommissionRate] = useState(20);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [settings, setSettings] = useState<FareSettings>({ base: 900, perKm: 150, minimum: 300, roundTo: 50 });
  const [promos, setPromos] = useState<PromoRecord[]>([]);
  const [admins, setAdmins] = useState<{ id: string; name: string; phone: string; email: string }[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [newPromo, setNewPromo] = useState({
    code: "", label: "", kind: "percent" as "percent" | "fixed", value: 10,
    startsAt: "", endsAt: "", maxRedemptions: "",
  });
  const [remitAmounts, setRemitAmounts] = useState<Record<string, string>>({});
  const [remitNotes, setRemitNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([api.me(), api.adminMe()])
      .then(([user, admin]) => {
        if (!mounted) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        setAdminName(admin.name);
        setCurrentAdminId(admin.id);
        setReady(true);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        const message = error instanceof Error ? error.message : "Administrator access could not be verified.";
        if (message.includes("Administrator access")) {
          setAdminName("");
          setReady(true);
          setLoading(false);
        } else {
          toast(message);
          router.replace("/login");
        }
      });
    return () => { mounted = false; };
  }, [router, toast]);

  const loadSection = useCallback(async (target: Section = section, showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      if (target === "overview") setOverview(await api.adminOverview());
      if (target === "orders") {
        const [adminOrders, adminRiders] = await Promise.all([api.adminOrders(search, orderStatus), api.adminRiders()]);
        setOrders(adminOrders);
        setRiders(adminRiders);
      }
      if (target === "riders") setRiders(await api.adminRiders());
      if (target === "users") setUsers(await api.adminUsers(search));
      if (target === "cash") setCash(await api.adminCash());
      if (target === "commission") {
        const report = await api.adminCommission();
        setCommissionReport(report);
        setCommissionRate(report.ratePercent);
      }
      if (target === "support") setTickets(await api.adminSupport());
      if (target === "pricing") {
        const pricing = await api.adminPricing();
        setSettings({ base: pricing.base, perKm: pricing.perKm, minimum: pricing.minimum, roundTo: pricing.roundTo });
        setPromos(pricing.promos);
      }
      if (target === "admins") setAdmins(await api.adminAccounts());
      if (target === "audit") setAudit(await api.adminAudit());
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not load the selected admin view.");
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, [orderStatus, search, section, toast]);

  useEffect(() => {
    if (ready && adminName) void loadSection(section);
  }, [adminName, loadSection, ready, section]);

  useEffect(() => {
    if (!ready || !adminName || section !== "commission") return;
    const refreshCommission = () => {
      if (document.visibilityState === "visible") void loadSection("commission");
    };
    const interval = window.setInterval(refreshCommission, 30_000);
    document.addEventListener("visibilitychange", refreshCommission);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshCommission);
    };
  }, [adminName, loadSection, ready, section]);

  async function act(action: () => Promise<unknown>, success: string, reload: Section = section): Promise<boolean> {
    setBusy(true);
    try {
      await action();
      toast(success);
      await loadSection(reload);
      if (reload !== "overview") await loadSection("overview");
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : "Admin action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.logOut();
      router.replace("/login");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  function updateSetting(key: keyof FareSettings, value: string) {
    setSettings((current) => ({ ...current, [key]: Number(value) }));
  }

  async function savePricing(event: FormEvent) {
    event.preventDefault();
    await act(() => api.updateAdminPricing(settings), "Fare settings saved.", "pricing");
  }

  async function saveCommissionRate(event: FormEvent) {
    event.preventDefault();
    await act(() => api.updateAdminCommissionRate(commissionRate), "Commission rate saved for future deliveries.", "commission");
  }

  async function settleCommissionDay(row: NonNullable<AdminCommissionReport>["rows"][number]) {
    if (!window.confirm(`Confirm receipt of ${naira(row.commissionDue)} commission from ${row.riderName} for ${formatServiceDate(row.serviceDate)}? This settles the full day's balance.`)) return;
    await act(
      () => api.settleAdminCommissionDay(row.riderId, row.serviceDate),
      "Daily rider commission settled.",
      "commission",
    );
  }

  async function createPromo(event: FormEvent) {
    event.preventDefault();
    const saved = await act(() => api.createAdminPromo({
      label: newPromo.label,
      kind: newPromo.kind,
      value: newPromo.value,
      code: newPromo.code.trim().toUpperCase(),
      active: true,
      startsAt: newPromo.startsAt ? new Date(newPromo.startsAt).toISOString() : null,
      endsAt: newPromo.endsAt ? new Date(newPromo.endsAt).toISOString() : null,
      maxRedemptions: newPromo.maxRedemptions ? Number(newPromo.maxRedemptions) : null,
    }), "Promo code created.", "pricing");
    if (saved) setNewPromo({ code: "", label: "", kind: "percent", value: 10, startsAt: "", endsAt: "", maxRedemptions: "" });
  }

  async function recordRemittance(rider: AdminCashRow) {
    const amount = Number(remitAmounts[rider.id]);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      toast("Enter a whole-number remittance amount.");
      return;
    }
    const saved = await act(() => api.recordCashRemittance(rider.id, amount, remitNotes[rider.id] || ""), "Cash remittance recorded.", "cash");
    if (saved) {
      setRemitAmounts((current) => ({ ...current, [rider.id]: "" }));
      setRemitNotes((current) => ({ ...current, [rider.id]: "" }));
    }
  }

  async function showUserDetails(id: string) {
    setBusy(true);
    try {
      setUserDetails(await api.adminUser(id));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not load this customer record.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="admin-loading">Checking administrator access…</main>;
  if (!ready || !adminName) {
    return (
      <main className="admin-access-page">
        <section className="admin-access-card">
          <ShieldCheck size={32} />
          <p className="admin-eyebrow">ADMIN WORKSPACE</p>
          <h1>Administrator access required</h1>
          <p>Set <code>ADMIN_PHONE</code> in your local <code>.env.local</code> to the Nigerian phone number of the first admin, restart the API, then sign in again with that account.</p>
          <button type="button" className="admin-primary" onClick={() => router.replace("/login")}>Go to sign in</button>
        </section>
      </main>
    );
  }

  const statCards = overview ? [
    ["Orders today", overview.todayOrders, ClipboardList, "New booking volume"],
    ["Active deliveries", overview.activeOrders, Bike, `${overview.onlineRiders} riders online`],
    ["Pending rider approvals", overview.pendingRiders, BadgeCheck, `${overview.riders} rider profiles`],
    ["Delivered today", naira(overview.todayGross), Banknote, "Customer cash collected"],
    ["Commission today", naira(overview.todayCommission), Percent, "Completed rider fares"],
    ["Commission outstanding", naira(overview.outstandingCommission), Wallet, "Daily rider settlements due"],
    ["Cash outstanding", naira(overview.outstandingCash), Wallet, "Rider remittances due"],
    ["Open support cases", overview.openSupport, Headset, `${overview.users} customer accounts`],
  ] as const : [];

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><span><ShieldCheck size={20} /></span><b>X-RIDER<small>OPERATIONS</small></b></div>
        <div className="admin-sidebar-label">WORKSPACE</div>
        <nav className="admin-side-nav" aria-label="Admin sections">
          {SECTIONS.map(([key, label, Icon]) => (
            <button key={key} type="button" className={section === key ? "active" : ""} onClick={() => setSection(key)}>
              <Icon size={17} /><span>{label}</span>
              {key === "riders" && overview?.pendingRiders ? <i>{overview.pendingRiders}</i> : null}
              {key === "support" && overview?.openSupport ? <i>{overview.openSupport}</i> : null}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-bottom">
          <span><b>{adminName}</b><small>Administrator</small></span>
          <button type="button" onClick={() => void logout()} aria-label="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><p className="admin-eyebrow">X-RIDER OPERATIONS</p><h1>{SECTIONS.find(([key]) => key === section)?.[1]}</h1></div>
          <button type="button" className="admin-refresh" onClick={() => void loadSection(section, true)} disabled={refreshing} aria-label="Refresh view">
            <RefreshCw size={17} className={refreshing ? "spinning" : ""} /> Refresh
          </button>
        </header>

        {section === "overview" && (
          <div className="admin-view">
            <div className="admin-welcome"><div><h2>Welcome back, {adminName.split(" ")[0]}</h2><p>Here’s the current delivery operation at a glance.</p></div><span>Local operations data</span></div>
            <div className="admin-stats">
              {statCards.map(([label, value, Icon, hint]) => <article key={label} className="admin-stat"><span><Icon size={18} /></span><small>{label}</small><b>{value}</b><p>{hint}</p></article>)}
            </div>
            <Panel title="Order status" hint="Current counts across every customer booking.">
              <div className="admin-status-grid">
                {Object.entries(overview?.statuses || {}).length ? Object.entries(overview?.statuses || {}).map(([status, count]) => (
                  <div key={status}><span>{status}</span><b>{count}</b></div>
                )) : <Empty>No orders yet.</Empty>}
              </div>
            </Panel>
            <Panel title="Admin capabilities" hint="This console is connected to app data. Actions are recorded in the audit history.">
              <div className="admin-capabilities">
                <span><ClipboardList size={15} /> Review, assign, reopen, and cancel orders</span>
                <span><BadgeCheck size={15} /> Approve, reject, or suspend rider accounts</span>
                <span><Users size={15} /> Search customers and manage account access</span>
                <span><Wallet size={15} /> Reconcile rider cash remittances</span>
                <span><Headset size={15} /> Triage and resolve customer support cases</span>
                <span><Tag size={15} /> Change fares and manage promo codes</span>
              </div>
            </Panel>
          </div>
        )}

        {section === "orders" && (
          <div className="admin-view">
            <Panel title="All deliveries" hint="Search by order, address, customer, or rider.">
              <div className="admin-toolbar">
                <label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search deliveries" /></label>
                <select className="admin-select" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  {["Scheduled", "Searching", "Rider assigned", "At pickup", "Picked up", "Out for delivery", "Delivered", "Cancelled"].map((status) => <option key={status}>{status}</option>)}
                </select>
                <button type="button" className="admin-secondary" onClick={() => void loadSection("orders", true)}>Search</button>
              </div>
              {orders.length ? <DataTable headers={["Order", "Customer", "Route", "Status", "Rider", "Fare", "Admin actions"]}>
                {orders.map((order) => <tr key={order.id}>
                  <td><b>{order.id}</b><small>{formatDate(order.createdAt)}</small></td>
                  <td>{order.customer.name}<small>{order.customer.phone}</small></td>
                  <td className="admin-route-cell"><span>{order.from}</span><span>{order.to}</span></td>
                  <td><span className={`admin-pill ${order.status === "Delivered" ? "good" : order.status === "Cancelled" ? "muted" : "info"}`}>{order.status}</span></td>
                  <td>{order.riderAccount?.name || "Unassigned"}<small>{order.rider?.plate || ""}</small></td>
                  <td><b>{naira(order.price)}</b></td>
                  <td className="admin-actions">
                    {["Scheduled", "Cancelled"].includes(order.status) && <button type="button" disabled={busy} onClick={() => void act(() => api.updateAdminOrder(order.id, { status: "Searching" }), "Order reopened.", "orders")}>Reopen</button>}
                    {["Searching", "Rider assigned"].includes(order.status) && <select className="admin-inline-select" defaultValue="" aria-label={`Assign rider to ${order.id}`} disabled={busy} onChange={(event) => {
                      if (event.target.value) void act(() => api.updateAdminOrder(order.id, { riderUserId: event.target.value }), "Order assigned to rider.", "orders");
                    }}><option value="">Assign rider…</option>{riders.filter((rider) => rider.approvalStatus === "approved" && rider.accountStatus === "active" && rider.online).map((rider) => <option key={rider.id} value={rider.id}>{rider.name} · {rider.plate}</option>)}</select>}
                    {["Searching", "Rider assigned", "Scheduled"].includes(order.status) && <button type="button" disabled={busy} onClick={() => void act(() => api.updateAdminOrder(order.id, { riderUserId: null }), "Rider assignment cleared.", "orders")}>Unassign</button>}
                    {["Scheduled", "Searching", "Rider assigned", "At pickup", "Picked up", "Out for delivery"].includes(order.status) && <button type="button" className="danger" disabled={busy} onClick={() => {
                      const reason = window.prompt("Reason for cancelling this order:", "Cancelled by support");
                      if (reason) void act(() => api.updateAdminOrder(order.id, { status: "Cancelled", reason }), "Order cancelled.", "orders");
                    }}>Cancel</button>}
                  </td>
                </tr>)}
              </DataTable> : <Empty>No orders match these filters.</Empty>}
            </Panel>
          </div>
        )}

        {section === "riders" && (
          <div className="admin-view">
            <Panel title="Rider applications & operations" hint="Approve riders before they can go online or receive bookings.">
              {riders.length ? <DataTable headers={["Rider", "Vehicle", "Review status", "Activity", "Cash due", "Overdue commission", "Decision"]}>
                {riders.map((rider) => <tr key={rider.id}>
                  <td><b>{rider.name}</b><small>{rider.phone}</small></td>
                  <td>{rider.vehicleType} · {rider.plate}<small>{rider.operatingArea}</small>
                    <div className="admin-actions">
                      {rider.documents.identityDocument && <a href={`/api/admin/riders/${encodeURIComponent(rider.id)}/documents/identityDocument`} target="_blank" rel="noreferrer">ID</a>}
                      {rider.documents.vehiclePhoto && <a href={`/api/admin/riders/${encodeURIComponent(rider.id)}/documents/vehiclePhoto`} target="_blank" rel="noreferrer">Vehicle photo</a>}
                      {rider.documents.profilePhoto && <a href={`/api/admin/riders/${encodeURIComponent(rider.id)}/documents/profilePhoto`} target="_blank" rel="noreferrer">Profile photo</a>}
                    </div>
                  </td>
                  <td><span className={`admin-pill ${rider.approvalStatus === "approved" ? "good" : rider.approvalStatus === "pending" ? "warn" : "muted"}`}>{rider.approvalStatus}</span><small>{rider.online ? "Online" : "Offline"} · {rider.accountStatus}</small></td>
                  <td>{rider.activeCount} active<small>{rider.deliveredCount} delivered</small></td><td>{naira(rider.cashDue)}</td>
                  <td><b>{naira(rider.commissionDue)}</b><small>{rider.commissionOverdue ? "Overdue · offline required" : "Current"}</small></td>
                  <td className="admin-actions">
                    {rider.approvalStatus !== "approved" && <button type="button" disabled={busy} onClick={() => void act(() => api.updateAdminRider(rider.id, "approved"), "Rider approved.", "riders")}>Approve</button>}
                    {rider.approvalStatus !== "rejected" && rider.approvalStatus !== "suspended" && <button type="button" className="danger" disabled={busy} onClick={() => void act(() => api.updateAdminRider(rider.id, "rejected"), "Rider rejected.", "riders")}>Reject</button>}
                    {rider.approvalStatus === "approved" && <button type="button" className="danger" disabled={busy} onClick={() => void act(() => api.updateAdminRider(rider.id, "suspended"), "Rider suspended and set offline.", "riders")}>Suspend</button>}
                  </td>
                </tr>)}
              </DataTable> : <Empty>No rider applications have been submitted.</Empty>}
            </Panel>
          </div>
        )}

        {section === "users" && (
          <div className="admin-view">
            <Panel title="Customer accounts & access" hint="Account role and suspension changes immediately affect sign-in privileges.">
              <div className="admin-toolbar"><label className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, or role" /></label><button type="button" className="admin-secondary" onClick={() => void loadSection("users", true)}>Search</button></div>
              {users.length ? <DataTable headers={["Customer", "Orders", "Role", "Account", "Actions"]}>
                {users.map((user) => <tr key={user.id}>
                  <td><b>{user.name}</b><small>{user.phone}{user.email ? ` · ${user.email}` : ""}</small></td>
                  <td>{user.orderCount}<small>{user.deliveredCount} delivered</small></td>
                  <td><select className="admin-inline-select" value={user.role} disabled={busy} onChange={(event) => {
                    const role = event.target.value as "customer" | "rider" | "admin";
                    void act(() => api.updateAdminUser(user.id, { role }), "Account role updated.", "users");
                  }}><option value="customer">Customer</option><option value="rider">Rider</option><option value="admin">Admin</option></select></td>
                  <td><span className={`admin-pill ${user.accountStatus === "active" ? "good" : "muted"}`}>{user.accountStatus}</span></td>
                  <td className="admin-actions"><button type="button" disabled={busy} onClick={() => void showUserDetails(user.id)}>View</button><button type="button" className={user.accountStatus === "active" ? "danger" : ""} disabled={busy} onClick={() => {
                    const accountStatus = user.accountStatus === "active" ? "suspended" : "active";
                    void act(() => api.updateAdminUser(user.id, { accountStatus }), `Account ${accountStatus}.`, "users");
                  }}>{user.accountStatus === "active" ? "Suspend" : "Restore"}</button></td>
                </tr>)}
              </DataTable> : <Empty>No customer accounts found.</Empty>}
              {userDetails && <div className="admin-user-detail">
                <div className="admin-user-detail-heading"><div><p className="admin-eyebrow">CUSTOMER RECORD</p><h3>{userDetails.name}</h3><small>{userDetails.phone} · {userDetails.email || "No email"} · {userDetails.role}</small></div><button type="button" className="admin-secondary" onClick={() => setUserDetails(null)}>Close</button></div>
                {userDetails.orders.length ? <DataTable headers={["Order", "Route", "Status", "Fare", "Recipient"]}>{userDetails.orders.map((order) => <tr key={order.id}><td>{order.id}<small>{formatDate(order.createdAt)}</small></td><td className="admin-route-cell"><span>{order.from}</span><span>{order.to}</span></td><td>{order.status}</td><td>{naira(order.price)}</td><td>{order.phone}</td></tr>)}</DataTable> : <Empty>This customer has no orders.</Empty>}
              </div>}
            </Panel>
          </div>
        )}

        {section === "cash" && (
          <div className="admin-view">
            <Panel title="Rider cash reconciliation" hint="Track delivered-order cash and record cash remitted to the business.">
              {cash.length ? <DataTable headers={["Rider", "Deliveries", "Collected", "Remitted", "Outstanding", "Record remittance"]}>
                {cash.map((rider) => <tr key={rider.id}>
                  <td><b>{rider.name}</b><small>{rider.plate} · {rider.phone}</small></td><td>{rider.deliveries}</td><td>{naira(rider.collected)}</td><td>{naira(rider.remitted)}</td><td><b>{naira(rider.outstanding)}</b></td>
                  <td>{rider.outstanding > 0 ? <div className="admin-remit"><input aria-label={`Remittance amount for ${rider.name}`} inputMode="numeric" value={remitAmounts[rider.id] || ""} onChange={(event) => setRemitAmounts((current) => ({ ...current, [rider.id]: event.target.value.replace(/\D/g, "") }))} placeholder="Amount ₦" /><input aria-label={`Receipt reference for ${rider.name}`} value={remitNotes[rider.id] || ""} onChange={(event) => setRemitNotes((current) => ({ ...current, [rider.id]: event.target.value }))} placeholder="Receipt / note" maxLength={300} /><button type="button" disabled={busy} onClick={() => void recordRemittance(rider)}>Record</button></div> : <span className="admin-muted-text">Settled</span>}</td>
                </tr>)}
              </DataTable> : <Empty>Cash balances appear after riders complete deliveries.</Empty>}
              <p className="admin-warning">Cash collection and remittance are manually recorded in this local MVP. Confirm receipts outside the app before settling a balance.</p>
            </Panel>
          </div>
        )}

        {section === "commission" && (
          <div className="admin-view">
            <div className="admin-stats admin-commission-stats">
              {([
                ["Today's commission", "today"],
                ["This week's commission · Monday to date", "thisWeek"],
                ["All-time commission", "allTime"],
              ] as const).map(([label, period]) => {
                const totals = commissionReport?.periods[period];
                return <article className="admin-stat" key={period}>
                  <span><Percent size={18} /></span>
                  <small>{label}</small>
                  <b>{naira(totals?.commissionTotal || 0)}</b>
                  <p>{totals?.deliveries || 0} completed deliveries · customer fares {naira(totals?.fareTotal || 0)}</p>
                </article>;
              })}
            </div>
            <p className="admin-commission-outstanding"><Wallet size={15} /> Unsettled commission across all riders: <b>{naira(commissionReport?.outstandingCommission || 0)}</b></p>
            <Panel title="Commission settings" hint="The saved rate applies only to deliveries completed from now on. Each delivery keeps its original rate and amount.">
              <form className="admin-commission-rate" onSubmit={(event) => void saveCommissionRate(event)}>
                <label>Platform commission (%)
                  <input type="number" min="1" max="100" step="1" value={commissionRate} onChange={(event) => setCommissionRate(Number(event.target.value))} required />
                </label>
                <button type="submit" className="admin-primary" disabled={busy}>Save commission rate</button>
              </form>
              <p className="admin-warning">Commission is calculated from the final customer fare after discounts. Today&apos;s balance is due by the end of the day; unpaid balances block a rider from going online or receiving new jobs from the next day.</p>
            </Panel>
            <Panel title="Daily rider commission" hint="Each row totals completed deliveries for one rider and one Lagos calendar day. Settlement records are permanent and included in audit history.">
              {commissionReport?.rows.length ? <DataTable headers={["Service date", "Rider", "Deliveries", "Customer fares", "Commission due", "Settlement"]}>
                {commissionReport.rows.map((row) => <tr key={`${row.riderId}-${row.serviceDate}`}>
                  <td><b>{formatServiceDate(row.serviceDate)}</b><small>Africa/Lagos</small></td>
                  <td><b>{row.riderName}</b><small>{row.riderPhone}{row.plate ? ` · ${row.plate}` : ""}</small></td>
                  <td>{row.deliveries}</td>
                  <td>{naira(row.fareTotal)}</td>
                  <td><b>{naira(row.commissionDue)}</b></td>
                  <td>{row.settled
                    ? <><span className="admin-pill good">Settled</span><small>{row.settledBy ? `By ${row.settledBy} · ` : ""}{row.settledAt ? formatDate(row.settledAt) : ""}</small></>
                    : <div className="admin-commission-settlement">
                      <span className={`admin-pill ${row.serviceDate < (commissionReport?.today || "") ? "warn" : "info"}`}>{row.serviceDate < (commissionReport?.today || "") ? "Overdue" : "Due today"}</span>
                      {row.serviceDate < (commissionReport?.today || "")
                        ? <button type="button" className="admin-secondary" disabled={busy} onClick={() => void settleCommissionDay(row)}>Settle full day</button>
                        : <small>Settlement opens tomorrow</small>}
                    </div>}
                  </td>
                </tr>)}
              </DataTable> : <Empty>No completed rider deliveries yet. Commission will appear here when a delivery is marked complete.</Empty>}
            </Panel>
          </div>
        )}

        {section === "support" && (
          <div className="admin-view">
            <Panel title="Customer support cases" hint="Review requests, add a resolution note, and update case status.">
              {tickets.length ? <div className="admin-ticket-list">{tickets.map((ticket) => <article className="admin-ticket" key={ticket.id}>
                <div className="admin-ticket-top"><div><span className={`admin-pill ${ticket.status === "resolved" || ticket.status === "closed" ? "good" : "warn"}`}>{ticket.status.replace("_", " ")}</span><h3>{ticket.subject}</h3><small>{ticket.id} · {formatDate(ticket.createdAt)}</small></div><div><b>{ticket.userName}</b><small>{ticket.userPhone}{ticket.orderId ? ` · ${ticket.orderId}` : ""}</small></div></div>
                <p className="admin-ticket-message">{ticket.message}</p>
                <div className="admin-ticket-controls"><select className="admin-select" value={ticket.status} disabled={busy} onChange={(event) => void act(() => api.updateAdminSupport(ticket.id, { status: event.target.value as SupportTicket["status"] }), "Support status updated.", "support")}>{["open", "in_progress", "resolved", "closed"].map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}</select><input defaultValue={ticket.resolution} aria-label={`Resolution for ${ticket.id}`} placeholder="Resolution note" onBlur={(event) => {
                  if (event.target.value !== ticket.resolution) void act(() => api.updateAdminSupport(ticket.id, { resolution: event.target.value }), "Resolution note saved.", "support");
                }} /></div>
                {ticket.resolution && <p className="admin-resolution"><b>Resolution:</b> {ticket.resolution}</p>}
              </article>)}</div> : <Empty>No support cases have been submitted.</Empty>}
            </Panel>
          </div>
        )}

        {section === "pricing" && (
          <div className="admin-view admin-pricing-grid">
            <Panel title="Delivery fares" hint="The API applies these settings to every new quote and booking.">
              <form className="admin-form-grid" onSubmit={(event) => void savePricing(event)}>
                <label>Base fare (₦)<input type="number" min="1" max="1000000" step="1" value={settings.base} onChange={(event) => updateSetting("base", event.target.value)} required /></label>
                <label>Price per road km (₦)<input type="number" min="1" max="1000000" step="1" value={settings.perKm} onChange={(event) => updateSetting("perKm", event.target.value)} required /></label>
                <label>Minimum fare (₦)<input type="number" min="1" max="1000000" step="1" value={settings.minimum} onChange={(event) => updateSetting("minimum", event.target.value)} required /></label>
                <label>Round total to (₦)<input type="number" min="1" max="1000000" step="1" value={settings.roundTo} onChange={(event) => updateSetting("roundTo", event.target.value)} required /></label>
                <button type="submit" className="admin-primary" disabled={busy}>Save fare settings</button>
              </form>
            </Panel>
            <Panel title="Promo codes" hint="Toggle campaigns on or off. Redemption limits and schedules can be configured when creating a code.">
              {promos.length ? <div className="admin-promo-list">{promos.map((promo) => <div className="admin-promo-row" key={promo.code}>
                <div><b>{promo.code}</b><small>{promo.label} · {promo.redemptionCount} used{promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : ""}{promo.startsAt ? ` · starts ${formatDate(promo.startsAt)}` : ""}{promo.endsAt ? ` · ends ${formatDate(promo.endsAt)}` : ""}</small></div>
                <button type="button" className={`admin-toggle ${promo.active ? "on" : ""}`} disabled={busy} onClick={() => void act(() => api.updateAdminPromo(promo.code, { active: !promo.active }), "Promo status updated.", "pricing")}>{promo.active ? "Active" : "Paused"}</button>
              </div>)}</div> : <Empty>No promo codes yet.</Empty>}
              <form className="admin-new-promo" onSubmit={(event) => void createPromo(event)}>
                <h3>Create a promo code</h3>
                <div className="admin-form-grid">
                  <label>Code<input required minLength={3} maxLength={32} value={newPromo.code} onChange={(event) => setNewPromo({ ...newPromo, code: event.target.value.toUpperCase() })} placeholder="WELCOME20" /></label>
                  <label>Customer label<input required minLength={2} maxLength={80} value={newPromo.label} onChange={(event) => setNewPromo({ ...newPromo, label: event.target.value })} placeholder="20% off" /></label>
                  <label>Discount type<select value={newPromo.kind} onChange={(event) => setNewPromo({ ...newPromo, kind: event.target.value as "percent" | "fixed" })}><option value="percent">Percentage</option><option value="fixed">Fixed naira amount</option></select></label>
                  <label>Discount value<input required type="number" min="1" max={newPromo.kind === "percent" ? 100 : 1000000} value={newPromo.value} onChange={(event) => setNewPromo({ ...newPromo, value: Number(event.target.value) })} /></label>
                  <label>Starts at (optional)<input type="datetime-local" value={newPromo.startsAt} onChange={(event) => setNewPromo({ ...newPromo, startsAt: event.target.value })} /></label>
                  <label>Ends at (optional)<input type="datetime-local" value={newPromo.endsAt} onChange={(event) => setNewPromo({ ...newPromo, endsAt: event.target.value })} /></label>
                  <label>Redemption limit (optional)<input type="number" min="1" step="1" value={newPromo.maxRedemptions} onChange={(event) => setNewPromo({ ...newPromo, maxRedemptions: event.target.value })} placeholder="Unlimited" /></label>
                </div>
                <button type="submit" className="admin-primary" disabled={busy}>Create promo</button>
              </form>
            </Panel>
          </div>
        )}

        {section === "admins" && (
          <div className="admin-view">
            <Panel title="Administrator accounts" hint="Promote an existing account from Customers & access. Never share administrator login credentials.">
              {admins.length ? <DataTable headers={["Administrator", "Phone", "Email"]}>{admins.map((admin) => <tr key={admin.id}><td>{admin.name}{admin.id === currentAdminId ? <small>Current account</small> : null}</td><td>{admin.phone}</td><td>{admin.email || "—"}</td></tr>)}</DataTable> : <Empty>No admin accounts configured.</Empty>}
              <div className="admin-inline-note"><ShieldCheck size={16} /> The first admin is bootstrapped by the <code>ADMIN_PHONE</code> environment setting. Admin changes are recorded in audit history.</div>
            </Panel>
          </div>
        )}

        {section === "audit" && (
          <div className="admin-view">
            <Panel title="Administrator audit history" hint="Recent changes to orders, accounts, pricing, riders, support, and cash.">
              {audit.length ? <DataTable headers={["When", "Administrator", "Action", "Record", "Details"]}>
                {audit.map((entry) => <tr key={entry.id}><td>{formatDate(entry.createdAt)}</td><td>{entry.actorName}</td><td><span className="admin-pill info">{entry.action}</span></td><td>{entry.entityType}<small>{entry.entityId}</small></td><td className="admin-audit-details">{JSON.stringify(entry.details)}</td></tr>)}
              </DataTable> : <Empty>No administrator actions have been recorded yet.</Empty>}
            </Panel>
          </div>
        )}
      </section>
    </main>
  );
}
