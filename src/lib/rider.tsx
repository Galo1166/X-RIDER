"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, type Order, type RiderProfile, type User } from "@/lib/api";
import { useToast } from "@/components/Toast";

type RiderContextValue = {
  ready: boolean;
  loadingError: string;
  user: User | null;
  profile: RiderProfile | null;
  orders: Order[];
  finished: Order | null;
  refresh: () => Promise<void>;
  applyProfile: (application: FormData) => Promise<void>;
  setOnline: (online: boolean) => Promise<void>;
  acceptOrder: (id: string) => Promise<void>;
  advanceOrder: (id: string, status: "At pickup" | "Picked up" | "Out for delivery" | "Delivered") => Promise<void>;
  clearFinished: () => void;
  logOut: () => Promise<void>;
};

const RiderContext = createContext<RiderContextValue | null>(null);

export function RiderProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [ready, setReady] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<RiderProfile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [finished, setFinished] = useState<Order | null>(null);

  const refresh = useCallback(async () => {
    setLoadingError("");
    try {
      const account = await api.me();
      setUser(account);
      if (account?.role === "rider") {
        const riderProfile = await api.riderProfile();
        setProfile(riderProfile);
        setOrders(riderProfile ? await api.riderOrders() : []);
      } else {
        setProfile(null);
        setOrders([]);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setProfile(null);
        setOrders([]);
        return;
      }
      const message = error instanceof Error ? error.message : "Could not load your rider account.";
      setLoadingError(message);
      throw error;
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    if (user?.role !== "rider" || !profile) return;
    try {
      const currentProfile = await api.riderProfile();
      setProfile(currentProfile);
      setOrders(currentProfile ? await api.riderOrders() : []);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not refresh delivery requests.");
    }
  }, [profile, toast, user?.role]);

  useEffect(() => {
    void refresh().catch(() => undefined).finally(() => setReady(true));
  }, [refresh]);

  useEffect(() => {
    if (!ready || user?.role !== "rider" || !profile) return;
    const timer = window.setInterval(() => { void refreshOrders(); }, 5000);
    return () => window.clearInterval(timer);
  }, [profile, ready, refreshOrders, user?.role]);

  const applyProfile = useCallback(async (application: FormData) => {
    const updated = await api.submitRiderApplication(application);
    setProfile(updated);
    await refresh();
  }, [refresh]);

  const setOnline = useCallback(async (online: boolean) => {
    if (!profile) throw new Error("Complete your rider application before changing online status.");
    const updated = await api.setRiderProfile({ plate: profile.plate, online });
    setProfile(updated);
    await refreshOrders();
  }, [profile, refreshOrders]);

  const acceptOrder = useCallback(async (id: string) => {
    await api.acceptRiderOrder(id);
    await refreshOrders();
  }, [refreshOrders]);

  const advanceOrder = useCallback(async (id: string, status: "At pickup" | "Picked up" | "Out for delivery" | "Delivered") => {
    const updated = await api.updateRiderOrderStatus(id, status);
    if (status === "Delivered") setFinished(updated);
    await refreshOrders();
  }, [refreshOrders]);

  const logOut = useCallback(async () => {
    await api.logOut();
    setUser(null);
    setProfile(null);
    setOrders([]);
    setFinished(null);
  }, []);

  const value = useMemo(() => ({
    ready, loadingError, user, profile, orders, finished, refresh, applyProfile, setOnline,
    acceptOrder, advanceOrder, clearFinished: () => setFinished(null), logOut,
  }), [ready, loadingError, user, profile, orders, finished, refresh, applyProfile, setOnline, acceptOrder, advanceOrder, logOut]);

  return <RiderContext.Provider value={value}>{children}</RiderContext.Provider>;
}

export function useRider(): RiderContextValue {
  const value = useContext(RiderContext);
  if (!value) throw new Error("useRider must be used inside RiderProvider.");
  return value;
}
