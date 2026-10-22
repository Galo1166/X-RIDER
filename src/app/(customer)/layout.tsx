"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import CityMap from "@/components/CityMap";
import BottomNav from "@/components/BottomNav";
import { TripProvider } from "@/lib/trip";
import { useToast } from "@/components/Toast";

// Middleware protects customer routes; this confirms the session before rendering the app shell.
export default function CustomerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    api.me()
      .then((u) => (u ? setReady(true) : router.replace("/login")))
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : "Could not verify your local session.");
        router.replace("/login");
      });
  }, [router, toast]);
  if (!ready) return null;
  const app = <div className="app"><CityMap />{children}<BottomNav /></div>;
  return (
    <TripProvider>
      {app}
    </TripProvider>
  );
}
