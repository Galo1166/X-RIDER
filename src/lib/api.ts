export type User = { id?: string; phone: string; name: string; email?: string; role?: "customer" | "rider" | "admin"; accountStatus?: "active" | "suspended"; home?: string; work?: string; nf?: { o?: boolean; c?: boolean; p?: boolean } };
export type OrderStatus = "Searching" | "Rider assigned" | "At pickup" | "Picked up" | "Out for delivery" | "Delivered" | "Cancelled" | "Scheduled";
export type Rider = { name: string; rating: string; plate: string };
export type OrderContact = { name: string; phone: string };
export type OrderMessage = {
  id: string; senderId: string; senderName: string; senderRole: "customer" | "rider";
  text: string; createdAt: number; mine: boolean;
};
export type Order = {
  id: string; from: string; to: string; phone: string; mode: "Send" | "Receive"; km: number; price: number;
  baseFare?: number; distanceFare?: number; discount?: number;
  fromLocation?: { address: string; lat: number; lng: number };
  toLocation?: { address: string; lat: number; lng: number };
  status: OrderStatus; createdAt: number; rider?: Rider; contact?: OrderContact | null; pin?: string; reason?: string;
  reqAt?: number; arrivedAt?: number; pickAt?: number; endAt?: number; rate?: number; tags?: string[]; comment?: string;
  pk?: string; note?: string; promo?: string; issue?: string; scheduledFor?: string;
};
export type RiderProfile = {
  plate: string; online: boolean; approvalStatus?: "pending" | "approved" | "rejected" | "suspended";
  vehicleType?: string; operatingArea?: string;
  documents?: { identityDocument: boolean; vehiclePhoto: boolean; profilePhoto: boolean };
  commissionDue?: number; commissionOverdue?: boolean;
};
export type RiderEarning = {
  id: string; from: string; to: string; price: number; createdAt: number;
  deliveredAt: number; serviceDate: string; ratePercent: number; commissionAmount: number; settled: boolean;
};
export type FareSettings = { base: number; perKm: number; minimum: number; roundTo: number };
export type PromoRecord = {
  code: string; label: string; kind: "percent" | "fixed"; value: number; active: boolean;
  startsAt: number | null; endsAt: number | null; maxRedemptions: number | null; redemptionCount: number;
};
export type AdminSummary = {
  users: number; riders: number; pendingRiders: number; onlineRiders: number; orders: number;
  activeOrders: number; todayOrders: number; todayGross: number; openSupport: number; outstandingCash: number;
  todayCommission: number; outstandingCommission: number;
  statuses: Record<string, number>;
};
export type AdminOrder = Order & {
  customer: { id: string; name: string; phone: string };
  riderAccount: { id: string; name: string; phone: string } | null;
};
export type AdminRider = {
  id: string; name: string; phone: string; accountStatus: string; plate: string; online: boolean;
  vehicleType: string; operatingArea: string;
  documents: { identityDocument: boolean; vehiclePhoto: boolean; profilePhoto: boolean };
  approvalStatus: "pending" | "approved" | "rejected" | "suspended"; deliveredCount: number; cashDue: number;
  commissionDue: number; commissionOverdue: boolean; activeCount: number;
};
export type AdminUser = {
  id: string; name: string; phone: string; email: string; role: "customer" | "rider" | "admin";
  accountStatus: "active" | "suspended"; orderCount: number; deliveredCount: number;
};
export type AdminCashRow = {
  id: string; name: string; phone: string; plate: string; deliveries: number; collected: number; remitted: number; outstanding: number;
};
export type AdminCommissionRow = {
  riderId: string; riderName: string; riderPhone: string; plate: string; serviceDate: string;
  deliveries: number; fareTotal: number; commissionDue: number; settlementId: string | null;
  settledAt: number | null; settledBy: string | null; settled: boolean;
};
export type AdminCommissionReport = {
  ratePercent: number; today: string; todayCommission: number; outstandingCommission: number;
  periods: Record<"today" | "thisWeek" | "thisMonth" | "allTime", {
    deliveries: number; fareTotal: number; commissionTotal: number;
  }>;
  rows: AdminCommissionRow[];
};
export type SupportTicket = {
  id: string; orderId: string | null; subject: string; message: string;
  status: "open" | "in_progress" | "resolved" | "closed"; resolution: string;
  createdAt: number; updatedAt: number; userId?: string; userName?: string; userPhone?: string;
};
export type AuditEntry = {
  id: string; action: string; entityType: string; entityId: string; details: Record<string, unknown>;
  createdAt: number; actorName: string;
};

type MapLocation = NonNullable<Order["fromLocation"]>;
type OrderRequest = Pick<Order, "from" | "to" | "phone" | "mode"> & {
  fromLocation: MapLocation;
  toLocation: MapLocation;
} & Partial<Pick<Order, "pk" | "note" | "promo">>;
type Quote = { km: number; base: number; distance: number; discount: number; total: number; durationSeconds: number };
type OtpPurpose = "signup" | "login" | "password_reset";
type OtpChallenge = { challengeId: string; expiresInSeconds: number; devCode?: string };

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return body as T;
}

export const api = {
  requestPhoneOtp(
    phone: string,
    purpose: OtpPurpose,
    options?: { name?: string; password?: string; termsAccepted?: boolean },
  ): Promise<OtpChallenge> {
    return request("/api/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone, purpose, ...options }),
    });
  },
  verifyPhoneOtp(phone: string, challengeId: string, code: string): Promise<User> {
    return request("/api/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, challengeId, code }),
    });
  },
  signIn(phone: string, password: string): Promise<User> {
    return request("/api/auth/dev/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
  },
  resetPassword(phone: string, challengeId: string, code: string, password: string): Promise<{ ok: true }> {
    return request("/api/auth/password/reset", {
      method: "POST",
      body: JSON.stringify({ phone, challengeId, code, password }),
    });
  },
  async logOut(): Promise<void> {
    await request("/api/auth/session", { method: "DELETE" });
  },
  me(): Promise<User | null> {
    return request("/api/me");
  },
  async updateMe(patch: Partial<User>): Promise<void> {
    await request("/api/me", { method: "PATCH", body: JSON.stringify(patch) });
  },
  async deleteAccount(): Promise<void> {
    await request("/api/me", { method: "DELETE" });
  },
  quote(from: string, to: string, promo: string | undefined, fromLocation: MapLocation, toLocation: MapLocation): Promise<Quote> {
    return request("/api/quote", { method: "POST", body: JSON.stringify({ from, to, promo, fromLocation, toLocation }) });
  },
  pricing(): Promise<FareSettings & { promos: { code: string; label: string; kind: "percent" | "fixed"; value: number }[] }> {
    return request("/api/pricing");
  },
  requestOrder(order: OrderRequest): Promise<Order> {
    return request("/api/orders/request", { method: "POST", body: JSON.stringify(order) });
  },
  scheduleOrder(order: OrderRequest & { scheduledFor: string }): Promise<Order> {
    return request("/api/orders", { method: "POST", body: JSON.stringify(order) });
  },
  activeOrder(): Promise<Order | null> {
    return request("/api/orders/active");
  },
  cancelOrder(id: string, reason: string): Promise<Order> {
    return request(`/api/orders/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  },
  async updateOrder(id: string, patch: Partial<Order>): Promise<Order> {
    return request(`/api/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  listOrders(): Promise<Order[]> {
    return request("/api/orders");
  },
  order(id: string): Promise<Order> {
    return request(`/api/orders/${encodeURIComponent(id)}`);
  },
  orderMessages(id: string): Promise<OrderMessage[]> {
    return request(`/api/orders/${encodeURIComponent(id)}/messages`);
  },
  sendOrderMessage(id: string, text: string, senderRole: "customer" | "rider"): Promise<OrderMessage> {
    return request(`/api/orders/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text, senderRole }),
    });
  },
  riderProfile(): Promise<RiderProfile | null> {
    return request("/api/rider/profile");
  },
  submitRiderApplication(input: FormData): Promise<RiderProfile> {
    return request("/api/rider/application", { method: "POST", body: input });
  },
  setRiderProfile(profile: RiderProfile): Promise<RiderProfile> {
    return request("/api/rider/profile", { method: "POST", body: JSON.stringify(profile) });
  },
  riderOrders(): Promise<Order[]> {
    return request("/api/rider/orders");
  },
  riderEarnings(): Promise<RiderEarning[]> {
    return request("/api/rider/earnings");
  },
  acceptRiderOrder(id: string): Promise<Order> {
    return request(`/api/rider/orders/${encodeURIComponent(id)}/accept`, { method: "POST" });
  },
  updateRiderOrderStatus(id: string, status: "At pickup" | "Picked up" | "Out for delivery" | "Delivered"): Promise<Order> {
    return request(`/api/rider/orders/${encodeURIComponent(id)}/status`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
  },
  createSupportTicket(input: { orderId?: string; subject: string; message: string }): Promise<{ id: string; status: string; createdAt: number }> {
    return request("/api/support", { method: "POST", body: JSON.stringify(input) });
  },
  supportTickets(): Promise<SupportTicket[]> {
    return request("/api/support");
  },
  adminMe(): Promise<{ id: string; name: string }> {
    return request("/api/admin/me");
  },
  adminOverview(): Promise<AdminSummary> {
    return request("/api/admin/overview");
  },
  adminOrders(search = "", status = ""): Promise<AdminOrder[]> {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    return request(`/api/admin/orders${params.size ? `?${params}` : ""}`);
  },
  updateAdminOrder(id: string, patch: { status?: "Searching" | "Cancelled"; riderUserId?: string | null; reason?: string }): Promise<Order> {
    return request(`/api/admin/orders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  adminRiders(): Promise<AdminRider[]> {
    return request("/api/admin/riders");
  },
  updateAdminRider(id: string, approvalStatus: AdminRider["approvalStatus"]): Promise<{ ok: true }> {
    return request(`/api/admin/riders/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ approvalStatus }) });
  },
  adminUsers(search = ""): Promise<AdminUser[]> {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    return request(`/api/admin/users${params.size ? `?${params}` : ""}`);
  },
  adminUser(id: string): Promise<AdminUser & { orders: Order[] }> {
    return request(`/api/admin/users/${encodeURIComponent(id)}`);
  },
  updateAdminUser(id: string, patch: { role?: "customer" | "rider" | "admin"; accountStatus?: "active" | "suspended" }): Promise<{ ok: true }> {
    return request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  adminPricing(): Promise<FareSettings & { promos: PromoRecord[] }> {
    return request("/api/admin/pricing");
  },
  updateAdminPricing(settings: FareSettings): Promise<FareSettings> {
    return request("/api/admin/pricing", { method: "PATCH", body: JSON.stringify(settings) });
  },
  createAdminPromo(promo: {
    code: string; label: string; kind: "percent" | "fixed"; value: number; active: boolean;
    startsAt: string | null; endsAt: string | null; maxRedemptions: number | null;
  }): Promise<{ ok: true }> {
    return request("/api/admin/promos", { method: "POST", body: JSON.stringify(promo) });
  },
  updateAdminPromo(code: string, patch: Partial<Omit<PromoRecord, "code" | "redemptionCount">>): Promise<{ ok: true }> {
    return request(`/api/admin/promos/${encodeURIComponent(code)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  adminCash(): Promise<AdminCashRow[]> {
    return request("/api/admin/cash");
  },
  recordCashRemittance(riderId: string, amount: number, note = ""): Promise<{ outstanding: number }> {
    return request(`/api/admin/cash/${encodeURIComponent(riderId)}/remit`, {
      method: "POST", body: JSON.stringify({ amount, note }),
    });
  },
  adminCommission(): Promise<AdminCommissionReport> {
    return request("/api/admin/commission", { cache: "no-store" });
  },
  updateAdminCommissionRate(ratePercent: number): Promise<{ ratePercent: number }> {
    return request("/api/admin/commission/rate", { method: "PATCH", body: JSON.stringify({ ratePercent }) });
  },
  settleAdminCommissionDay(riderId: string, serviceDate: string): Promise<{ amount: number }> {
    return request(`/api/admin/commission/${encodeURIComponent(riderId)}/${encodeURIComponent(serviceDate)}/settle`, {
      method: "POST", body: JSON.stringify({}),
    });
  },
  adminSupport(status = ""): Promise<SupportTicket[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return request(`/api/admin/support${params.size ? `?${params}` : ""}`);
  },
  updateAdminSupport(id: string, patch: { status?: SupportTicket["status"]; resolution?: string }): Promise<{ ok: true }> {
    return request(`/api/admin/support/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  },
  adminAudit(): Promise<AuditEntry[]> {
    return request("/api/admin/audit");
  },
  adminAccounts(): Promise<{ id: string; name: string; phone: string; email: string }[]> {
    return request("/api/admin/admins");
  },
};
