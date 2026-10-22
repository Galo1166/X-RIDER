// Move these to the database / admin settings once the backend exists.
export const BASE = 900;
export const PER_KM = 150;
export const FEE_PERCENT = 15;
export const PROMOS: Record<string, { percent?: number; amount?: number; label: string }> = {
  XRIDER10: { percent: 10, label: "10% off" },
  FIRST500: { amount: 500, label: "₦500 off" },
};

export function quote(km: number, promo?: string) {
  const sub = BASE + km * PER_KM;
  const p = promo ? PROMOS[promo] : undefined;
  const discount = p ? (p.percent ? (sub * p.percent) / 100 : p.amount ?? 0) : 0;
  return { base: BASE, distance: Math.round(km * PER_KM), discount: Math.round(discount), total: Math.max(300, Math.round((sub - discount) / 50) * 50) };
}
export const naira = (n: number) => "₦" + Math.round(n).toLocaleString("en-NG");
