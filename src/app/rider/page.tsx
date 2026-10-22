"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUpRight, Bike, Check, CheckCircle2, Clock3, MapPin, MessageCircle, Navigation,
  PackageCheck, Phone, Power, Route, Wallet,
} from "lucide-react";
import { api, type RiderEarning } from "@/lib/api";
import { useRider } from "@/lib/rider";
import { naira } from "@/lib/pricing";
import { useToast } from "@/components/Toast";
import Chat from "@/components/Chat";
import Modal from "@/components/Modal";

const STATUS_STEPS = [
  { status: "Rider assigned", title: "On your way to pickup", action: "I've arrived at pickup", next: "At pickup", marker: "1" },
  { status: "At pickup", title: "You've arrived at pickup", action: "Package picked up", next: "Picked up", marker: "2" },
  { status: "Picked up", title: "Package picked up", action: "Start delivery", next: "Out for delivery", marker: "3" },
  { status: "Out for delivery", title: "On your way to drop-off", action: "Mark delivered", next: "Delivered", marker: "4" },
] as const;

function googleMapsDirections(address: string, location?: { lat: number; lng: number }) {
  const destination = location && Number.isFinite(location.lat) && Number.isFinite(location.lng)
    ? `${location.lat},${location.lng}`
    : address;
  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function dateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "XR";
}

export default function RiderHome() {
  const { user, profile, orders, finished, setOnline, acceptOrder, advanceOrder, clearFinished } = useRider();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [dismissedOfferId, setDismissedOfferId] = useState("");
  const [earnings, setEarnings] = useState<RiderEarning[]>([]);

  useEffect(() => {
    let active = true;
    api.riderEarnings()
      .then((rows) => { if (active) setEarnings(rows); })
      .catch((error: unknown) => {
        if (active) toast(error instanceof Error ? error.message : "Could not load today’s rider summary.");
      });
    return () => { active = false; };
  }, [finished?.id, toast]);

  const todayEarnings = useMemo(
    () => earnings.filter((earning) => earning.serviceDate === dateKey(new Date())),
    [earnings],
  );
  const todayTotal = todayEarnings.reduce((total, earning) => total + earning.price - earning.commissionAmount, 0);

  if (!profile) return null;

  const active = orders.find((order) => order.status === "Rider assigned" || order.status === "At pickup" || order.status === "Picked up" || order.status === "Out for delivery");
  const offer = active ? null : orders.find((order) => order.status === "Searching");
  const step = active ? STATUS_STEPS.find((item) => item.status === active.status) : null;
  const withBusy = async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { toast(error instanceof Error ? error.message : "The request could not be completed."); }
    finally { setBusy(false); }
  };

  return (
    <main className={`rider-home${offer && offer.id !== dismissedOfferId ? " has-offer-modal" : ""}`}>
      <section className="rider-sheet">
        <header className="rider-welcome">
          <div>
            <p className="rider-eyebrow">RIDER DASHBOARD</p>
            <h1>{active ? "Current delivery" : offer ? "Delivery request" : finished ? "Nice work" : `Hello, ${user?.name.split(" ")[0] ?? "Rider"}`}</h1>
            <p className="rider-subtitle">
              {active ? "Keep your customer updated at every step." : offer ? "Review the route and fare before accepting." : "Your shift, your pace. Ride safe today."}
            </p>
          </div>
          <div className="rider-avatar" aria-label={user?.name ?? "Rider"}>{initials(user?.name ?? "")}</div>
        </header>

        {finished ? (
          <section className="rider-card rider-complete" aria-live="polite">
            <div className="rider-complete-icon"><CheckCircle2 size={28} /></div>
            <div className="rider-complete-copy">
              <p className="rider-eyebrow">DELIVERY COMPLETED</p>
              <h2>{naira(finished.price)} collected</h2>
              <p>Commission has been recorded. Thank you for riding with X-RIDER.</p>
            </div>
            <button className="rider-button rider-button--primary" onClick={clearFinished}>
              Back to dashboard <ArrowUpRight size={17} />
            </button>
          </section>
        ) : active && step ? (
          <section className="rider-card rider-active-card">
            <div className="rider-card-heading">
              <span className="rider-icon-tile rider-icon-tile--green"><Navigation size={19} /></span>
              <div><p className="rider-eyebrow">DELIVERY IN PROGRESS</p><h2>{step.title}</h2></div>
              <span className="rider-live-tag"><i /> ACTIVE</span>
            </div>

            <ol className="rider-progress" aria-label="Delivery progress">
              {STATUS_STEPS.map((item, index) => {
                const currentIndex = STATUS_STEPS.indexOf(step);
                const complete = index < currentIndex;
                const current = index === currentIndex;
                return (
                  <li key={item.status} className={complete ? "complete" : current ? "current" : ""}>
                    <span className="rider-progress-marker">{complete ? <Check size={13} /> : item.marker}</span>
                    <span>{item.status === "Rider assigned" ? "Pickup" : item.status === "At pickup" ? "Arrived" : item.status === "Picked up" ? "In transit" : "Drop-off"}</span>
                  </li>
                );
              })}
            </ol>

            <div className="rider-route-card">
              <div className="rider-route-point">
                <span className="rider-route-dot rider-route-dot--pickup" />
                <a href={googleMapsDirections(active.from, active.fromLocation)} target="_blank" rel="noreferrer" aria-label={`Navigate to pickup: ${active.from}`}>
                  <small>PICKUP · OPEN IN GOOGLE MAPS</small><b>{active.from}</b>
                </a>
              </div>
              <div className="rider-route-connector"><span /></div>
              <div className="rider-route-point">
                <span className="rider-route-dot rider-route-dot--dropoff" />
                <a href={googleMapsDirections(active.to, active.toLocation)} target="_blank" rel="noreferrer" aria-label={`Navigate to drop-off: ${active.to}`}>
                  <small>DROP-OFF · OPEN IN GOOGLE MAPS</small><b>{active.to}</b>
                </a>
              </div>
            </div>

            <div className="rider-order-meta">
              <span><Route size={15} /> {active.km} km</span>
              <span><Wallet size={15} /> {naira(active.price)} cash</span>
            </div>
            {active.status === "Out for delivery" && (
              <div className="rider-cash-notice"><Wallet size={17} /><span><b>Collect cash at drop-off</b><small>Confirm receipt before completing the delivery.</small></span><strong>{naira(active.price)}</strong></div>
            )}
            <div className="rider-action-row">
              <div className="rider-contact-actions">
                {active.contact?.phone && <a className="rider-button rider-button--secondary" href={`tel:${active.contact.phone}`} aria-label={`Call customer ${active.contact.name}`} title="Call customer">
                  <Phone size={17} />
                </a>}
                <button className="rider-button rider-button--secondary rider-chat-button" onClick={() => setChat(true)} aria-label={unreadMessages ? `Chat with ${active.contact?.name ?? "customer"}, ${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}` : `Chat with ${active.contact?.name ?? "customer"}`} title="Chat with customer">
                  <MessageCircle size={17} />
                  {unreadMessages > 0 && <span className="chat-unread-dot" aria-label={`${unreadMessages} unread`} />}
                </button>
              </div>
              <button className="rider-button rider-button--primary" disabled={busy} onClick={() => void withBusy(() => advanceOrder(active.id, step.next))}>
                {busy ? "Updating…" : step.action} <ArrowUpRight size={17} />
              </button>
            </div>
          </section>
        ) : offer ? (
          <section className="rider-card rider-offer-card">
            <div className="rider-card-heading">
              <span className="rider-icon-tile rider-icon-tile--amber"><PackageCheck size={19} /></span>
              <div><p className="rider-eyebrow">NEW DELIVERY</p><h2>Review this request</h2></div>
              <span className="rider-cash-badge">CASH</span>
            </div>
            <div className="rider-offer-fare"><span>Delivery fare</span><b>{naira(offer.price)}</b></div>
            <div className="rider-route-card">
              <div className="rider-route-point">
                <span className="rider-route-dot rider-route-dot--pickup" />
                <div><small>PICKUP</small><b>{offer.from}</b></div>
              </div>
              <div className="rider-route-connector"><span /></div>
              <div className="rider-route-point">
                <span className="rider-route-dot rider-route-dot--dropoff" />
                <div><small>DROP-OFF</small><b>{offer.to}</b></div>
              </div>
            </div>
            <div className="rider-order-meta">
              <span><Route size={15} /> {offer.km} km total</span>
              <span><Wallet size={15} /> Cash on delivery</span>
            </div>
            <button className="rider-button rider-button--primary rider-button--wide" disabled={busy} onClick={() => void withBusy(async () => {
              await acceptOrder(offer.id);
              setDismissedOfferId(offer.id);
            })}>
              {busy ? "Accepting delivery…" : "Accept delivery"} <ArrowUpRight size={17} />
            </button>
          </section>
        ) : (
          <section className={`rider-card rider-shift-card${profile.online ? " is-online" : ""}`}>
            <div className="rider-shift-heading">
              <div className={`rider-icon-tile ${profile.online ? "rider-icon-tile--green" : "rider-icon-tile--neutral"}`}>
                {profile.online ? <Navigation size={19} /> : <Power size={19} />}
              </div>
              <div>
                <p className="rider-eyebrow">YOUR SHIFT</p>
                <h2>{profile.online ? "You’re online" : "You’re offline"}</h2>
              </div>
              <span className={`rider-status-tag ${profile.online ? "is-online" : ""}`}><i />{profile.online ? "ONLINE" : "OFFLINE"}</span>
            </div>

            <div className="rider-shift-message">
              {profile.online
                ? <><span className="rider-radar"><i /><b /></span><div><b>Looking for your next delivery</b><small>We’ll show new requests here as soon as they arrive.</small></div></>
                : <><span className="rider-idle-icon"><Bike size={19} /></span><div><b>Ready when you are</b><small>Go online to start receiving delivery requests.</small></div></>}
            </div>

            {profile.commissionDue ? (
              <div className={`rider-commission-note${profile.commissionOverdue ? " is-overdue" : ""}`}>
                <Wallet size={17} />
                <span><b>{profile.commissionOverdue ? "Commission overdue" : "Commission balance"}</b><small>{profile.commissionOverdue ? "Contact operations to settle before going online." : "Your current amount due to X-RIDER."}</small></span>
                <strong>{naira(profile.commissionDue)}</strong>
              </div>
            ) : null}

            <button
              className={`rider-button rider-button--wide ${profile.online ? "rider-button--danger" : "rider-button--primary"}`}
              disabled={busy || Boolean(profile.commissionOverdue)}
              onClick={() => void withBusy(() => setOnline(!profile.online))}
            >
              {busy ? "Updating shift…" : profile.online ? <><Power size={17} /> Go offline</> : <><Navigation size={17} /> Go online</>}
            </button>
            {profile.commissionOverdue && <p className="rider-button-hint">Settle your overdue balance to go online.</p>}
          </section>
        )}

        <section className="rider-today">
          <div className="rider-section-heading">
            <div><p className="rider-eyebrow">YOUR PROGRESS</p><h2>Today so far</h2></div>
            <span><Clock3 size={14} /> Africa/Lagos</span>
          </div>
          <div className="rider-today-grid">
            <div className="rider-today-metric">
              <span className="rider-metric-icon rider-metric-icon--green"><Wallet size={16} /></span>
              <small>Take-home</small>
              <b>{naira(todayTotal)}</b>
            </div>
            <div className="rider-today-metric">
              <span className="rider-metric-icon rider-metric-icon--blue"><PackageCheck size={16} /></span>
              <small>Completed</small>
              <b>{todayEarnings.length} {todayEarnings.length === 1 ? "delivery" : "deliveries"}</b>
            </div>
          </div>
          {todayEarnings.length > 0 && (
            <p className="rider-today-note"><ArrowDown size={14} /> After {naira(todayEarnings.reduce((total, earning) => total + earning.commissionAmount, 0))} platform commission</p>
          )}
        </section>

        <section className="rider-safety-note">
          <span><CheckCircle2 size={16} /></span>
          <p><b>Ride safe. Deliver with care.</b><small>Your approved vehicle: {profile.vehicleType ?? "Vehicle"} · {profile.plate}</small></p>
          <MapPin size={16} aria-hidden="true" />
        </section>
      </section>
      {offer && offer.id !== dismissedOfferId && (
        <Modal title="New delivery request" onClose={() => setDismissedOfferId(offer.id)}>
          <p className="mut">A customer has placed a delivery request. Would you like to accept it?</p>
          <div className="rider-route-card">
            <div className="rider-route-point"><span className="rider-route-dot rider-route-dot--pickup" /><div><small>PICKUP</small><b>{offer.from}</b></div></div>
            <div className="rider-route-connector"><span /></div>
            <div className="rider-route-point"><span className="rider-route-dot rider-route-dot--dropoff" /><div><small>DROP-OFF</small><b>{offer.to}</b></div></div>
          </div>
          <div className="rider-offer-fare"><span>{offer.km.toFixed(1)} km · Cash on delivery</span><b>{naira(offer.price)}</b></div>
          <button className="btn" disabled={busy} onClick={() => void withBusy(async () => {
            await acceptOrder(offer.id);
            setDismissedOfferId(offer.id);
          })}>{busy ? "Accepting delivery…" : "Accept delivery"}</button>
          <button className="btn sec" disabled={busy} onClick={() => setDismissedOfferId(offer.id)}>Not now</button>
        </Modal>
      )}
      {active?.contact && <Chat
        key={active.id}
        open={chat}
        orderId={active.id}
        name={active.contact.name}
        context={`📍 ${active.from} → ${active.to} · ${naira(active.price)} cash`}
        onUnreadChange={setUnreadMessages}
        variant="rider"
        onClose={() => setChat(false)}
      />}
    </main>
  );
}
