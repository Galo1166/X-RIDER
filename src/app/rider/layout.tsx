"use client";
import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RiderProvider, useRider } from "@/lib/rider";
import RiderMap from "@/components/RiderMap";
import BottomNav from "@/components/BottomNav";
import RiderGate from "@/components/RiderGate";

const TABS = [["/rider", "Home", "home"], ["/rider/earnings", "Earnings", "history"], ["/rider/account", "Account", "person"]] as const;

function Shell({ children }: { children: ReactNode }) {
  const { ready, loadingError, user, profile, refresh } = useRider();
  const path = usePathname(), router = useRouter();
  const login = path === "/rider/login";
  const missingApplicationDocuments = profile?.approvalStatus === "pending" &&
    (!profile.documents?.identityDocument || !profile.documents.vehiclePhoto || !profile.documents.profilePhoto);
  useEffect(() => {
    if (!ready) return;
    if ((!user || user.role !== "rider" || !profile) && !login) router.replace("/rider/login");
    if (user?.role === "rider" && profile && profile.approvalStatus !== "rejected" && !missingApplicationDocuments && login) router.replace("/rider");
  }, [ready, user, profile, missingApplicationDocuments, login, router]);
  if (!ready) return null;
  if (loadingError) return <main className="center"><section className="ac gl"><h1>Could not load Rider</h1><p className="mut">{loadingError}</p><button className="btn" onClick={() => { void refresh(); }}>Try again</button></section></main>;
  if (login) return <>{children}</>;
  if (!user || user.role !== "rider" || !profile) return null;
  if (profile.approvalStatus !== "approved") return <RiderGate />;
  return (
    <div className="app">
      <RiderMap area={profile.operatingArea} />
     
      {children}
      <BottomNav tabs={TABS} className="rider-nav" />
    </div>
  );
}
export default function RiderLayout({ children }: { children: ReactNode }) {
  return <RiderProvider><Shell>{children}</Shell></RiderProvider>;
}
