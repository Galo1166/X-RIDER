"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRider } from "@/lib/rider";
import { normalizeRiderPhone, validPhone } from "@/lib/riderApi";
import { useToast } from "@/components/Toast";

const DOCUMENTS = [
  { key: "identityDocument", label: "Identity document", help: "Government ID, licence, or passport", accept: "image/jpeg,image/png,image/webp,application/pdf" },
  { key: "vehiclePhoto", label: "Vehicle photo", help: "A clear photo of your vehicle", accept: "image/jpeg,image/png,image/webp" },
  { key: "profilePhoto", label: "Profile photo", help: "A clear photo of your face", accept: "image/jpeg,image/png,image/webp" },
] as const;
type DocumentKey = typeof DOCUMENTS[number]["key"];
type ApplicationDocuments = Record<DocumentKey, File | null>;

const EMPTY_DOCUMENTS: ApplicationDocuments = {
  identityDocument: null,
  vehiclePhoto: null,
  profilePhoto: null,
};

export default function RiderLogin() {
  const { user, profile, applyProfile, refresh, logOut } = useRider();
  const toast = useToast(), router = useRouter();
  const [mode, setMode] = useState<"home" | "login" | "apply">("home");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(""), [password, setPassword] = useState("");
  const [vehicleType, setVehicleType] = useState("Motorbike");
  const [plate, setPlate] = useState(""), [operatingArea, setOperatingArea] = useState("");
  const [files, setFiles] = useState<ApplicationDocuments>(EMPTY_DOCUMENTS);
  const hasAllDocuments = Boolean(profile?.documents &&
    profile.documents.identityDocument && profile.documents.vehiclePhoto && profile.documents.profilePhoto);

  async function submitLogin() {
    const normalizedPhone = normalizeRiderPhone(phone);
    if (!normalizedPhone) {
      toast("Enter a valid Nigerian mobile number.");
      return;
    }
    setBusy(true);
    try {
      const account = await api.signIn(normalizedPhone, password);
      await refresh();
      if (account.role === "customer") {
        setMode("apply");
        return;
      }
      if (account.role === "rider") {
        const riderProfile = await api.riderProfile();
        if (riderProfile) router.replace("/rider");
        else setMode("apply");
        return;
      }
      toast("Sign in with a customer account to submit a rider application.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not log in.");
    } finally {
      setBusy(false);
    }
  }

  function validateApplication(): boolean {
    if (!user || (user.role !== "customer" && user.role !== "rider")) {
      toast("Sign in with an existing customer account before applying.");
      return false;
    }
    if (plate.trim().length < 2 || plate.trim().length > 12 || !/^[A-Za-z0-9 -]+$/.test(plate.trim())) {
      toast("Enter a valid vehicle plate number (2–12 letters, numbers, spaces, or hyphens).");
      return false;
    }
    if (operatingArea.trim().length < 2 || operatingArea.trim().length > 120) {
      toast("Enter the area where you will operate.");
      return false;
    }
    for (const document of DOCUMENTS) {
      const file = files[document.key];
      if (!file) {
        toast(`Choose your ${document.label.toLowerCase()} to continue.`);
        return false;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast(`${document.label} must be 5 MB or smaller.`);
        return false;
      }
      if (document.key === "identityDocument"
        ? !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)
        : !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        toast(`Choose a supported file for your ${document.label.toLowerCase()}.`);
        return false;
      }
    }
    return true;
  }

  async function submitApplication() {
    if (!validateApplication()) return;
    setBusy(true);
    try {
      const application = new FormData();
      application.set("vehicleType", vehicleType);
      application.set("plate", plate.trim());
      application.set("operatingArea", operatingArea.trim());
      for (const document of DOCUMENTS) {
        const file = files[document.key];
        if (file) application.set(document.key, file, file.name);
      }
      await applyProfile(application);
      router.replace("/rider");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not submit your rider application.");
    } finally {
      setBusy(false);
    }
  }

  function changeDocument(key: DocumentKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFiles((current) => ({ ...current, [key]: file }));
  }

  function startApplication() {
    setVehicleType(profile?.vehicleType ?? "Motorbike");
    setPlate(profile?.plate ?? "");
    setOperatingArea(profile?.operatingArea ?? "");
    setFiles(EMPTY_DOCUMENTS);
    setMode("apply");
  }

  return (
    <main className="center">
      <section className="ac gl">
        <b style={{ fontSize: 20 }}>X-RIDER Rider</b>
        {mode === "home" ? (
          <>
            <h1>Deliver with X-RIDER</h1>
            <p className="mut">Sign in with your existing X-RIDER account, then submit your rider application.</p>
            {user?.role === "customer" ? (
              <button className="btn" onClick={startApplication}>Continue to rider application</button>
            ) : user?.role === "admin" ? (
              <>
                <p className="mut">Rider applications require a customer account.</p>
                <button className="btn sec" onClick={async () => {
                  setBusy(true);
                  try { await logOut(); }
                  catch (error) { toast(error instanceof Error ? error.message : "Could not log out."); }
                  finally { setBusy(false); }
                }}>{busy ? "Logging out…" : "Log out to switch account"}</button>
              </>
            ) : user?.role === "rider" && profile?.approvalStatus === "rejected" ? (
              <>
                <p className="mut">Your application was not approved. You can update your details and submit it again.</p>
                <button className="btn" onClick={startApplication}>Update and reapply</button>
              </>
            ) : user?.role === "rider" && profile?.approvalStatus === "pending" && !hasAllDocuments ? (
              <>
                <p className="mut">Complete your application by adding your vehicle details and required documents.</p>
                <button className="btn" onClick={startApplication}>Complete application</button>
              </>
            ) : user?.role === "rider" && profile ? (
              <button className="btn" onClick={() => router.replace("/rider")}>Open Rider app</button>
            ) : user?.role === "rider" ? (
              <button className="btn" onClick={startApplication}>Continue rider application</button>
            ) : (
              <>
                <button className="btn" onClick={() => setMode("login")}>Log in</button>
                <button className="btn sec" onClick={() => setMode("login")}>Apply to become a rider</button>
                <a className="mut" href="/login?next=%2Frider%2Flogin" style={{ textAlign: "center" }}>Need an account? Create one first</a>
              </>
            )}
          </>
        ) : mode === "login" ? (
          <>
            <button className="back" onClick={() => setMode("home")}>← Back</button>
            <h1>Log in to apply</h1>
            <p className="mut">Use your existing X-RIDER customer phone number and password. You can submit the rider application after signing in.</p>
            <label className="fld gl"><span>🇳🇬 +234</span><input type="tel" inputMode="tel" autoComplete="tel-national" placeholder="801 234 5678" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label className="fld gl"><span>🔒</span><input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <button className="btn" disabled={busy || !validPhone(phone) || !password} onClick={() => void submitLogin()}>{busy ? "Logging in…" : "Log in"}</button>
            <a className="mut" href="/login?next=%2Frider%2Flogin" style={{ textAlign: "center" }}>Create an X-RIDER account first</a>
          </>
        ) : (
          <>
            <button className="back" onClick={() => setMode("home")}>← Back</button>
            <h1>Become a rider</h1>
            <p className="mut">Signed in as {user?.name} · {user?.phone}. Submit your details and documents for review.</p>
            <label className="fld gl">
              <span>🏍️</span>
              <select value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}>
                {["Motorbike", "Bicycle", "Tricycle", "Car"].map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <label className="fld gl"><span>🔢</span><input autoComplete="off" placeholder="Vehicle plate number" value={plate} onChange={(event) => setPlate(event.target.value)} /></label>
            <label className="fld gl"><span>📍</span><input placeholder="Area you operate in" value={operatingArea} onChange={(event) => setOperatingArea(event.target.value)} /></label>
            {DOCUMENTS.map((document) => (
              <label key={document.key} className="fld gl" style={{ cursor: "pointer", flexWrap: "wrap", paddingTop: 10, paddingBottom: 10 }}>
                <span>📎</span>
                <span style={{ display: "grid", flex: 1, minWidth: 0 }}>
                  <b>{document.label}</b>
                  <small className="mut" style={{ overflowWrap: "anywhere" }}>{files[document.key]?.name ?? document.help}</small>
                </span>
                <input
                  type="file"
                  accept={document.accept}
                  required
                  onChange={(event) => changeDocument(document.key, event)}
                  style={{ width: "100%", color: "var(--mu)" }}
                />
                <small className="mut">Max 5 MB · stored privately for application review</small>
              </label>
            ))}
            <button className="btn" disabled={busy} onClick={() => void submitApplication()}>{busy ? "Uploading documents and submitting…" : "Submit rider application"}</button>
          </>
        )}
      </section>
    </main>
  );
}
