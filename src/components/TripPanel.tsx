"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTrip } from "@/lib/trip";
import { naira } from "@/lib/pricing";
import { useToast } from "./Toast";
import Chat from "./Chat";
import Modal from "./Modal";
import Receipt from "./Receipt";

const TITLES = { searching: "Finding your rider…", toPickup: "Rider is on the way to pickup", atPickup: "Rider has arrived at pickup", picked: "Package picked up", toDrop: "Heading to drop-off", done: "Delivery complete" } as const;
const STEPS = { searching: 0, toPickup: 1, atPickup: 2, picked: 3, toDrop: 4, done: 5 } as const;
const REASONS = ["Changed my mind", "Rider is too far", "Wrong address", "Waiting too long", "Other"];
const TAGS = ["Polite", "On time", "Careful with package", "Good communication", "Fast"];

function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    local_shipping: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    radar: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" /><path d="M12 2v2m10 8h-2M12 20v2M4 12H2" /></>,
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    chat: <path d="M4 5h16v11H8l-4 4V5Z" />,
    call: <path d="M6 3h3l1.5 4-2 1.5a14 14 0 0 0 7 7l1.5-2 4 1.5v3a2 2 0 0 1-2 2C10.7 19.4 4.6 13.3 4 5a2 2 0 0 1 2-2Z" />,
    trip_origin: <circle cx="12" cy="12" r="5" />,
    location_on: <><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" /><circle cx="12" cy="9" r="2" /></>,
    emergency: <><path d="M12 3v10m0 4v.01" /><circle cx="12" cy="12" r="9" /></>,
    check_circle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    schedule: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    payments: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    favorite: <path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7Z" />,
    verified: <><path d="m12 3 2 1 2.3-.2 1 1.9 1.9 1 .2 2.3 1 2-1 2 .2 2.3-1.9 1-1 1.9-2.3-.2-2 1-2-1-2.3.2-1-1.9-1.9-1 .2-2.3-1-2 1-2-.2-2.3 1-1 1.9-1 2.3.2 2-1Z" /><path d="m9 12 2 2 4-4" /></>,
    description: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M14 3v4h4M9 11h6m-6 4h6" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h4a4 4 0 0 0 4-4V8" /></>,
  };
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

export default function TripPanel() {
  const { trip, cancel, rate, reset } = useTrip();
  const toast = useToast(), router = useRouter();
  const [chat, setChat] = useState(false), [unreadMessages, setUnreadMessages] = useState(0), [cx, setCx] = useState(false), [rc, setRc] = useState(false);
  const [reason, setReason] = useState(""), [stars, setStars] = useState(0), [tags, setTags] = useState<string[]>([]), [comment, setComment] = useState("");
  if (!trip) return null;

  const live = trip.stage === "toPickup" || trip.stage === "atPickup" || trip.stage === "picked" || trip.stage === "toDrop";
  const eta = trip.stage === "toPickup" ? "Rider arrives in ~4 min" : trip.stage === "atPickup" ? "Rider is at the pickup location" : `Arrives in ~${Math.max(3, Math.round(trip.km * 2.5))} min`;
  const share = async () => {
    const t = `Track my X-RIDER delivery: ${trip.rider.name} (${trip.rider.plate}) is on the way. Drop-off: ${trip.to}`;
    try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toast("Trip details copied"); } } catch { /* user dismissed */ }
  };

  return (
    <>
      <div className="sheet gl" style={{ maxHeight: "calc(100% - 100px)", overflowY: "auto" }}>
        {trip.stage !== "done" && trip.stage !== "searching" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--g)", letterSpacing: ".5px" }}>ESTIMATED ARRIVAL</p>
              <strong style={{ fontSize: 20 }}>4 mins <small style={{ fontSize: 13, fontWeight: 400, color: "var(--mu)" }}>(1.2 km)</small></strong>
            </div>
            <span style={{ fontSize: 12, padding: "4px 10px", background: "#34d18622", color: "var(--gd)", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="bolt" /> Electric Green Ride
            </span>
          </div>
        )}

        {trip.stage === "searching" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ textAlign: "center", display: "grid", gap: 6 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--g)", letterSpacing: ".5px" }}>ACTIVE DISPATCH</p>
              <h2 style={{ fontSize: 20 }}>Finding your nearest X-RIDER...</h2>
              <p className="mut" style={{ fontSize: 13 }}>Estimated search time: ~30 seconds</p>
            </div>

            <div style={{ position: "relative", width: "100%", height: 120, display: "grid", placeItems: "center", background: "var(--fill)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--gb)" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--g)", display: "grid", placeItems: "center", animation: "p 1.2s infinite", color: "#06351f" }}>
                <Icon name="radar" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              <span style={{ fontSize: 12, padding: "4px 10px", background: "var(--fill)", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="bolt" /> Electric Courier</span>
              <span style={{ fontSize: 12, padding: "4px 10px", background: "var(--fill)", borderRadius: 12, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="star" /> Top Rated Driver</span>
            </div>

            <div style={{ background: "var(--fill)", borderRadius: 14, padding: 12, display: "grid", gap: 6, border: "1px solid var(--gb)", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="mut">Pickup · {trip.from}</span>
                <strong style={{ fontSize: 12 }}>2.4 km away</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Drop-off · {trip.to}</span>
                <em className="mut">~12 min</em>
              </div>
            </div>

            <button className="btn sec" onClick={() => setCx(true)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Icon name="close" /> Cancel Search
            </button>
          </div>
        )}

        {live && (<>
          <div className="steps">{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= STEPS[trip.stage] ? "on" : ""} />)}</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--fill)", padding: 12, borderRadius: 16, border: "1px solid var(--gb)" }}>
            <div className="av" style={{ position: "relative" }}>
              🧑🏾
              <span style={{ position: "absolute", bottom: -4, right: -12, fontSize: 10, background: "var(--g)", color: "#06351f", padding: "1px 4px", borderRadius: 8, fontWeight: 700 }}>★ {trip.rider.rating}</span>
            </div>
            <div style={{ flex: 1 }}>
              <strong style={{ fontSize: 16 }}>{trip.rider.name}</strong>
              <div className="mut" style={{ fontSize: 13 }}>{trip.rider.plate}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="trip-chat-button" onClick={() => setChat(true)} aria-label={unreadMessages ? `Chat rider, ${unreadMessages} unread message${unreadMessages === 1 ? "" : "s"}` : "Chat rider"} style={{ border: 0, background: "var(--glass)", width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--tx)" }}>
                <Icon name="chat" />{unreadMessages > 0 && <span className="chat-unread-dot" aria-label={`${unreadMessages} unread`} />}
              </button>
              {trip.contact?.phone && <a href={`tel:${trip.contact.phone}`} aria-label={`Call rider ${trip.contact.name}`} style={{ border: 0, background: "var(--g)", width: 36, height: 36, borderRadius: "50%", display: "grid", placeItems: "center", cursor: "pointer", color: "#06351f", textDecoration: "none" }}><Icon name="call" /></a>}
            </div>
          </div>

          <div style={{ display: "grid", gap: 8, background: "var(--fill)", padding: 12, borderRadius: 16, border: "1px solid var(--gb)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "#3b82f6" }}><Icon name="trip_origin" /></span>
              <div><small className="mut">Current Location</small><strong>124 Grand Avenue</strong></div>
            </div>
            <div style={{ width: 2, height: 16, background: "var(--ln)", marginLeft: 8 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--g)" }}><Icon name="location_on" /></span>
              <div><small className="mut">Destination</small><strong>{trip.to}</strong></div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn sec" onClick={() => setCx(true)} style={{ flex: 1, height: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#ef4444", borderRadius: 14 }}>
              <Icon name="emergency" /> Emergency / Cancel
            </button>
            <button className="btn sec" onClick={share} style={{ flex: 1, height: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14 }}>
              Share Trip
            </button>
          </div>
        </>)}

        {trip.stage === "done" && (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ textAlign: "center", background: "var(--fill)", borderRadius: 16, padding: 16, border: "1px solid var(--gb)", display: "grid", gap: 6 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#34d18622", color: "var(--gd)", display: "grid", placeItems: "center", margin: "0 auto", fontSize: 20 }}>
                <Icon name="check" />
              </div>
              <h1 style={{ fontSize: 20 }}>Payment Confirmed!</h1>
              <p className="mut" style={{ fontSize: 13 }}>{naira(trip.price)} settled via Cash to Rider · Delivery fulfilled</p>
            </div>

            <div style={{ background: "var(--fill)", borderRadius: 16, padding: 14, border: "1px solid var(--gb)", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, color: "var(--mu)" }}>
                <span>SETTLED RECEIPT</span>
                <span style={{ color: "var(--tx)" }}>{naira(trip.price)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--glass)", display: "grid", placeItems: "center" }}><Icon name="description" /></div>
                <div>
                  <h3 style={{ fontSize: 15 }}>{trip.pk || "Document"} Delivery</h3>
                  <p className="mut" style={{ fontSize: 12 }}>Secure X-RIDER Courier Service</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--mu)", flexWrap: "wrap", borderTop: "1px solid var(--ln)", paddingTop: 8 }}>
                <span><Icon name="route" /> {trip.km.toFixed(1)} km</span>
                <span><Icon name="schedule" /> ~{Math.max(8, Math.round(trip.km * 3 + 4))} mins</span>
                <span><Icon name="payments" /> Cash</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, borderTop: "1px solid var(--ln)", paddingTop: 8 }}>
                <Icon name="location_on" />
                <span>Delivered to {trip.to}</span>
              </div>
            </div>

            <div style={{ background: "var(--fill)", borderRadius: 16, padding: 16, border: "1px solid var(--gb)", display: "grid", gap: 12, textAlign: "center" }}>
              <div style={{ width: 50, height: 50, borderRadius: "50%", background: "var(--g)", color: "#06351f", fontWeight: 700, display: "grid", placeItems: "center", margin: "0 auto", position: "relative" }}>
                MV
                <span style={{ position: "absolute", bottom: -2, right: -4, background: "#fff", borderRadius: "50%", padding: 1 }}><Icon name="verified" /></span>
              </div>
              <div>
                <h3 style={{ fontSize: 16 }}>{trip.rider.name}</h3>
                <p className="mut" style={{ fontSize: 13 }}>How was your delivery experience?</p>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setStars(value)}
                    style={{ border: 0, background: "none", cursor: "pointer", fontSize: 28, color: value <= stars ? "#fbbf24" : "var(--ln)" }}
                    aria-label={`${value} stars`}
                    type="button"
                  >
                    ★
                  </button>
                ))}
              </div>
              <strong style={{ fontSize: 14 }}>{["Needs improvement", "Fair", "Good", "Very good", "Exceptional service!"][Math.max(0, stars - 1)]}</strong>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
                {["⚡ Fast & Efficient", "📦 Handled with Care", "🤝 Polite & Professional", "🛵 Smooth Riding", "💬 Great Communication", "📍 Spot-on Delivery"].map((tag) => {
                  const isActive = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                      style={{ border: `1px solid ${isActive ? "var(--g)" : "var(--gb)"}`, background: isActive ? "#34d18633" : "var(--glass)", color: "var(--tx)", borderRadius: 16, padding: "6px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                placeholder={`Write a note for ${trip.rider.name.split(" ")[0]} (optional)...`}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--gb)", background: "var(--glass)", color: "var(--tx)", fontSize: 14, outline: 0 }}
              />
            </div>

            <button
              className="btn"
              onClick={async () => {
                await rate(stars > 0 ? stars : 5, tags, comment);
                reset();
                router.push("/home");
              }}
              type="button"
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6 }}
            >
              Submit Rating <Icon name="arrow_forward" />
            </button>
            <button className="btn sec" onClick={() => setRc(true)}>🧾 View full receipt</button>
          </div>
        )}
      </div>

      {live && trip.contact && <Chat open={chat} orderId={trip.orderId} name={trip.contact.name} context={`📍 ${trip.from} → ${trip.to} · ${naira(trip.price)} cash`} onUnreadChange={setUnreadMessages} onClose={() => setChat(false)} />}

      {cx && (
        <Modal title="Why are you cancelling?" onClose={() => setCx(false)}>
          <div className="chips">{REASONS.map((r) => <button key={r} className={`chip${reason === r ? " on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}</div>
          <button className="btn" disabled={!reason} onClick={async () => { await cancel(reason); setCx(false); setReason(""); }}>Cancel order</button>
          <button className="btn sec" onClick={() => setCx(false)}>Keep order</button>
        </Modal>
      )}
      {rc && <Receipt onClose={() => setRc(false)} o={{ id: trip.orderId, from: trip.from, to: trip.to, km: trip.km, price: trip.price, baseFare: trip.baseFare, distanceFare: trip.distanceFare, discount: trip.discount, rider: trip.rider.name, at: Date.now() }} />}
    </>
  );
}
