"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { naira } from "@/lib/pricing";
import { useTrip, type MapLocation } from "@/lib/trip";
import { useToast } from "./Toast";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput";

type DeliveryOption = {
  name: string;
  priceNum: number;
  eta: string;
  weight: string;
  icon: string;
};

const deliveryOptions: DeliveryOption[] = [
  { name: "Document", priceNum: 2500, eta: "2 min", weight: "Up to 1 kg", icon: "description" },
  { name: "Small Box", priceNum: 4000, eta: "3 min", weight: "Up to 5 kg", icon: "inventory_2" },
  { name: "Large Parcel", priceNum: 6500, eta: "5 min", weight: "Up to 15 kg", icon: "local_shipping" },
];

type AddressInputProps = {
  className: string;
  placeholder: string;
  value: string;
  style?: CSSProperties;
  onChange: (value: string) => void;
  onSelect: (location: MapLocation) => void;
};

function AddressInput(props: AddressInputProps) {
  if (!process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY) {
    return (
      <input
        className={props.className}
        placeholder={props.placeholder}
        value={props.value}
        style={props.style}
        onChange={(event) => props.onChange(event.target.value)}
      />
    );
  }
  return <PlaceAutocompleteInput {...props} />;
}

export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, React.ReactNode> = {
    notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h4a4 4 0 0 0 4-4V8" /></>,
    edit: <><path d="m4 20 4.5-1L19 8.5a2.1 2.1 0 0 0-3-3L5.5 16 4 20Z" /><path d="m14.5 7.5 3 3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    home: <path d="m3 11 9-8 9 8v9H3v-9Zm6 9v-6h6v6" />,
    business_center: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-13 5h18m-10 0v2h2v-2" /></>,
    favorite: <path d="M20.8 8.7c0 5.5-8.8 10.3-8.8 10.3S3.2 14.2 3.2 8.7A4.7 4.7 0 0 1 12 6a4.7 4.7 0 0 1 8.8 2.7Z" />,
    description: <><path d="M6 3h9l3 3v15H6V3Z" /><path d="M14 3v4h4M9 11h6m-6 4h6" /></>,
    inventory_2: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></>,
    local_shipping: <><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    radio_button_unchecked: <circle cx="12" cy="12" r="8" />,
    arrow_forward: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
    verified_user: <><path d="m12 3 7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg className={`icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? <circle cx="12" cy="12" r="8" />}</svg>;
}

export default function Booking() {
  const {
    start, draft, setDraft, mapLocations, setMapTarget, setMapLocation,
    routeInfo, routeLoading, routeError,
  } = useTrip();
  const router = useRouter(), toast = useToast();
  const [selected, setSelected] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [promo, setPromo] = useState("");
  const [pk, setPk] = useState("Documents");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState("");
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState("");
  const [chips, setChips] = useState<[string, string, string][]>([]);
  const [q, setQ] = useState<Awaited<ReturnType<typeof api.quote>> | null>(null);
  const [quoteError, setQuoteError] = useState("");

  useEffect(() => {
    Promise.all([api.me(), api.listOrders()]).then(([u, o]) => {
      const c: [string, string, string][] = [];
      if (u?.home) c.push(["home", u.home, "15 min"]);
      if (u?.work) c.push(["business_center", u.work, "22 min"]);
      [...new Set(o.map((x) => x.to))].slice(0, 3).forEach((a) => c.push(["favorite", a, ""]));
      setChips(c);
    });
  }, []);

  useEffect(() => {
    if (draft) {
      setFrom(draft.from);
      setTo(draft.to);
      setDraft(null);
    }
  }, [draft, setDraft]);

  useEffect(() => {
    if (mapLocations.pickup) setFrom(mapLocations.pickup.address);
  }, [mapLocations.pickup]);

  useEffect(() => {
    if (mapLocations.destination) setTo(mapLocations.destination.address);
  }, [mapLocations.destination]);

  useEffect(() => {
    const pickup = mapLocations.pickup;
    const destination = mapLocations.destination;
    const routeMatchesLocations = Boolean(
      pickup && destination && routeInfo &&
      routeInfo.from.lat === pickup.lat && routeInfo.from.lng === pickup.lng &&
      routeInfo.to.lat === destination.lat && routeInfo.to.lng === destination.lng,
    );
    if (!from.trim() || !to.trim() || !pickup || !destination || !routeMatchesLocations || !routeInfo) {
      setQ(null);
      setQuoteError("");
      return;
    }

    let active = true;
    setQ(null);
    setQuoteError("");
    api.quote(from.trim(), to.trim(), promo.trim().toUpperCase(), pickup, destination)
      .then((quote) => { if (active) setQ(quote); })
      .catch((error: unknown) => {
        if (active) setQuoteError(error instanceof Error ? error.message : "Could not calculate the delivery price.");
      });
    return () => { active = false; };
  }, [from, mapLocations.destination, mapLocations.pickup, promo, routeInfo, to]);

  const currentOption = deliveryOptions[selected];
  const finalPriceNum = q ? q.total : currentOption.priceNum;
  const routeMatchesLocations = Boolean(
    mapLocations.pickup && mapLocations.destination && routeInfo &&
    routeInfo.from.lat === mapLocations.pickup.lat && routeInfo.from.lng === mapLocations.pickup.lng &&
    routeInfo.to.lat === mapLocations.destination.lat && routeInfo.to.lng === mapLocations.destination.lng,
  );

  function updateAddress(target: "pickup" | "destination", value: string) {
    if (target === "pickup") setFrom(value);
    else setTo(value);
    if (mapLocations[target]?.address !== value) setMapLocation(target, null);
  }

  async function submit() {
    if (!to.trim() || !mapLocations.pickup || !mapLocations.destination || !routeMatchesLocations || !routeInfo || !q) return;
    const base = {
      from: from.trim(),
      to: to.trim(),
      phone: phone.trim() || "08012345678",
      mode: "Send" as const,
      fromLocation: mapLocations.pickup,
      toLocation: mapLocations.destination,
      pk,
      note: note.trim(),
      promo: q && q.discount > 0 ? promo.trim().toUpperCase() : "",
    };
    if (later && when) {
      await api.scheduleOrder({ ...base, scheduledFor: when });
      toast("Scheduled for " + new Date(when).toLocaleString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
      router.push("/activity");
      return;
    }
    await start(base);
  }

  return (
    <div className="sheet gl booking-sheet" style={{ maxHeight: "calc(100% - 100px)", overflowY: "auto" }}>
      <div className="sheet-handle" style={{ width: 36, height: 4, background: "var(--ln)", borderRadius: 2, margin: "0 auto 8px" }} />
      <div className="sheet-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p className="eyebrow" style={{ fontSize: 11, fontWeight: 700, color: "var(--g)", letterSpacing: ".5px" }}>INSTANT COURIER</p>
          <h1 style={{ fontSize: 22, marginTop: 2 }}>Where are we sending it?</h1>
        </div>
        <Icon name="route" className="heading-icon" />
      </div>

      <div className="route-inputs">
        <div className="route-row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="route-dot current" style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6", display: "inline-block", flex: "none" }} />
          <div className="route-copy" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <span className="input-label" style={{ fontSize: 11, color: "var(--mu)" }}>Pickup point</span>
            <AddressInput
              className="input-value place-address-input booking-address-input"
              style={{ border: 0, background: "transparent", color: "var(--tx)", fontSize: 14, fontWeight: 600, outline: 0, padding: 0 }}
              value={from}
              onChange={(value) => updateAddress("pickup", value)}
              onSelect={(location) => setMapLocation("pickup", location)}
              placeholder="Pickup address"
            />
          </div>
          <button title="Select pickup on map" onClick={() => {
            if (process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY) setMapTarget("pickup");
            else toast("Add a Geoapify API key to select a pickup point on the map.");
          }} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--mu)" }}>
            <MapPin size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="route-connector" style={{ width: 2, height: 12, background: "var(--ln)", marginLeft: 4 }} />
        <div className="route-row" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="route-dot destination" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--g)", display: "inline-block", flex: "none" }} />
          <AddressInput
            className="destination-input place-address-input booking-address-input"
            placeholder="Where to?"
            value={to}
            onChange={(value) => updateAddress("destination", value)}
            onSelect={(location) => setMapLocation("destination", location)}
          />
          {to && (
            <button className="clear-input" onClick={() => setTo("")} aria-label="Clear destination" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--mu)" }}>
              <Icon name="close" />
            </button>
          )}
          <button title="Select destination on map" onClick={() => {
            if (process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY) setMapTarget("destination");
            else toast("Add a Geoapify API key to select a destination on the map.");
          }} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--mu)" }}>
            <MapPin size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="route-summary" role="status" aria-live="polite">
        {routeLoading
          ? "Calculating driving distance…"
          : routeMatchesLocations && routeInfo
            ? `${routeInfo.km.toFixed(1)} km driving · about ${Math.max(1, Math.round(routeInfo.durationSeconds / 60))} min`
            : routeError || quoteError || (!process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY
              ? "Configure Geoapify to search places and calculate driving distance"
              : "Choose a pickup and destination from the map suggestions to calculate the route")}
      </div>

      {chips.length > 0 && (
        <div className="saved-locations">
          {chips.map(([iconName, name]) => (
            <button key={`${iconName}-${name}`} className="saved-chip" aria-label={`Send to ${name}`} title={name} onClick={() => updateAddress("destination", name)}>
              <Icon name={iconName} />
              <span className="saved-chip-copy">
                <strong>{iconName === "home" ? "Home" : iconName === "business_center" ? "Work" : "Recent"}</strong>
                <span>{name}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="booking-extra-fields">
        <label className="booking-field-group">
          <span>Receiver&apos;s phone</span>
          <input
            className="booking-field"
            placeholder="e.g. 080 1234 5678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            autoComplete="tel"
          />
        </label>
        <label className="booking-field-group">
          <span>Promo code</span>
          <input
            className="booking-field"
            placeholder="Enter code"
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>

      <button className="btn" disabled={!routeMatchesLocations || !q || routeLoading} onClick={submit} type="button" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px", marginTop: 4 }}>
        <span>Dispatch rider</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {naira(finalPriceNum)}
          <Icon name="arrow_forward" />
        </span>
      </button>

      <p className="secure-note" style={{ textAlign: "center", fontSize: 12, color: "var(--mu)", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 2 }}>
        <Icon name="verified_user" /> Secure checkout · No hidden fees
      </p>
    </div>
  );
}
