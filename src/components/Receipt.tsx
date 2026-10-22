"use client";
import Modal from "./Modal";
import { BASE, PER_KM, naira } from "@/lib/pricing";

export type ReceiptData = {
  id?: string; from: string; to: string; km: number; price: number; rider?: string; at: number;
  baseFare?: number; distanceFare?: number; discount?: number;
};

export default function Receipt({ o, onClose }: { o: ReceiptData; onClose: () => void }) {
  const base = o.baseFare ?? BASE;
  const dist = o.distanceFare ?? Math.round(o.km * PER_KM);
  const discount = o.discount ?? Math.max(0, base + dist - o.price);
  const row = (a: string, b: string) => <div className="row"><span>{a}</span><b>{b}</b></div>;
  return (
    <Modal title="Receipt" onClose={onClose}>
      {row("Order ID", o.id ?? "—")}{row("Date", new Date(o.at).toLocaleString("en-NG"))}{o.rider ? row("Rider", o.rider) : null}
      {row("From", o.from)}{row("To", o.to)}{row("Base fare", naira(base))}{row(`Distance (${o.km.toFixed(1)} km)`, naira(dist))}
      {discount >= 50 ? row("Promo", "-" + naira(discount)) : null}{row("Paid in cash", naira(o.price))}
    </Modal>
  );
}
