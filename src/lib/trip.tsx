"use client";
// Client-side stand-in for the live order. With a backend, this state comes from the server via realtime events.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type Order, type OrderContact, type Rider } from "./api";
import { useToast } from "@/components/Toast";

export type Stage = "searching" | "toPickup" | "atPickup" | "picked" | "toDrop" | "done";
export type TripInput = {
  from: string;
  to: string;
  phone: string;
  mode: "Send" | "Receive";
  km: number;
  price: number;
  baseFare?: number;
  distanceFare?: number;
  discount?: number;
  fromLocation?: MapLocation;
  toLocation?: MapLocation;
  pk?: string;
  note?: string;
  promo?: string;
};
export type OrderRequestInput = Omit<TripInput, "km" | "price"> & {
  fromLocation: MapLocation;
  toLocation: MapLocation;
};
export type Draft = { from: string; to: string; mode: "Send" | "Receive" }; // used by "Repeat" in Activity
export type Trip = TripInput & { stage: Stage; prog: number; rider: Rider; contact?: OrderContact | null; t0: number; pickAt?: number; orderId: string; rated?: boolean };
export type MapTarget = "pickup" | "destination";
export type MapLocation = { address: string; lat: number; lng: number };
export type RouteInfo = {
  from: Pick<MapLocation, "lat" | "lng">;
  to: Pick<MapLocation, "lat" | "lng">;
  km: number;
  durationSeconds: number;
  path: { lat: number; lng: number }[];
};

const STATUS_TO_STAGE: Record<Order["status"], Stage | null> = {
  Searching: "searching",
  "Rider assigned": "toPickup",
  "At pickup": "atPickup",
  "Picked up": "picked",
  "Out for delivery": "toDrop",
  Delivered: "done",
  Cancelled: null,
  Scheduled: null,
};

function toTrip(order: Order): Trip | null {
  const stage = STATUS_TO_STAGE[order.status];
  if (!stage) return null;
  return {
    from: order.from,
    to: order.to,
    phone: order.phone,
    mode: order.mode,
    km: order.km,
    price: order.price,
    baseFare: order.baseFare,
    distanceFare: order.distanceFare,
    discount: order.discount,
    fromLocation: order.fromLocation,
    toLocation: order.toLocation,
    pk: order.pk,
    note: order.note,
    promo: order.promo,
    stage,
    prog: 0,
    rider: order.rider ?? { name: "Your rider", rating: "—", plate: "—" },
    contact: order.contact,
    t0: order.createdAt,
    pickAt: order.pickAt,
    orderId: order.id,
    rated: order.rate !== undefined,
  };
}

type Ctx = {
  trip: Trip | null;
  start: (i: OrderRequestInput) => Promise<void>;
  cancel: (reason: string) => Promise<void>;
  rate: (n: number, tags: string[], comment: string) => Promise<void>;
  reset: () => void;
  draft: Draft | null;
  setDraft: (d: Draft | null) => void;
  mapTarget: MapTarget | null;
  setMapTarget: (target: MapTarget | null) => void;
  mapLocations: Partial<Record<MapTarget, MapLocation>>;
  setMapLocation: (target: MapTarget, location: MapLocation | null) => void;
  routeInfo: RouteInfo | null;
  setRouteInfo: (route: RouteInfo | null) => void;
  routeLoading: boolean;
  setRouteLoading: (loading: boolean) => void;
  routeError: string | null;
  setRouteError: (error: string | null) => void;
};
const TripCtx = createContext<Ctx>(null as unknown as Ctx);
export const useTrip = () => useContext(TripCtx);

export function TripProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [mapLocations, setMapLocations] = useState<Partial<Record<MapTarget, MapLocation>>>({});
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const polling = useRef(false);
  const pollErrorShown = useRef(false);

  const start = useCallback(async (i: OrderRequestInput) => {
    const order = await api.requestOrder(i);
    const nextTrip = toTrip(order);
    if (!nextTrip) throw new Error("The delivery request was not created in an active state.");
    setTrip(nextTrip);
  }, []);

  useEffect(() => {
    let mounted = true;
    api.activeOrder()
      .then((order) => {
        if (mounted && order) setTrip(toTrip(order));
      })
      .catch((error: unknown) => {
        if (mounted) toast(error instanceof Error ? error.message : "Could not restore your active delivery.");
      });
    return () => { mounted = false; };
  }, [toast]);

  useEffect(() => {
    if (!trip) return;
    let mounted = true;
    let finished = trip.stage === "done";
    const sync = async () => {
      if (!mounted || finished || polling.current) return;
      polling.current = true;
      try {
        const order = await api.order(trip.orderId);
        if (!mounted) return;
        pollErrorShown.current = false;
        if (order.status === "Cancelled") {
          finished = true;
          setTrip(null);
          toast("This delivery was cancelled.");
          return;
        }
        const nextTrip = toTrip(order);
        if (nextTrip) {
          setTrip(nextTrip);
          if (order.status === "Delivered") {
            finished = true;
            toast("Delivered ✅");
          }
        }
      } catch (error) {
        if (!pollErrorShown.current) {
          pollErrorShown.current = true;
          toast(error instanceof Error ? error.message : "Could not refresh delivery status.");
        }
      } finally {
        polling.current = false;
      }
    };
    const id = setInterval(() => { void sync(); }, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [trip?.orderId, toast]);

  const cancel = useCallback(async (reason: string) => {
    if (!trip) return;
    await api.cancelOrder(trip.orderId, reason);
    setTrip(null);
    toast("Order cancelled");
  }, [trip, toast]);

  const rate = useCallback(async (n: number, tags: string[], comment: string) => {
    if (trip) await api.updateOrder(trip.orderId, { rate: n, tags, comment });
    setTrip((p) => (p ? { ...p, rated: true } : p));
    toast("Thanks for rating " + "★".repeat(n));
  }, [trip, toast]);

  const setMapLocation = useCallback((target: MapTarget, location: MapLocation | null) => {
    setMapLocations((current) => {
      if (location) return { ...current, [target]: location };
      const next = { ...current };
      delete next[target];
      return next;
    });
  }, []);

  return <TripCtx.Provider value={{
    trip, start, cancel, rate, reset: () => setTrip(null), draft, setDraft, mapTarget, setMapTarget,
    mapLocations, setMapLocation, routeInfo, setRouteInfo, routeLoading, setRouteLoading, routeError, setRouteError,
  }}>{children}</TripCtx.Provider>;
}
