"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useRider } from "@/lib/rider";
import { useToast } from "@/components/Toast";

export default function RiderGate() {
  const { profile, logOut, refresh } = useRider();
  const router = useRouter(), toast = useToast();
  const [busy, setBusy] = useState(false);
  const status = profile?.approvalStatus ?? "pending";
  const missingDocuments = status === "pending" &&
    (!profile?.documents?.identityDocument || !profile.documents.vehiclePhoto || !profile.documents.profilePhoto);
  const message = status === "rejected"
    ? "Your application was not approved. Contact X-RIDER support for help."
    : status === "suspended"
      ? "Rider operations are suspended for this account. Contact X-RIDER support."
      : "Your rider application is waiting for approval. You can sign in again later to check its status.";

  return (
    <main className="center">
      <section className="ac gl">
        <b style={{ fontSize: 20 }}>X-RIDER Rider</b>
        <h1>Application {status}</h1>
        <p className="mut">{message}</p>
        <button className="btn sec" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await refresh(); }
          catch (error) { toast(error instanceof Error ? error.message : "Could not refresh your rider status."); }
          finally { setBusy(false); }
        }}>{busy ? "Refreshing…" : "Refresh status"}</button>
        {missingDocuments && <button className="btn sec" onClick={() => router.push("/rider/login")}>Complete application</button>}
        {status === "rejected" && <button className="btn sec" onClick={() => router.push("/rider/login")}>Update and reapply</button>}
        <button className="btn" onClick={async () => { await logOut(); router.replace("/rider/login"); }}>Log out</button>
      </section>
    </main>
  );
}
