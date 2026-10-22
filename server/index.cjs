const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const { loadEnvConfig } = require("@next/env");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);

loadEnvConfig(process.cwd());

if (process.env.NODE_ENV === "production") {
  throw new Error("The local Express backend is development-only.");
}

const app = express();
const port = Number(process.env.API_PORT || 4000);
const dataDirectory = path.join(process.cwd(), ".local");
const riderDocumentsDirectory = path.join(dataDirectory, "rider-documents");
fs.mkdirSync(dataDirectory, { recursive: true });
fs.mkdirSync(riderDocumentsDirectory, { recursive: true });

const db = new Database(path.join(dataDirectory, "x-rider.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    email TEXT,
    profile TEXT NOT NULL DEFAULT '{}',
    role TEXT NOT NULL DEFAULT 'customer',
    account_status TEXT NOT NULL DEFAULT 'active',
    password_hash TEXT,
    terms_accepted_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  CREATE TABLE IF NOT EXISTS auth_attempts (
    phone TEXT PRIMARY KEY,
    attempts INTEGER NOT NULL DEFAULT 0,
    window_started_at INTEGER NOT NULL,
    locked_until INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS api_rate_limits (
    scope TEXT NOT NULL,
    identifier_hash TEXT NOT NULL,
    window_started_at INTEGER NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (scope, identifier_hash, window_started_at)
  );
  CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx ON api_rate_limits(window_started_at);
  CREATE TABLE IF NOT EXISTS app_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS phone_otps (
    phone TEXT PRIMARY KEY,
    challenge_id TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'password_reset')),
    name TEXT,
    password_hash TEXT,
    code_salt TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    sent_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rider_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS orders_user_created_idx ON orders(user_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS order_messages (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL DEFAULT 'customer' CHECK (sender_role IN ('customer', 'rider')),
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS order_messages_order_created_idx ON order_messages(order_id, created_at);
  CREATE TABLE IF NOT EXISTS rider_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plate TEXT NOT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'Motorbike',
    operating_area TEXT NOT NULL DEFAULT '',
    is_online INTEGER NOT NULL DEFAULT 0,
    approval_status TEXT NOT NULL DEFAULT 'pending'
  );
  CREATE TABLE IF NOT EXISTS rider_application_documents (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doc_type TEXT NOT NULL CHECK (doc_type IN ('identityDocument', 'vehiclePhoto', 'profilePhoto')),
    stored_name TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    uploaded_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, doc_type)
  );
  CREATE TABLE IF NOT EXISTS pricing_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_fare INTEGER NOT NULL,
    per_km INTEGER NOT NULL,
    minimum_fare INTEGER NOT NULL,
    round_to INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS commission_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    rate_percent INTEGER NOT NULL CHECK (rate_percent BETWEEN 1 AND 100)
  );
  CREATE TABLE IF NOT EXISTS rider_commissions (
    order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
    rider_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_date TEXT NOT NULL,
    fare_amount INTEGER NOT NULL CHECK (fare_amount >= 0),
    rate_percent INTEGER NOT NULL CHECK (rate_percent BETWEEN 1 AND 100),
    commission_amount INTEGER NOT NULL CHECK (commission_amount >= 0),
    delivered_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS rider_commissions_daily_idx ON rider_commissions(rider_user_id, service_date);
  CREATE TABLE IF NOT EXISTS rider_commission_settlements (
    id TEXT PRIMARY KEY,
    rider_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_date TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    recorded_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    UNIQUE (rider_user_id, service_date)
  );
  CREATE TABLE IF NOT EXISTS promos (
    code TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
    value INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    starts_at INTEGER,
    ends_at INTEGER,
    max_redemptions INTEGER,
    redemption_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS support_tickets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    resolution TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, created_at DESC);
  CREATE TABLE IF NOT EXISTS cash_remittances (
    id TEXT PRIMARY KEY,
    rider_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    note TEXT NOT NULL DEFAULT '',
    recorded_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS admin_audit (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );
`);
if (!db.prepare("PRAGMA table_info(orders)").all().some((column) => column.name === "rider_user_id")) {
  db.exec("ALTER TABLE orders ADD COLUMN rider_user_id TEXT REFERENCES users(id) ON DELETE SET NULL");
}
db.exec("CREATE INDEX IF NOT EXISTS orders_rider_user_idx ON orders(rider_user_id)");
if (!db.prepare("PRAGMA table_info(order_messages)").all().some((column) => column.name === "sender_role")) {
  db.exec("ALTER TABLE order_messages ADD COLUMN sender_role TEXT NOT NULL DEFAULT 'customer'");
  db.exec(`
    UPDATE order_messages
    SET sender_role = 'rider'
    WHERE sender_user_id IN (
      SELECT rider_user_id FROM orders
      WHERE orders.id = order_messages.order_id AND rider_user_id IS NOT NULL
    )
  `);
}
const phoneOtpColumns = new Set(db.prepare("PRAGMA table_info(phone_otps)").all().map((column) => column.name));
const phoneOtpSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'phone_otps'").get()?.sql || "";
if (!phoneOtpColumns.has("password_hash") || !phoneOtpSchema.includes("password_reset")) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE phone_otps_updated (
        phone TEXT PRIMARY KEY,
        challenge_id TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'login', 'password_reset')),
        name TEXT,
        password_hash TEXT,
        code_salt TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        sent_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      INSERT INTO phone_otps_updated
        (phone, challenge_id, purpose, name, code_salt, code_hash, attempts, sent_at, expires_at)
      SELECT phone, challenge_id, purpose, name, code_salt, code_hash, attempts, sent_at, expires_at
      FROM phone_otps;
      DROP TABLE phone_otps;
      ALTER TABLE phone_otps_updated RENAME TO phone_otps;
    `);
  })();
}
if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "password_hash")) {
  db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
}
if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "terms_accepted_at")) {
  db.exec("ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER");
}
if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'");
}
if (!db.prepare("PRAGMA table_info(users)").all().some((column) => column.name === "account_status")) {
  db.exec("ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active'");
}
if (!db.prepare("PRAGMA table_info(rider_profiles)").all().some((column) => column.name === "approval_status")) {
  db.exec("ALTER TABLE rider_profiles ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'pending'");
}
if (!db.prepare("PRAGMA table_info(rider_profiles)").all().some((column) => column.name === "vehicle_type")) {
  db.exec("ALTER TABLE rider_profiles ADD COLUMN vehicle_type TEXT NOT NULL DEFAULT 'Motorbike'");
}
if (!db.prepare("PRAGMA table_info(rider_profiles)").all().some((column) => column.name === "operating_area")) {
  db.exec("ALTER TABLE rider_profiles ADD COLUMN operating_area TEXT NOT NULL DEFAULT ''");
}
db.exec("UPDATE users SET role = 'rider' WHERE role = 'customer' AND id IN (SELECT user_id FROM rider_profiles)");
db.prepare(`
  INSERT OR IGNORE INTO pricing_config (id, base_fare, per_km, minimum_fare, round_to)
  VALUES (1, 900, 150, 300, 50)
`).run();
db.prepare(`
  INSERT OR IGNORE INTO promos (code, label, kind, value, active)
  VALUES ('XRIDER10', '10% off', 'percent', 10, 1), ('FIRST500', '₦500 off', 'fixed', 500, 1)
`).run();
db.prepare("INSERT OR IGNORE INTO commission_config (id, rate_percent) VALUES (1, 20)").run();
const lagosDate = (timestamp) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const seedCommission = db.prepare(`
  INSERT OR IGNORE INTO rider_commissions
    (order_id, rider_user_id, service_date, fare_amount, rate_percent, commission_amount, delivered_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const initialCommissionRate = db.prepare("SELECT rate_percent FROM commission_config WHERE id = 1").get().rate_percent;
db.transaction(() => {
  const deliveredOrders = db.prepare(`
    SELECT id, rider_user_id, created_at, data FROM orders
    WHERE rider_user_id IS NOT NULL AND json_extract(data, '$.status') = 'Delivered'
  `).all();
  for (const row of deliveredOrders) {
    const order = JSON.parse(row.data);
    const deliveredAt = Number.isSafeInteger(order.endAt) ? order.endAt : row.created_at;
    const fareAmount = Number.isSafeInteger(order.price) ? order.price : 0;
    seedCommission.run(
      row.id,
      row.rider_user_id,
      lagosDate(deliveredAt),
      fareAmount,
      initialCommissionRate,
      Math.round(fareAmount * initialCommissionRate / 100),
      deliveredAt,
    );
  }
})();
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
const activeStatuses = new Set(["Searching", "Rider assigned", "At pickup", "Picked up", "Out for delivery"]);
function overdueCommissionForRider(riderId, today = lagosDate(Date.now())) {
  return db.prepare(`
    SELECT COALESCE(SUM(daily.commission_amount), 0) AS amount, COUNT(*) AS days
    FROM (
      SELECT commissions.service_date, SUM(commissions.commission_amount) AS commission_amount
      FROM rider_commissions commissions
      LEFT JOIN rider_commission_settlements settlements
        ON settlements.rider_user_id = commissions.rider_user_id
        AND settlements.service_date = commissions.service_date
      WHERE commissions.rider_user_id = ? AND commissions.service_date < ? AND settlements.id IS NULL
      GROUP BY commissions.service_date
      HAVING SUM(commissions.commission_amount) > 0
    ) daily
  `).get(riderId, today);
}

function enforceCommissionOnlineBlock(riderId) {
  const overdue = overdueCommissionForRider(riderId);
  if (overdue.days > 0) {
    db.prepare("UPDATE rider_profiles SET is_online = 0 WHERE user_id = ?").run(riderId);
  }
  return overdue;
}
const cookieName = "xr_dev_session";
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const maxPasswordBytes = 128;
const loginAttemptWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 10;
const loginLockMs = 15 * 60 * 1000;
const otpLifetimeMs = 5 * 60 * 1000;
const otpResendCooldownMs = 60 * 1000;
const otpMaxAttempts = 5;
db.prepare("INSERT OR IGNORE INTO app_secrets (name, value) VALUES ('rate_limit_hmac_key', ?)").run(
  crypto.randomBytes(32).toString("hex"),
);
const rateLimitHashKey = Buffer.from(
  db.prepare("SELECT value FROM app_secrets WHERE name = 'rate_limit_hmac_key'").get().value,
  "hex",
);
const dummySalt = crypto.randomBytes(16);
const dummyPasswordHash = `scrypt$${dummySalt.toString("base64url")}$${crypto.scryptSync("invalid-password", dummySalt, 64).toString("base64url")}`;

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

function sendError(res, status, error) {
  return res.status(status).json({ error });
}

function enforceRateLimit(res, scope, identifier, limit, windowMs, now = Date.now()) {
  const windowStartedAt = Math.floor(now / windowMs) * windowMs;
  const identifierHash = crypto.createHmac("sha256", rateLimitHashKey).update(String(identifier)).digest("hex");
  db.prepare("DELETE FROM api_rate_limits WHERE window_started_at <= ?").run(now - 24 * 60 * 60 * 1000);
  db.prepare(`
    INSERT INTO api_rate_limits (scope, identifier_hash, window_started_at, count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(scope, identifier_hash, window_started_at) DO UPDATE SET count = count + 1
  `).run(scope, identifierHash, windowStartedAt);
  const current = db.prepare(`
    SELECT count FROM api_rate_limits
    WHERE scope = ? AND identifier_hash = ? AND window_started_at = ?
  `).get(scope, identifierHash, windowStartedAt);

  if (current.count <= limit) return false;

  const retryAfter = Math.max(1, Math.ceil((windowStartedAt + windowMs - now) / 1000));
  res.set("Retry-After", String(retryAfter));
  sendError(res, 429, `Too many requests. Try again in ${retryAfter} seconds.`);
  return true;
}

function limitByIp(scope, limit, windowMs) {
  return (req, res, next) => {
    if (!enforceRateLimit(res, scope, req.ip, limit, windowMs)) next();
  };
}

function limitByUser(scope, limit, windowMs) {
  return (req, res, next) => {
    if (!enforceRateLimit(res, scope, req.user.id, limit, windowMs)) next();
  };
}

function normalizedAdminPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

function bootstrapAdminRole(user) {
  const configured = normalizedAdminPhone(process.env.ADMIN_PHONE);
  if (configured && configured === user.phone && user.role !== "admin") {
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(user.id);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
  }
  return user;
}

function writeAudit(actorId, action, entityType, entityId, details = {}) {
  db.prepare(`
    INSERT INTO admin_audit (id, actor_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(details), Date.now());
}

function getBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : null;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function stringField(value, { min = 0, max = 200 } = {}) {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

async function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [algorithm, encodedSalt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !encodedSalt || !encodedHash) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedHash, "base64url");
  if (expected.length !== 64) return false;
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function issueSession(user, res) {
  user = bootstrapAdminRole(user);
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    crypto.createHash("sha256").update(token).digest("hex"),
    user.id,
    Date.now() + sessionLifetimeMs,
  );
  setSessionCookie(res, token);
  return res.json(toUser(user));
}

function recordFailedLogin(phone, now) {
  const existing = db.prepare("SELECT * FROM auth_attempts WHERE phone = ?").get(phone);
  const withinWindow = existing && now - existing.window_started_at < loginAttemptWindowMs;
  const attempts = withinWindow ? existing.attempts + 1 : 1;
  const windowStartedAt = withinWindow ? existing.window_started_at : now;
  const lockedUntil = attempts >= maxLoginAttempts ? now + loginLockMs : 0;
  db.prepare(`
    INSERT INTO auth_attempts (phone, attempts, window_started_at, locked_until)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      attempts = excluded.attempts,
      window_started_at = excluded.window_started_at,
      locked_until = excluded.locked_until
  `).run(phone, attempts, windowStartedAt, lockedUntil);
}

function quoteFor(km, promo) {
  const pricing = db.prepare("SELECT base_fare AS base, per_km AS perKm, minimum_fare AS minimum, round_to AS roundTo FROM pricing_config WHERE id = 1").get();
  const base = pricing.base;
  const distance = Math.round(km * pricing.perKm);
  const subtotal = base + km * pricing.perKm;
  const promotion = promo ? db.prepare(`
    SELECT kind, value FROM promos
    WHERE code = ? AND active = 1
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
  `).get(promo, Date.now(), Date.now()) : undefined;
  const discount = promotion
    ? (promotion.kind === "percent" ? (subtotal * promotion.value) / 100 : promotion.value)
    : 0;
  return {
    km,
    base,
    perKm: pricing.perKm,
    distance,
    discount: Math.round(discount),
    total: Math.max(pricing.minimum, Math.round((subtotal - discount) / pricing.roundTo) * pricing.roundTo),
  };
}

async function calculateDrivingRoute(fromLocation, toLocation) {
  const apiKey = process.env.GEOAPIFY_API_KEY || process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
  if (!apiKey) {
    const error = new Error("Set GEOAPIFY_API_KEY in .env.local to calculate delivery routes.");
    error.status = 503;
    throw error;
  }

  const url = new URL("https://api.geoapify.com/v1/routing");
  url.searchParams.set("waypoints", `${fromLocation.lat},${fromLocation.lng}|${toLocation.lat},${toLocation.lng}`);
  url.searchParams.set("mode", "drive");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", apiKey);

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  let response;
  try {
    response = await fetch(url, {
      headers: { Referer: new URL(appUrl).origin },
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    const routeError = new Error(error.name === "TimeoutError"
      ? "Route calculation timed out. Try again."
      : "Could not contact the route service. Try again.");
    routeError.status = 502;
    throw routeError;
  }

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const routeError = new Error(typeof result?.message === "string"
      ? result.message
      : `Route service request failed (${response.status}).`);
    routeError.status = 502;
    throw routeError;
  }

  const route = result?.features?.[0];
  const distanceMeters = route?.properties?.distance;
  const durationSeconds = route?.properties?.time;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0 ||
      !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    const routeError = new Error("No driving route was found between these points.");
    routeError.status = 422;
    throw routeError;
  }

  return { km: distanceMeters / 1000, durationSeconds: Math.ceil(durationSeconds) };
}

function setSessionCookie(res, token) {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: sessionLifetimeMs,
  });
}

function requireUser(req, res, next) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim().split(/=(.*)/s).slice(0, 2))
      .filter(([key, value]) => key && value !== undefined),
  );
  const token = cookies[cookieName];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return sendError(res, 401, "Please log in to continue.");
  }

  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const session = db.prepare(`
    SELECT users.id, users.phone, users.name, users.email, users.profile, users.role, users.account_status
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash, Date.now());
  if (!session) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", path: "/" });
    return sendError(res, 401, "Your local session has expired. Please log in again.");
  }

  if (session.account_status !== "active") {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
    res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", path: "/" });
    return sendError(res, 403, "This account is suspended. Contact X-RIDER support.");
  }

  if (session.role === "customer" && db.prepare(`
    SELECT 1 FROM rider_profiles WHERE user_id = ? AND approval_status = 'approved'
  `).get(session.id)) {
    db.prepare("UPDATE users SET role = 'rider' WHERE id = ? AND role = 'customer'").run(session.id);
    session.role = "rider";
  }
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return sendError(res, 403, "Administrator access is required.");
  next();
}

function requireRider(req, res, next) {
  const profile = db.prepare(`
    SELECT approval_status FROM rider_profiles WHERE user_id = ?
  `).get(req.user.id);
  if (req.user.role !== "rider" || profile?.approval_status !== "approved") {
    return sendError(res, 403, "Your rider account must be approved before using rider operations.");
  }
  next();
}

const riderApplicationUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, riderDocumentsDirectory),
    filename: (_req, _file, callback) => callback(null, crypto.randomUUID()),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 3, fieldSize: 256 },
  fileFilter: (_req, file, callback) => {
    const acceptedTypes = file.fieldname === "identityDocument"
      ? ["image/jpeg", "image/png", "image/webp", "application/pdf"]
      : ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(file.mimetype)) {
      callback(new Error(`Choose a supported ${file.fieldname === "identityDocument" ? "image or PDF" : "image"} file.`));
      return;
    }
    callback(null, true);
  },
});

function removeRiderApplicationFiles(files) {
  for (const file of Object.values(files || {}).flat()) {
    try { fs.rmSync(file.path, { force: true }); }
    catch (error) { console.error("Could not remove an incomplete rider upload:", error); }
  }
}

function detectRiderDocumentType(filePath) {
  const descriptor = fs.openSync(filePath, "r");
  const header = Buffer.alloc(12);
  try { fs.readSync(descriptor, header, 0, header.length, 0); }
  finally { fs.closeSync(descriptor); }
  if (header.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function toUser(row) {
  const profile = JSON.parse(row.profile);
  return {
    ...profile,
    phone: row.phone,
    name: row.name,
    role: row.role || "customer",
    accountStatus: row.account_status || "active",
    ...(row.email ? { email: row.email } : {}),
  };
}

function toOrder(row) {
  return { ...JSON.parse(row.data), id: row.id, createdAt: row.created_at };
}

function toOrderForParticipant(row, userId) {
  const contact = userId === row.user_id && row.rider_user_id
    ? db.prepare("SELECT name, phone FROM users WHERE id = ?").get(row.rider_user_id)
    : userId === row.rider_user_id && row.rider_user_id
      ? db.prepare("SELECT name, phone FROM users WHERE id = ?").get(row.user_id)
      : null;
  return { ...toOrder(row), contact: contact ? { name: contact.name, phone: contact.phone } : null };
}

function getOrderChat(row, userId) {
  if (userId !== row.user_id && userId !== row.rider_user_id) {
    return { error: "You are not a participant in this delivery.", status: 403 };
  }
  if (!row.rider_user_id || !["Rider assigned", "At pickup", "Picked up", "Out for delivery"].includes(JSON.parse(row.data).status)) {
    return { error: "Chat is available while a rider is handling the delivery.", status: 409 };
  }
  return { order: row };
}

function validNigerianPhone(phone) {
  return typeof phone === "string" && /^\+234[789]\d{9}$/.test(phone);
}

function hashOtp(code, salt) {
  return crypto.scryptSync(code, salt, 64).toString("base64url");
}

function matchesOtp(challenge, code) {
  const salt = Buffer.from(challenge.code_salt, "base64url");
  const expected = Buffer.from(challenge.code_hash, "base64url");
  const actual = Buffer.from(hashOtp(code, salt), "base64url");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post(
  "/api/auth/otp/request",
  limitByIp("otp-request-ip-hour", 20, 60 * 60 * 1000),
  asyncRoute(async (req, res) => {
    const body = getBody(req);
    if (
      !body ||
      !validNigerianPhone(body.phone) ||
      !["signup", "login", "password_reset"].includes(body.purpose) ||
      (body.purpose === "signup" && (
        !stringField(body.name, { min: 2, max: 100 }) ||
        typeof body.password !== "string" ||
        body.password.length < 8 ||
        Buffer.byteLength(body.password, "utf8") > maxPasswordBytes ||
        body.termsAccepted !== true
      ))
    ) {
      return sendError(res, 400, "Enter a valid Nigerian mobile number and the required account details.");
    }

    if (
      enforceRateLimit(res, "otp-request-phone-hour", body.phone, 5, 60 * 60 * 1000) ||
      enforceRateLimit(res, "otp-request-phone-day", body.phone, 10, 24 * 60 * 60 * 1000)
    ) return;

    if (body.purpose === "signup" && db.prepare("SELECT 1 FROM users WHERE phone = ?").get(body.phone)) {
      return sendError(res, 409, "An account already exists for this phone number. Log in or reset your password.");
    }

    const now = Date.now();
    const previous = db.prepare("SELECT sent_at FROM phone_otps WHERE phone = ?").get(body.phone);
    if (previous && now - previous.sent_at < otpResendCooldownMs) {
      const retryAfter = Math.ceil((otpResendCooldownMs - (now - previous.sent_at)) / 1000);
      res.set("Retry-After", String(retryAfter));
      return sendError(res, 429, `Please wait ${retryAfter} seconds before requesting another code.`);
    }

    const passwordHash = body.purpose === "signup" ? await hashPassword(body.password) : null;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const salt = crypto.randomBytes(16);
    const challengeId = crypto.randomUUID();
    db.prepare(`
    INSERT INTO phone_otps (phone, challenge_id, purpose, name, password_hash, code_salt, code_hash, attempts, sent_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      challenge_id = excluded.challenge_id,
      purpose = excluded.purpose,
      name = excluded.name,
      password_hash = excluded.password_hash,
      code_salt = excluded.code_salt,
      code_hash = excluded.code_hash,
      attempts = 0,
      sent_at = excluded.sent_at,
      expires_at = excluded.expires_at
    `).run(
      body.phone,
      challengeId,
      body.purpose,
      body.purpose === "signup" ? body.name.trim() : null,
      passwordHash,
      salt.toString("base64url"),
      hashOtp(code, salt),
      now,
      now + otpLifetimeMs,
    );

    // The SMS provider is not configured yet; expose a code only in this local development API.
    return res.json({
      challengeId,
      expiresInSeconds: otpLifetimeMs / 1000,
      devCode: code,
    });
  }),
);

app.post("/api/auth/otp/verify", limitByIp("otp-verify-ip-hour", 60, 60 * 60 * 1000), (req, res) => {
  const body = getBody(req);
  if (
    !body ||
    !validNigerianPhone(body.phone) ||
    !stringField(body.challengeId, { min: 36, max: 36 }) ||
    typeof body.code !== "string" ||
    !/^\d{6}$/.test(body.code)
  ) {
    return sendError(res, 400, "Enter the six-digit verification code.");
  }

  const challenge = db.prepare("SELECT * FROM phone_otps WHERE phone = ? AND challenge_id = ?")
    .get(body.phone, body.challengeId);
  if (challenge?.purpose === "password_reset") {
    return sendError(res, 400, "Use the password reset form to complete this verification.");
  }
  if (!challenge) return sendError(res, 400, "This verification code is no longer valid. Request a new one.");
  if (challenge.expires_at <= Date.now()) return sendError(res, 400, "This verification code has expired. Request a new one.");
  if (challenge.attempts >= otpMaxAttempts) return sendError(res, 429, "Too many incorrect codes. Request a new one to try again.");

  if (!matchesOtp(challenge, body.code)) {
    const attempts = challenge.attempts + 1;
    db.prepare("UPDATE phone_otps SET attempts = ? WHERE phone = ? AND challenge_id = ?")
      .run(attempts, body.phone, body.challengeId);
    return sendError(
      res,
      attempts >= otpMaxAttempts ? 429 : 400,
      attempts >= otpMaxAttempts ? "Too many incorrect codes. Request a new one to try again." : "That code is incorrect. Check it and try again.",
    );
  }

  let user = db.prepare("SELECT * FROM users WHERE phone = ?").get(body.phone);
  if (challenge.purpose === "signup") {
    if (!challenge.password_hash) return sendError(res, 400, "This signup code is outdated. Request a new code.");
    if (user) return sendError(res, 409, "An account already exists for this number. Log in instead.");
    const id = crypto.randomUUID();
    try {
      db.prepare("INSERT INTO users (id, phone, name, password_hash, terms_accepted_at) VALUES (?, ?, ?, ?, ?)").run(
        id,
        body.phone,
        challenge.name,
        challenge.password_hash,
        Date.now(),
      );
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return sendError(res, 409, "An account already exists for this number. Log in instead.");
      }
      throw error;
    }
    user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  } else if (!user) {
    return sendError(res, 404, "No account was found for this number. Create an account first.");
  }

  db.prepare("DELETE FROM phone_otps WHERE phone = ? AND challenge_id = ?").run(body.phone, body.challengeId);
  return issueSession(user, res);
});

function activePromo(code) {
  return db.prepare(`
    SELECT code FROM promos
    WHERE code = ? AND active = 1
      AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
  `).get(code, Date.now(), Date.now());
}

app.post(
  "/api/auth/password/reset",
  limitByIp("otp-verify-ip-hour", 60, 60 * 60 * 1000),
  asyncRoute(async (req, res) => {
    const body = getBody(req);
    if (
      !body ||
      !validNigerianPhone(body.phone) ||
      !stringField(body.challengeId, { min: 36, max: 36 }) ||
      typeof body.code !== "string" ||
      !/^\d{6}$/.test(body.code) ||
      typeof body.password !== "string" ||
      body.password.length < 8 ||
      Buffer.byteLength(body.password, "utf8") > maxPasswordBytes
    ) {
      return sendError(res, 400, "Enter the valid verification code and a password of at least 8 characters (maximum 128 bytes).");
    }

    const challenge = db.prepare("SELECT * FROM phone_otps WHERE phone = ? AND challenge_id = ?")
      .get(body.phone, body.challengeId);
    if (!challenge || challenge.purpose !== "password_reset") {
      return sendError(res, 400, "This password reset code is no longer valid. Request a new one.");
    }
    if (challenge.expires_at <= Date.now()) return sendError(res, 400, "This verification code has expired. Request a new one.");
    if (challenge.attempts >= otpMaxAttempts) return sendError(res, 429, "Too many incorrect codes. Request a new one to try again.");
    if (!matchesOtp(challenge, body.code)) {
      const attempts = challenge.attempts + 1;
      db.prepare("UPDATE phone_otps SET attempts = ? WHERE phone = ? AND challenge_id = ?")
        .run(attempts, body.phone, body.challengeId);
      return sendError(
        res,
        attempts >= otpMaxAttempts ? 429 : 400,
        attempts >= otpMaxAttempts ? "Too many incorrect codes. Request a new one to try again." : "That code is incorrect. Check it and try again.",
      );
    }

    const passwordHash = await hashPassword(body.password);
    const resetPassword = db.transaction(() => {
      const currentChallenge = db.prepare("SELECT * FROM phone_otps WHERE phone = ? AND challenge_id = ?")
        .get(body.phone, body.challengeId);
      if (
        !currentChallenge ||
        currentChallenge.purpose !== "password_reset" ||
        currentChallenge.expires_at <= Date.now() ||
        currentChallenge.attempts >= otpMaxAttempts ||
        !matchesOtp(currentChallenge, body.code)
      ) {
        return false;
      }

      const user = db.prepare("SELECT id FROM users WHERE phone = ?").get(body.phone);
      if (user) {
        db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, user.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
        db.prepare("DELETE FROM auth_attempts WHERE phone = ?").run(body.phone);
      }
      db.prepare("DELETE FROM phone_otps WHERE phone = ? AND challenge_id = ?").run(body.phone, body.challengeId);
      return true;
    });

    if (!resetPassword()) {
      return sendError(res, 400, "This password reset code is no longer valid. Request a new one.");
    }

    res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", path: "/" });
    return res.json({ ok: true });
  }),
);

app.post("/api/auth/dev/login", limitByIp("password-login-ip-hour", 60, 60 * 60 * 1000), asyncRoute(async (req, res) => {
  const body = getBody(req);
  if (
    !body ||
    !stringField(body.phone, { min: 14, max: 14 }) ||
    !/^\+234[789]\d{9}$/.test(body.phone) ||
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    Buffer.byteLength(body.password, "utf8") > maxPasswordBytes
  ) {
    return sendError(res, 400, "Enter a valid Nigerian mobile number and password.");
  }

  const now = Date.now();
  const attempts = db.prepare("SELECT * FROM auth_attempts WHERE phone = ?").get(body.phone);
  if (attempts?.locked_until > now) {
    const retryAfter = Math.ceil((attempts.locked_until - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return sendError(res, 429, `Too many failed attempts. Try again in ${retryAfter} seconds.`);
  }

  const user = db.prepare("SELECT * FROM users WHERE phone = ?").get(body.phone);
  const passwordMatches = await verifyPassword(body.password, user?.password_hash || dummyPasswordHash);
  if (!user || !passwordMatches) {
    recordFailedLogin(body.phone, now);
    return sendError(res, 401, "Phone number or password is incorrect.");
  }

  db.prepare("DELETE FROM auth_attempts WHERE phone = ?").run(body.phone);
  return issueSession(user, res);
}));

app.delete("/api/auth/session", requireUser, (req, res) => {
  const header = req.headers.cookie || "";
  const rawToken = header.match(/(?:^|;\s*)xr_dev_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    db.prepare("DELETE FROM sessions WHERE token_hash = ? AND user_id = ?").run(tokenHash, req.user.id);
  }
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", path: "/" });
  return res.json({ ok: true });
});

app.get("/api/me", requireUser, (req, res) => {
  res.json(toUser(req.user));
});

app.patch("/api/me", requireUser, (req, res) => {
  const body = getBody(req);
  if (!body || Object.keys(body).length === 0) return sendError(res, 400, "Provide account fields to update.");
  if (body.name !== undefined && !stringField(body.name, { min: 2, max: 100 })) {
    return sendError(res, 400, "Name must be between 2 and 100 characters.");
  }
  if (body.email !== undefined && body.email !== "" && (!stringField(body.email, { max: 254 }) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))) {
    return sendError(res, 400, "Enter a valid email address.");
  }
  if (body.home !== undefined && !stringField(body.home, { max: 200 })) return sendError(res, 400, "Home address is too long.");
  if (body.work !== undefined && !stringField(body.work, { max: 200 })) return sendError(res, 400, "Work address is too long.");
  if (body.nf !== undefined && (
    typeof body.nf !== "object" || body.nf === null || Array.isArray(body.nf) ||
    Object.entries(body.nf).some(([key, value]) => !["o", "c", "p"].includes(key) || typeof value !== "boolean")
  )) return sendError(res, 400, "Notification preferences are invalid.");
  const allowed = new Set(["name", "email", "home", "work", "nf"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return sendError(res, 400, "One or more account fields cannot be changed.");

  const profile = JSON.parse(req.user.profile);
  for (const key of ["home", "work", "nf"]) {
    if (body[key] !== undefined) profile[key] = body[key];
  }
  const name = body.name === undefined ? req.user.name : body.name.trim();
  const email = body.email === undefined ? req.user.email : body.email.trim() || null;
  db.prepare("UPDATE users SET name = ?, email = ?, profile = ? WHERE id = ?").run(
    name,
    email,
    JSON.stringify(profile),
    req.user.id,
  );
  res.json(toUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id)));
});

app.delete("/api/me", requireUser, (req, res) => {
  if (req.user.role === "admin") {
    return sendError(res, 409, "Remove administrator access before deleting this account.");
  }
  const documents = db.prepare(`
    SELECT stored_name FROM rider_application_documents WHERE user_id = ?
  `).all(req.user.id);
  db.prepare("DELETE FROM users WHERE id = ?").run(req.user.id);
  for (const document of documents) {
    try { fs.rmSync(path.join(riderDocumentsDirectory, document.stored_name), { force: true }); }
    catch (error) { console.error("Could not remove deleted rider application document:", error); }
  }
  res.clearCookie(cookieName, { httpOnly: true, sameSite: "lax", path: "/" });
  res.json({ ok: true });
});

app.get("/api/pricing", requireUser, (_req, res) => {
  const settings = db.prepare(`
    SELECT base_fare AS base, per_km AS perKm, minimum_fare AS minimum, round_to AS roundTo
    FROM pricing_config WHERE id = 1
  `).get();
  const activePromos = db.prepare(`
    SELECT code, label, kind, value FROM promos
    WHERE active = 1 AND (starts_at IS NULL OR starts_at <= ?)
      AND (ends_at IS NULL OR ends_at > ?)
      AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
  `).all(Date.now(), Date.now());
  return res.json({ ...settings, promos: activePromos });
});

app.post("/api/support", requireUser, limitByUser("support-create-user-hour", 3, 60 * 60 * 1000), (req, res) => {
  const body = getBody(req);
  if (!body || !stringField(body.subject, { min: 3, max: 160 }) || !stringField(body.message, { min: 5, max: 3000 })) {
    return sendError(res, 400, "Enter a subject and a message (5–3000 characters).");
  }
  let orderId = null;
  if (body.orderId !== undefined) {
    const order = db.prepare("SELECT id FROM orders WHERE id = ? AND user_id = ?").get(body.orderId, req.user.id);
    if (!order) return sendError(res, 404, "Related order not found.");
    orderId = order.id;
  }
  const id = `SUP${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const now = Date.now();
  db.prepare(`
    INSERT INTO support_tickets (id, user_id, order_id, subject, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.user.id, orderId, body.subject.trim(), body.message.trim(), now, now);
  return res.status(201).json({ id, status: "open", createdAt: now });
});

app.get("/api/support", requireUser, (req, res) => {
  const tickets = db.prepare(`
    SELECT id, order_id AS orderId, subject, message, status, resolution,
      created_at AS createdAt, updated_at AS updatedAt
    FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  return res.json(tickets);
});

function adminOrderRows() {
  return db.prepare(`
    SELECT orders.id, orders.created_at, orders.data, orders.user_id, orders.rider_user_id,
      customer.name AS customer_name, customer.phone AS customer_phone,
      rider.name AS rider_name, rider.phone AS rider_phone
    FROM orders
    JOIN users customer ON customer.id = orders.user_id
    LEFT JOIN users rider ON rider.id = orders.rider_user_id
    ORDER BY orders.created_at DESC
  `).all().map((row) => ({
    ...toOrder(row),
    customer: { id: row.user_id, name: row.customer_name, phone: row.customer_phone },
    riderAccount: row.rider_user_id ? { id: row.rider_user_id, name: row.rider_name, phone: row.rider_phone } : null,
  }));
}

app.get("/api/admin/overview", requireUser, requireAdmin, (_req, res) => {
  const orders = adminOrderRows();
  const statuses = orders.reduce((counts, order) => {
    counts[order.status] = (counts[order.status] || 0) + 1;
    return counts;
  }, {});
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = orders.filter((order) => order.createdAt >= todayStart.getTime());
  const cashDue = db.prepare(`
    SELECT COALESCE(SUM(CAST(json_extract(data, '$.price') AS INTEGER)), 0) AS amount
    FROM orders WHERE rider_user_id IS NOT NULL AND json_extract(data, '$.status') = 'Delivered'
  `).get().amount - db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_remittances").get().amount;
  const todayCommission = db.prepare(`
    SELECT COALESCE(SUM(commission_amount), 0) AS amount
    FROM rider_commissions WHERE service_date = ?
  `).get(lagosDate(Date.now())).amount;
  const onlineRiderIds = db.prepare(`
    SELECT user_id FROM rider_profiles
    WHERE is_online = 1 AND approval_status = 'approved'
  `).all().filter((rider) => {
    const overdue = enforceCommissionOnlineBlock(rider.user_id);
    return overdue.days === 0;
  });
  const outstandingCommission = db.prepare(`
    SELECT COALESCE(SUM(commissions.commission_amount), 0) AS amount
    FROM rider_commissions commissions
    LEFT JOIN rider_commission_settlements settlements
      ON settlements.rider_user_id = commissions.rider_user_id
      AND settlements.service_date = commissions.service_date
    WHERE settlements.id IS NULL
  `).get().amount;
  return res.json({
    users: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role != 'admin'").get().count,
    riders: db.prepare("SELECT COUNT(*) AS count FROM rider_profiles").get().count,
    pendingRiders: db.prepare("SELECT COUNT(*) AS count FROM rider_profiles WHERE approval_status = 'pending'").get().count,
    onlineRiders: onlineRiderIds.length,
    orders: orders.length,
    activeOrders: orders.filter((order) => activeStatuses.has(order.status)).length,
    todayOrders: todayOrders.length,
    todayGross: todayOrders.filter((order) => order.status === "Delivered").reduce((sum, order) => sum + order.price, 0),
    openSupport: db.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status IN ('open', 'in_progress')").get().count,
    outstandingCash: Math.max(0, cashDue),
    todayCommission,
    outstandingCommission,
    statuses,
  });
});

app.get("/api/admin/orders", requireUser, requireAdmin, (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const orders = adminOrderRows().filter((order) =>
    (!status || order.status === status) &&
    (!search || [order.id, order.from, order.to, order.customer.name, order.customer.phone, order.riderAccount?.name, order.riderAccount?.phone]
      .some((value) => String(value || "").toLowerCase().includes(search))),
  );
  return res.json(orders.slice(0, 500));
});

app.patch("/api/admin/orders/:id", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  const allowed = new Set(["Searching", "Cancelled"]);
  if (!body || Object.keys(body).some((key) => !["status", "riderUserId", "reason"].includes(key))) {
    return sendError(res, 400, "Provide a supported order operation.");
  }
  const row = db.prepare("SELECT id, created_at, data, rider_user_id FROM orders WHERE id = ?").get(req.params.id);
  if (!row) return sendError(res, 404, "Order not found.");
  const order = JSON.parse(row.data);
  if (body.status !== undefined) {
    if (!allowed.has(body.status)) return sendError(res, 400, "Admin can reopen a delivery or cancel it.");
    if (body.status === "Cancelled") {
      if (!activeStatuses.has(order.status) && order.status !== "Scheduled") return sendError(res, 409, "This order can no longer be cancelled.");
      order.status = "Cancelled";
      order.reason = stringField(body.reason, { max: 200 }) ? body.reason.trim() : "Cancelled by support";
      order.endAt = Date.now();
    } else {
      if (!["Scheduled", "Cancelled"].includes(order.status)) return sendError(res, 409, "Only scheduled or cancelled orders can be reopened.");
      order.status = "Searching";
      riderUserId = null;
      delete order.rider;
      delete order.reason;
      delete order.endAt;
    }
  }
  let riderUserId = row.rider_user_id;
  if (body.riderUserId !== undefined) {
    if (body.riderUserId === null) {
      if (["At pickup", "Picked up", "Out for delivery", "Delivered"].includes(order.status)) {
        return sendError(res, 409, "An active trip after pickup cannot be unassigned.");
      }
      riderUserId = null;
      order.status = "Searching";
      delete order.rider;
    } else {
      const overdue = enforceCommissionOnlineBlock(body.riderUserId);
      if (overdue.days > 0) return sendError(res, 409, "This rider has overdue commission and cannot receive new deliveries until it is settled.");
      const rider = db.prepare(`
        SELECT users.id, users.name, rider_profiles.plate FROM users
        JOIN rider_profiles ON rider_profiles.user_id = users.id
        WHERE users.id = ? AND users.role = 'rider' AND users.account_status = 'active'
          AND rider_profiles.approval_status = 'approved' AND rider_profiles.is_online = 1
      `).get(body.riderUserId);
      if (!rider) return sendError(res, 400, "Choose an approved, active rider.");
      if (!["Searching", "Scheduled", "Cancelled", "Rider assigned"].includes(order.status)) {
        return sendError(res, 409, "This delivery has already been picked up.");
      }
      riderUserId = rider.id;
      order.status = "Rider assigned";
      order.rider = { name: rider.name, rating: "New", plate: rider.plate };
    }
  }
  db.prepare("UPDATE orders SET rider_user_id = ?, data = ? WHERE id = ?").run(riderUserId, JSON.stringify(order), row.id);
  writeAudit(req.user.id, "order.updated", "order", row.id, { status: order.status, riderUserId });
  return res.json({ ...order, id: row.id, createdAt: row.created_at });
});

app.get("/api/admin/riders", requireUser, requireAdmin, (_req, res) => {
  const riders = db.prepare(`
    SELECT users.id, users.name, users.phone, users.account_status AS accountStatus,
      rider_profiles.plate, rider_profiles.vehicle_type AS vehicleType,
      rider_profiles.operating_area AS operatingArea, rider_profiles.is_online AS online,
      rider_profiles.approval_status AS approvalStatus
    FROM rider_profiles JOIN users ON users.id = rider_profiles.user_id
    ORDER BY CASE rider_profiles.approval_status WHEN 'pending' THEN 0 ELSE 1 END, users.name
  `).all();
  const documentsByRider = new Map();
  for (const document of db.prepare(`
    SELECT user_id, doc_type FROM rider_application_documents
  `).all()) {
    const documents = documentsByRider.get(document.user_id) || new Set();
    documents.add(document.doc_type);
    documentsByRider.set(document.user_id, documents);
  }
  const orders = adminOrderRows();
  const remittances = db.prepare("SELECT rider_user_id, SUM(amount) AS total FROM cash_remittances GROUP BY rider_user_id").all();
  const paidByRider = new Map(remittances.map((item) => [item.rider_user_id, item.total]));
  return res.json(riders.map((rider) => {
    const delivered = orders.filter((order) => order.riderAccount?.id === rider.id && order.status === "Delivered");
    const gross = delivered.reduce((sum, order) => sum + order.price, 0);
    const commissionDue = enforceCommissionOnlineBlock(rider.id);
    return {
      ...rider,
      documents: {
        identityDocument: documentsByRider.get(rider.id)?.has("identityDocument") || false,
        vehiclePhoto: documentsByRider.get(rider.id)?.has("vehiclePhoto") || false,
        profilePhoto: documentsByRider.get(rider.id)?.has("profilePhoto") || false,
      },
      online: Boolean(rider.online) && commissionDue.days === 0,
      deliveredCount: delivered.length,
      cashDue: Math.max(0, gross - (paidByRider.get(rider.id) || 0)),
      commissionDue: commissionDue.amount,
      commissionOverdue: commissionDue.days > 0,
      activeCount: orders.filter((order) => order.riderAccount?.id === rider.id && activeStatuses.has(order.status)).length,
    };
  }));
});

app.get("/api/admin/riders/:id/documents/:docType", requireUser, requireAdmin, (req, res) => {
  if (!["identityDocument", "vehiclePhoto", "profilePhoto"].includes(req.params.docType)) {
    return sendError(res, 404, "Rider application document not found.");
  }
  const document = db.prepare(`
    SELECT doc_type, stored_name, mime_type FROM rider_application_documents
    WHERE user_id = ? AND doc_type = ?
  `).get(req.params.id, req.params.docType);
  return sendRiderApplicationDocument(res, document);
});

app.patch("/api/admin/riders/:id", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  if (!body || !["pending", "approved", "rejected", "suspended"].includes(body.approvalStatus) ||
      Object.keys(body).some((key) => key !== "approvalStatus")) {
    return sendError(res, 400, "Choose pending, approved, rejected, or suspended.");
  }
  const profile = db.prepare("SELECT user_id FROM rider_profiles WHERE user_id = ?").get(req.params.id);
  if (!profile) return sendError(res, 404, "Rider application not found.");
  const updateApproval = db.transaction(() => {
    db.prepare("UPDATE rider_profiles SET approval_status = ?, is_online = ? WHERE user_id = ?")
      .run(body.approvalStatus, 0, profile.user_id);
    if (body.approvalStatus === "approved") {
      db.prepare("UPDATE users SET role = 'rider' WHERE id = ? AND role = 'customer'").run(profile.user_id);
    }
  });
  updateApproval();
  writeAudit(req.user.id, "rider.approval_changed", "rider", profile.user_id, { approvalStatus: body.approvalStatus });
  return res.json({ ok: true });
});

app.get("/api/admin/users", requireUser, requireAdmin, (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
  const users = db.prepare(`
    SELECT id, name, phone, email, role, account_status AS accountStatus
    FROM users ORDER BY name LIMIT 1000
  `).all().filter((user) =>
    !search || [user.name, user.phone, user.email, user.role].some((value) => String(value || "").toLowerCase().includes(search)),
  ).map((user) => {
    const orderStats = db.prepare(`
      SELECT COUNT(*) AS total,
        SUM(CASE WHEN json_extract(data, '$.status') = 'Delivered' THEN 1 ELSE 0 END) AS delivered
      FROM orders WHERE user_id = ?
    `).get(user.id);
    return { ...user, orderCount: orderStats.total, deliveredCount: orderStats.delivered || 0, email: user.email || "" };
  });
  return res.json(users);
});

app.get("/api/admin/users/:id", requireUser, requireAdmin, (req, res) => {
  const user = db.prepare(`
    SELECT id, name, phone, email, role, account_status AS accountStatus
    FROM users WHERE id = ?
  `).get(req.params.id);
  if (!user) return sendError(res, 404, "User not found.");
  const orders = db.prepare("SELECT id, created_at, data FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
  const deliveredCount = orders.filter((row) => JSON.parse(row.data).status === "Delivered").length;
  return res.json({
    ...user,
    email: user.email || "",
    orderCount: orders.length,
    deliveredCount,
    orders: orders.map(toOrder),
  });
});

app.patch("/api/admin/users/:id", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  if (!body || Object.keys(body).some((key) => !["role", "accountStatus"].includes(key)) ||
      (body.role !== undefined && !["customer", "rider", "admin"].includes(body.role)) ||
      (body.accountStatus !== undefined && !["active", "suspended"].includes(body.accountStatus))) {
    return sendError(res, 400, "Provide a valid role or account status.");
  }
  const user = db.prepare("SELECT id, role, account_status FROM users WHERE id = ?").get(req.params.id);
  if (!user) return sendError(res, 404, "User not found.");
  if (user.id === req.user.id && body.role && body.role !== "admin") return sendError(res, 409, "You cannot remove your own administrator access.");
  if (user.id === req.user.id && body.accountStatus === "suspended") return sendError(res, 409, "You cannot suspend your own administrator account.");
  if (body.role === "customer" && db.prepare(`
    SELECT 1 FROM rider_profiles WHERE user_id = ? AND approval_status = 'approved'
  `).get(user.id)) {
    return sendError(res, 409, "Change the rider approval status before changing this account to customer.");
  }
  if (body.role && user.role === "admin" && body.role !== "admin" &&
      db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND account_status = 'active'").get().count <= 1) {
    return sendError(res, 409, "At least one administrator account must remain.");
  }
  if (body.accountStatus === "suspended" && user.role === "admin" && user.account_status === "active" &&
      db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND account_status = 'active'").get().count <= 1) {
    return sendError(res, 409, "At least one active administrator account must remain.");
  }
  if (body.role !== undefined) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(body.role, user.id);
  if (body.accountStatus !== undefined) {
    db.prepare("UPDATE users SET account_status = ? WHERE id = ?").run(body.accountStatus, user.id);
    if (body.accountStatus === "suspended") {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      db.prepare("UPDATE rider_profiles SET is_online = 0 WHERE user_id = ?").run(user.id);
    }
  }
  writeAudit(req.user.id, "user.access_changed", "user", user.id, {
    role: body.role ?? user.role,
    accountStatus: body.accountStatus ?? user.account_status,
  });
  return res.json({ ok: true });
});

app.get("/api/admin/pricing", requireUser, requireAdmin, (_req, res) => {
  const settings = db.prepare(`
    SELECT base_fare AS base, per_km AS perKm, minimum_fare AS minimum, round_to AS roundTo
    FROM pricing_config WHERE id = 1
  `).get();
  const promos = db.prepare(`
    SELECT code, label, kind, value, active, starts_at AS startsAt, ends_at AS endsAt,
      max_redemptions AS maxRedemptions, redemption_count AS redemptionCount
    FROM promos ORDER BY code
  `).all().map((promo) => ({ ...promo, active: Boolean(promo.active) }));
  return res.json({ ...settings, promos });
});

app.patch("/api/admin/pricing", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  const keys = ["base", "perKm", "minimum", "roundTo"];
  if (!body || Object.keys(body).some((key) => !keys.includes(key)) ||
      keys.some((key) => !Number.isSafeInteger(body[key]) || body[key] < 1 || body[key] > 1_000_000)) {
    return sendError(res, 400, "All fare fields must be whole amounts between ₦1 and ₦1,000,000.");
  }
  db.prepare("UPDATE pricing_config SET base_fare = ?, per_km = ?, minimum_fare = ?, round_to = ? WHERE id = 1")
    .run(body.base, body.perKm, body.minimum, body.roundTo);
  writeAudit(req.user.id, "pricing.updated", "pricing", "default", body);
  return res.json({ ...body });
});

app.post("/api/admin/promos", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!/^[A-Z0-9_-]{3,32}$/.test(code) || !stringField(body.label, { min: 2, max: 80 }) ||
      !["percent", "fixed"].includes(body.kind) || !Number.isSafeInteger(body.value) ||
      body.value < 1 || body.value > (body.kind === "percent" ? 100 : 1_000_000) ||
      typeof body.active !== "boolean" ||
      (body.maxRedemptions !== null && body.maxRedemptions !== undefined &&
        (!Number.isSafeInteger(body.maxRedemptions) || body.maxRedemptions < 1)) ||
      (body.startsAt !== null && body.startsAt !== undefined && !Number.isFinite(Date.parse(body.startsAt))) ||
      (body.endsAt !== null && body.endsAt !== undefined && !Number.isFinite(Date.parse(body.endsAt)))) {
    return sendError(res, 400, "Promo details are invalid.");
  }
  try {
    db.prepare(`
      INSERT INTO promos (code, label, kind, value, active, starts_at, ends_at, max_redemptions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(code, body.label.trim(), body.kind, body.value, body.active ? 1 : 0,
      body.startsAt ? Date.parse(body.startsAt) : null,
      body.endsAt ? Date.parse(body.endsAt) : null,
        body.maxRedemptions ?? null);
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return sendError(res, 409, "That promo code already exists.");
    }
    throw error;
  }
  writeAudit(req.user.id, "promo.created", "promo", code, { kind: body.kind, value: body.value });
  return res.status(201).json({ ok: true });
});

app.patch("/api/admin/promos/:code", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  const allowed = new Set(["label", "kind", "value", "active", "startsAt", "endsAt", "maxRedemptions"]);
  if (!body || Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.has(key))) {
    return sendError(res, 400, "Provide supported promo fields.");
  }
  const current = db.prepare("SELECT * FROM promos WHERE code = ?").get(req.params.code.toUpperCase());
  if (!current) return sendError(res, 404, "Promo code not found.");
  const next = {
    label: body.label ?? current.label,
    kind: body.kind ?? current.kind,
    value: body.value ?? current.value,
    active: body.active ?? Boolean(current.active),
    startsAt: body.startsAt === undefined ? current.starts_at : body.startsAt ? Date.parse(body.startsAt) : null,
    endsAt: body.endsAt === undefined ? current.ends_at : body.endsAt ? Date.parse(body.endsAt) : null,
    maxRedemptions: body.maxRedemptions === undefined ? current.max_redemptions : body.maxRedemptions,
  };
  if (!stringField(next.label, { min: 2, max: 80 }) || !["percent", "fixed"].includes(next.kind) ||
      !Number.isSafeInteger(next.value) || next.value < 1 || next.value > (next.kind === "percent" ? 100 : 1_000_000) ||
      typeof next.active !== "boolean" ||
      (next.maxRedemptions !== null && (!Number.isSafeInteger(next.maxRedemptions) || next.maxRedemptions < 1)) ||
      (next.startsAt !== null && !Number.isFinite(next.startsAt)) || (next.endsAt !== null && !Number.isFinite(next.endsAt))) {
    return sendError(res, 400, "Promo details are invalid.");
  }
  db.prepare(`
    UPDATE promos SET label = ?, kind = ?, value = ?, active = ?, starts_at = ?, ends_at = ?, max_redemptions = ?
    WHERE code = ?
  `).run(next.label.trim(), next.kind, next.value, next.active ? 1 : 0, next.startsAt, next.endsAt, next.maxRedemptions, current.code);
  writeAudit(req.user.id, "promo.updated", "promo", current.code, { active: next.active, kind: next.kind, value: next.value });
  return res.json({ ok: true });
});

app.get("/api/admin/cash", requireUser, requireAdmin, (_req, res) => {
  const riders = db.prepare(`
    SELECT users.id, users.name, users.phone, rider_profiles.plate
    FROM rider_profiles JOIN users ON users.id = rider_profiles.user_id
    ORDER BY users.name
  `).all();
  const orders = adminOrderRows();
  const remittanceQuery = db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_remittances WHERE rider_user_id = ?");
  return res.json(riders.map((rider) => {
    const delivered = orders.filter((order) => order.riderAccount?.id === rider.id && order.status === "Delivered");
    const collected = delivered.reduce((sum, order) => sum + order.price, 0);
    const remitted = remittanceQuery.get(rider.id).amount;
    return { ...rider, deliveries: delivered.length, collected, remitted, outstanding: Math.max(0, collected - remitted) };
  }));
});

app.post("/api/admin/cash/:riderId/remit", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  if (!body || !Number.isSafeInteger(body.amount) || body.amount < 1 ||
      (body.note !== undefined && !stringField(body.note, { max: 300 }))) {
    return sendError(res, 400, "Enter a valid remittance amount and optional note.");
  }
  const result = db.transaction(() => {
    const rider = db.prepare("SELECT user_id FROM rider_profiles WHERE user_id = ?").get(req.params.riderId);
    if (!rider) return { error: "Rider account not found.", status: 404 };
    const collected = db.prepare(`
      SELECT COALESCE(SUM(CAST(json_extract(data, '$.price') AS INTEGER)), 0) AS amount
      FROM orders WHERE rider_user_id = ? AND json_extract(data, '$.status') = 'Delivered'
    `).get(rider.user_id).amount;
    const remitted = db.prepare("SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_remittances WHERE rider_user_id = ?")
      .get(rider.user_id).amount;
    const outstanding = collected - remitted;
    if (body.amount > outstanding) return { error: "Remittance exceeds this rider's outstanding cash.", status: 409 };
    const id = crypto.randomUUID();
    const now = Date.now();
    db.prepare(`
      INSERT INTO cash_remittances (id, rider_user_id, amount, note, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, rider.user_id, body.amount, (body.note || "").trim(), req.user.id, now);
    writeAudit(req.user.id, "cash.remittance_recorded", "rider", rider.user_id, { amount: body.amount, remittanceId: id });
    return { id, amount: body.amount, createdAt: now, outstanding: outstanding - body.amount };
  })();
  if (result.error) return sendError(res, result.status, result.error);
  return res.status(201).json(result);
});

app.get("/api/admin/commission", requireUser, requireAdmin, (_req, res) => {
  const ratePercent = db.prepare("SELECT rate_percent FROM commission_config WHERE id = 1").get().rate_percent;
  const today = lagosDate(Date.now());
  const todayUtc = new Date(`${today}T00:00:00.000Z`);
  const daysSinceMonday = (todayUtc.getUTCDay() + 6) % 7;
  todayUtc.setUTCDate(todayUtc.getUTCDate() - daysSinceMonday);
  const weekStart = todayUtc.toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const periodTotals = db.prepare(`
    SELECT COUNT(*) AS deliveries, COALESCE(SUM(fare_amount), 0) AS fareTotal,
      COALESCE(SUM(commission_amount), 0) AS commissionTotal
    FROM rider_commissions WHERE service_date >= ? AND service_date <= ?
  `);
  const totalsFor = (startDate) => periodTotals.get(startDate, today);
  const allTimeTotals = db.prepare(`
    SELECT COUNT(*) AS deliveries, COALESCE(SUM(fare_amount), 0) AS fareTotal,
      COALESCE(SUM(commission_amount), 0) AS commissionTotal
    FROM rider_commissions
  `).get();
  const rows = db.prepare(`
    SELECT commissions.rider_user_id AS riderId, users.name AS riderName, users.phone AS riderPhone,
      rider_profiles.plate, commissions.service_date AS serviceDate,
      COUNT(*) AS deliveries, SUM(commissions.fare_amount) AS fareTotal,
      SUM(commissions.commission_amount) AS commissionDue,
      settlements.id AS settlementId, settlements.created_at AS settledAt,
      admins.name AS settledBy
    FROM rider_commissions commissions
    JOIN users ON users.id = commissions.rider_user_id
    LEFT JOIN rider_profiles ON rider_profiles.user_id = commissions.rider_user_id
    LEFT JOIN rider_commission_settlements settlements
      ON settlements.rider_user_id = commissions.rider_user_id
      AND settlements.service_date = commissions.service_date
    LEFT JOIN users admins ON admins.id = settlements.recorded_by
    GROUP BY commissions.rider_user_id, commissions.service_date
    ORDER BY CASE WHEN settlements.id IS NULL THEN 0 ELSE 1 END,
      commissions.service_date DESC, users.name
    LIMIT 1000
  `).all().map((row) => ({ ...row, settled: Boolean(row.settlementId) }));
  const outstandingCommission = db.prepare(`
    SELECT COALESCE(SUM(commissions.commission_amount), 0) AS amount
    FROM rider_commissions commissions
    WHERE NOT EXISTS (
      SELECT 1 FROM rider_commission_settlements settlements
      WHERE settlements.rider_user_id = commissions.rider_user_id
        AND settlements.service_date = commissions.service_date
    )
  `).get().amount;
  return res.json({
    ratePercent,
    today,
    todayCommission: totalsFor(today).commissionTotal,
    outstandingCommission,
    periods: {
      today: totalsFor(today),
      thisWeek: totalsFor(weekStart),
      thisMonth: totalsFor(monthStart),
      allTime: allTimeTotals,
    },
    rows,
  });
});

app.patch("/api/admin/commission/rate", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  if (!body || Object.keys(body).length !== 1 ||
      !Number.isSafeInteger(body.ratePercent) || body.ratePercent < 1 || body.ratePercent > 100) {
    return sendError(res, 400, "Commission rate must be a whole percentage between 1 and 100.");
  }
  db.prepare("UPDATE commission_config SET rate_percent = ? WHERE id = 1").run(body.ratePercent);
  writeAudit(req.user.id, "commission.rate_updated", "commission", "default", { ratePercent: body.ratePercent });
  return res.json({ ratePercent: body.ratePercent });
});

app.post("/api/admin/commission/:riderId/:serviceDate/settle", requireUser, requireAdmin, (req, res) => {
  const serviceDate = req.params.serviceDate;
  const parsedServiceDate = new Date(`${serviceDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate) ||
      Number.isNaN(parsedServiceDate.getTime()) ||
      parsedServiceDate.toISOString().slice(0, 10) !== serviceDate ||
      serviceDate >= lagosDate(Date.now())) {
    return sendError(res, 400, "A daily commission can be settled only after its service day has ended.");
  }
  const result = db.transaction(() => {
    const rider = db.prepare(`
      SELECT id FROM users WHERE id = ? AND role = 'rider'
    `).get(req.params.riderId);
    if (!rider) return { error: "Rider account not found.", status: 404 };
    const day = db.prepare(`
      SELECT COUNT(*) AS deliveries, SUM(commission_amount) AS amount
      FROM rider_commissions WHERE rider_user_id = ? AND service_date = ?
    `).get(rider.id, serviceDate);
    if (!day.deliveries) return { error: "No completed deliveries were found for that rider on this date.", status: 404 };
    if (db.prepare(`
      SELECT 1 FROM rider_commission_settlements WHERE rider_user_id = ? AND service_date = ?
    `).get(rider.id, serviceDate)) {
      return { error: "This rider's commission for that day is already settled.", status: 409 };
    }
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    db.prepare(`
      INSERT INTO rider_commission_settlements
        (id, rider_user_id, service_date, amount, recorded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, rider.id, serviceDate, day.amount, req.user.id, createdAt);
    writeAudit(req.user.id, "commission.day_settled", "rider", rider.id, {
      serviceDate, amount: day.amount, deliveries: day.deliveries, settlementId: id,
    });
    return { settlementId: id, riderId: rider.id, serviceDate, amount: day.amount, settledAt: createdAt };
  })();
  if (result.error) return sendError(res, result.status, result.error);
  return res.status(201).json(result);
});

app.get("/api/admin/support", requireUser, requireAdmin, (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const tickets = db.prepare(`
    SELECT tickets.id, tickets.order_id AS orderId, tickets.subject, tickets.message, tickets.status,
      tickets.resolution, tickets.created_at AS createdAt, tickets.updated_at AS updatedAt,
      users.id AS userId, users.name AS userName, users.phone AS userPhone
    FROM support_tickets tickets JOIN users ON users.id = tickets.user_id
    ORDER BY tickets.created_at DESC
  `).all().filter((ticket) => !status || ticket.status === status);
  return res.json(tickets);
});

app.patch("/api/admin/support/:id", requireUser, requireAdmin, (req, res) => {
  const body = getBody(req);
  if (!body || Object.keys(body).some((key) => !["status", "resolution"].includes(key)) ||
      (body.status !== undefined && !["open", "in_progress", "resolved", "closed"].includes(body.status)) ||
      (body.resolution !== undefined && !stringField(body.resolution, { max: 3000 }))) {
    return sendError(res, 400, "Provide a valid support status or resolution note.");
  }
  const ticket = db.prepare("SELECT id, status, resolution FROM support_tickets WHERE id = ?").get(req.params.id);
  if (!ticket) return sendError(res, 404, "Support case not found.");
  const status = body.status ?? ticket.status;
  const resolution = body.resolution === undefined ? ticket.resolution : body.resolution.trim();
  db.prepare("UPDATE support_tickets SET status = ?, resolution = ?, updated_at = ? WHERE id = ?")
    .run(status, resolution, Date.now(), ticket.id);
  writeAudit(req.user.id, "support.updated", "support_ticket", ticket.id, { status });
  return res.json({ ok: true });
});

app.get("/api/admin/audit", requireUser, requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT audit.id, audit.action, audit.entity_type AS entityType, audit.entity_id AS entityId,
      audit.details, audit.created_at AS createdAt, users.name AS actorName
    FROM admin_audit audit JOIN users ON users.id = audit.actor_id
    ORDER BY audit.created_at DESC LIMIT 500
  `).all().map((row) => ({ ...row, details: JSON.parse(row.details) }));
  return res.json(rows);
});

app.get("/api/admin/me", requireUser, requireAdmin, (req, res) => res.json({ id: req.user.id, name: req.user.name }));

app.get("/api/admin/admins", requireUser, requireAdmin, (_req, res) => {
  return res.json(db.prepare(`
    SELECT id, name, phone, email FROM users WHERE role = 'admin' ORDER BY name
  `).all().map((user) => ({ ...user, email: user.email || "" })));
});

app.post("/api/quote", requireUser, limitByUser("route-quote-user-minute", 30, 60 * 1000), asyncRoute(async (req, res) => {
  const body = getBody(req);
  if (
    !body ||
    !stringField(body.from, { max: 200 }) ||
    !stringField(body.to, { max: 200 }) ||
    !validLocation(body.fromLocation) ||
    !validLocation(body.toLocation)
  ) {
    return sendError(res, 400, "Choose valid pickup and destination locations.");
  }
  const promo = typeof body.promo === "string" ? body.promo.trim().toUpperCase() : "";
  if (promo && !activePromo(promo)) return sendError(res, 400, "That promo code is invalid, expired, or fully redeemed.");
  const route = await calculateDrivingRoute(body.fromLocation, body.toLocation);
  return res.json({ ...quoteFor(route.km, promo), durationSeconds: route.durationSeconds });
}));

app.get("/api/rider/profile", requireUser, (req, res) => {
  const profile = db.prepare(`
    SELECT plate, vehicle_type, operating_area, is_online, approval_status
    FROM rider_profiles WHERE user_id = ?
  `).get(req.user.id);
  const commissionOverdue = profile ? enforceCommissionOnlineBlock(req.user.id) : { amount: 0, days: 0 };
  const documentTypes = new Set(db.prepare(`
    SELECT doc_type FROM rider_application_documents WHERE user_id = ?
  `).all(req.user.id).map((document) => document.doc_type));
  return res.json(profile ? {
    plate: profile.plate,
    vehicleType: profile.vehicle_type,
    operatingArea: profile.operating_area,
    documents: {
      identityDocument: documentTypes.has("identityDocument"),
      vehiclePhoto: documentTypes.has("vehiclePhoto"),
      profilePhoto: documentTypes.has("profilePhoto"),
    },
    online: Boolean(profile.is_online) && commissionOverdue.days === 0,
    approvalStatus: profile.approval_status,
    commissionDue: commissionOverdue.amount,
    commissionOverdue: commissionOverdue.days > 0,
  } : null);
});

app.post("/api/rider/application", requireUser, limitByUser("rider-application-user-hour", 5, 60 * 60 * 1000), (req, res) => {
  riderApplicationUpload.fields([
    { name: "identityDocument", maxCount: 1 },
    { name: "vehiclePhoto", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
  ])(req, res, (uploadError) => {
    if (uploadError) {
      const status = uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return sendError(res, status, uploadError.message || "Could not receive rider application documents.");
    }

    const files = req.files || {};
    const uploaded = Object.values(files).flat();
    const fail = (status, message) => {
      removeRiderApplicationFiles(files);
      return sendError(res, status, message);
    };
    if (req.user.role !== "customer" && req.user.role !== "rider") {
      return fail(403, "Sign in with a customer account to submit a rider application.");
    }

    const body = req.body || {};
    const vehicleTypes = ["Motorbike", "Bicycle", "Tricycle", "Car"];
    if (
      !stringField(body.plate, { min: 2, max: 12 }) ||
      !/^[A-Za-z0-9 -]+$/.test(body.plate.trim()) ||
      !vehicleTypes.includes(body.vehicleType) ||
      !stringField(body.operatingArea, { min: 2, max: 120 })
    ) {
      return fail(400, "Enter a valid plate, vehicle type, and operating area.");
    }

    const requiredTypes = ["identityDocument", "vehiclePhoto", "profilePhoto"];
    if (requiredTypes.some((type) => !files[type]?.[0])) {
      return fail(400, "Upload your identity document, vehicle photo, and profile photo.");
    }

    const documents = [];
    for (const docType of requiredTypes) {
      const file = files[docType][0];
      const mimeType = detectRiderDocumentType(file.path);
      if (!mimeType || (docType !== "identityDocument" && mimeType === "application/pdf")) {
        return fail(400, `The selected ${docType === "identityDocument" ? "identity document" : docType === "vehiclePhoto" ? "vehicle photo" : "profile photo"} is not a supported file.`);
      }
      documents.push({
        docType,
        storedName: path.basename(file.filename),
        originalName: path.basename(file.originalname).replace(/[^\w.-]/g, "_").slice(0, 100) || `${docType}`,
        mimeType,
        sizeBytes: file.size,
      });
    }

    const existing = db.prepare("SELECT approval_status FROM rider_profiles WHERE user_id = ?").get(req.user.id);
    if (existing?.approval_status === "approved" || existing?.approval_status === "suspended") {
      return fail(409, "This rider account cannot submit another application.");
    }
    const previousDocuments = db.prepare(`
      SELECT stored_name FROM rider_application_documents WHERE user_id = ?
    `).all(req.user.id);

    try {
      const saveApplication = db.transaction(() => {
        db.prepare(`
          INSERT INTO rider_profiles
            (user_id, plate, vehicle_type, operating_area, is_online, approval_status)
          VALUES (?, ?, ?, ?, 0, 'pending')
          ON CONFLICT(user_id) DO UPDATE SET
            plate = excluded.plate,
            vehicle_type = excluded.vehicle_type,
            operating_area = excluded.operating_area,
            is_online = 0,
            approval_status = 'pending'
        `).run(req.user.id, body.plate.trim().toUpperCase(), body.vehicleType, body.operatingArea.trim());
        db.prepare("UPDATE users SET role = 'rider' WHERE id = ?").run(req.user.id);
        db.prepare("DELETE FROM rider_application_documents WHERE user_id = ?").run(req.user.id);
        const insertDocument = db.prepare(`
          INSERT INTO rider_application_documents
            (user_id, doc_type, stored_name, original_name, mime_type, size_bytes, uploaded_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const document of documents) {
          insertDocument.run(
            req.user.id, document.docType, document.storedName, document.originalName,
            document.mimeType, document.sizeBytes, Date.now(),
          );
        }
      });
      saveApplication();
      for (const document of previousDocuments) {
        try { fs.rmSync(path.join(riderDocumentsDirectory, document.stored_name), { force: true }); }
        catch (error) { console.error("Could not remove replaced rider application document:", error); }
      }
    } catch (error) {
      removeRiderApplicationFiles(files);
      throw error;
    }

    return res.json({
      plate: body.plate.trim().toUpperCase(),
      vehicleType: body.vehicleType,
      operatingArea: body.operatingArea.trim(),
      online: false,
      approvalStatus: "pending",
    });
  });
});

function sendRiderApplicationDocument(res, document) {
  if (!document || path.basename(document.stored_name) !== document.stored_name) {
    return sendError(res, 404, "Rider application document not found.");
  }
  const filePath = path.join(riderDocumentsDirectory, document.stored_name);
  if (!fs.existsSync(filePath)) return sendError(res, 404, "Rider application document is no longer available.");
  const extensions = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  res.set({
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="rider-${document.doc_type}.${extensions[document.mime_type] || "bin"}"`,
    "Content-Type": document.mime_type,
    "X-Content-Type-Options": "nosniff",
  });
  const stream = fs.createReadStream(filePath);
  stream.on("error", (error) => {
    console.error("Could not read rider application document:", error);
    if (!res.headersSent) sendError(res, 500, "Could not read rider application document.");
    else res.destroy(error);
  });
  stream.pipe(res);
}

app.get("/api/rider/application/documents/:docType", requireUser, (req, res) => {
  const document = db.prepare(`
    SELECT doc_type, stored_name, mime_type FROM rider_application_documents
    WHERE user_id = ? AND doc_type = ?
  `).get(req.user.id, req.params.docType);
  return sendRiderApplicationDocument(res, document);
});

app.post("/api/rider/profile", requireUser, (req, res) => {
  const body = getBody(req);
  if (
    !body ||
    !stringField(body.plate, { min: 2, max: 12 }) ||
    !/^[A-Za-z0-9 -]+$/.test(body.plate.trim()) ||
    typeof body.online !== "boolean"
  ) {
    return sendError(res, 400, "Enter a valid vehicle plate and online status.");
  }
  if (req.user.role !== "rider") {
    return sendError(res, 403, "Submit a rider application before changing your online status.");
  }
  const existing = db.prepare(`
    SELECT approval_status, vehicle_type, operating_area
    FROM rider_profiles WHERE user_id = ?
  `).get(req.user.id);
  if (!existing) return sendError(res, 403, "Submit a rider application before changing your online status.");
  const approvalStatus = existing.approval_status;
  if (body.online && approvalStatus !== "approved") {
    return sendError(res, 403, "Your rider application must be approved before going online.");
  }
  const commissionOverdue = enforceCommissionOnlineBlock(req.user.id);
  if (body.online && commissionOverdue.days > 0) {
    return sendError(res, 409, `You have ${commissionOverdue.days} unpaid daily commission balance(s) totaling ₦${commissionOverdue.amount}. Settle them with X-RIDER before going online.`);
  }
  db.prepare(`
    UPDATE rider_profiles SET plate = ?, is_online = ? WHERE user_id = ?
  `).run(body.plate.trim().toUpperCase(), body.online ? 1 : 0, req.user.id);
  return res.json({
    plate: body.plate.trim().toUpperCase(),
    vehicleType: existing.vehicle_type,
    operatingArea: existing.operating_area,
    online: body.online,
    approvalStatus,
  });
});

app.get("/api/rider/orders", requireUser, (req, res) => {
  const profile = db.prepare("SELECT is_online, approval_status FROM rider_profiles WHERE user_id = ?").get(req.user.id);
  const commissionOverdue = profile ? enforceCommissionOnlineBlock(req.user.id) : { amount: 0, days: 0 };
  const rows = db.prepare(`
    SELECT id, user_id, rider_user_id, created_at, data FROM orders
    WHERE rider_user_id = ? OR rider_user_id IS NULL
    ORDER BY created_at DESC
  `).all(req.user.id);
  const orders = rows
    .filter((row) => {
      const status = JSON.parse(row.data).status;
      return row.rider_user_id === req.user.id
        ? activeStatuses.has(status)
        : req.user.account_status === "active" && profile?.approval_status === "approved" &&
          Boolean(profile.is_online) && commissionOverdue.days === 0 && status === "Searching";
    })
    .map((row) => toOrderForParticipant(row, req.user.id));
  return res.json(orders);
});

app.get("/api/rider/earnings", requireUser, requireRider, (req, res) => {
  const rows = db.prepare(`
    SELECT orders.id, orders.created_at, orders.data,
      commissions.service_date, commissions.fare_amount, commissions.rate_percent,
      commissions.commission_amount, commissions.delivered_at,
      CASE WHEN settlements.id IS NULL THEN 0 ELSE 1 END AS settled
    FROM orders
    JOIN rider_commissions AS commissions ON commissions.order_id = orders.id
    LEFT JOIN rider_commission_settlements AS settlements
      ON settlements.rider_user_id = commissions.rider_user_id
      AND settlements.service_date = commissions.service_date
    WHERE orders.rider_user_id = ? AND commissions.rider_user_id = ?
    ORDER BY commissions.delivered_at DESC
  `).all(req.user.id, req.user.id);
  return res.json(rows.map((row) => {
    const order = JSON.parse(row.data);
    return {
      id: row.id,
      from: order.from,
      to: order.to,
      price: row.fare_amount,
      createdAt: row.created_at,
      deliveredAt: row.delivered_at,
      serviceDate: row.service_date,
      ratePercent: row.rate_percent,
      commissionAmount: row.commission_amount,
      settled: Boolean(row.settled),
    };
  }));
});

app.post("/api/rider/orders/:id/accept", requireUser, requireRider, (req, res) => {
  const result = db.transaction(() => {
    const profile = db.prepare("SELECT plate, is_online FROM rider_profiles WHERE user_id = ?").get(req.user.id);
    const commissionOverdue = enforceCommissionOnlineBlock(req.user.id);
    if (commissionOverdue.days > 0) {
      return { error: "Your previous day's commission is overdue. It must be settled before accepting new deliveries.", status: 409 };
    }
    if (!profile?.is_online) return { error: "Go online before accepting a delivery.", status: 409 };
    const hasActiveOrder = db.prepare(`
      SELECT 1 FROM orders
      WHERE rider_user_id = ? AND json_extract(data, '$.status') IN ('Rider assigned', 'At pickup', 'Picked up', 'Out for delivery')
      LIMIT 1
    `).get(req.user.id);
    if (hasActiveOrder) return { error: "Finish your current delivery before accepting another.", status: 409 };
    const row = db.prepare("SELECT id, created_at, data FROM orders WHERE id = ? AND rider_user_id IS NULL").get(req.params.id);
    if (!row) return { error: "This delivery is no longer available.", status: 409 };
    const order = JSON.parse(row.data);
    if (order.status !== "Searching") return { error: "This delivery is no longer available.", status: 409 };
    order.status = "Rider assigned";
    order.rider = { name: req.user.name, rating: "New", plate: profile.plate };
    const update = db.prepare(`
      UPDATE orders SET rider_user_id = ?, data = ?
      WHERE id = ? AND rider_user_id IS NULL AND json_extract(data, '$.status') = 'Searching'
    `).run(req.user.id, JSON.stringify(order), row.id);
    if (update.changes !== 1) return { error: "This delivery was accepted by another rider.", status: 409 };
    return { order: toOrder({ ...row, data: JSON.stringify(order) }) };
  })();
  if (result.error) return sendError(res, result.status, result.error);
  return res.json(result.order);
});

app.post("/api/rider/orders/:id/status", requireUser, requireRider, (req, res) => {
  const body = getBody(req);
  const allowedTransitions = {
    "At pickup": ["Rider assigned"],
    "Picked up": ["At pickup", "Rider assigned"],
    "Out for delivery": ["Picked up"],
    Delivered: ["Out for delivery"],
  };
  if (!body || !Object.hasOwn(allowedTransitions, body.status)) {
    return sendError(res, 400, "Choose a valid next delivery status.");
  }
  const result = db.transaction(() => {
    const row = db.prepare(`
      SELECT id, created_at, data FROM orders WHERE id = ? AND rider_user_id = ?
    `).get(req.params.id, req.user.id);
    if (!row) return { error: "Assigned delivery not found.", status: 404 };
    const order = JSON.parse(row.data);
    if (!allowedTransitions[body.status].includes(order.status)) {
      return { error: `Cannot move a delivery from ${order.status} to ${body.status}.`, status: 409 };
    }
    const now = Date.now();
    const previousStatus = order.status;
    if (body.status === "Picked up" && order.status === "Rider assigned") order.arrivedAt = now;
    order.status = body.status;
    if (body.status === "At pickup") order.arrivedAt = now;
    if (body.status === "Picked up") order.pickAt = now;
    if (body.status === "Delivered") {
      order.endAt = now;
      const ratePercent = db.prepare("SELECT rate_percent FROM commission_config WHERE id = 1").get().rate_percent;
      const commissionAmount = Math.round(order.price * ratePercent / 100);
      db.prepare(`
        INSERT INTO rider_commissions
          (order_id, rider_user_id, service_date, fare_amount, rate_percent, commission_amount, delivered_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(row.id, req.user.id, lagosDate(now), order.price, ratePercent, commissionAmount, now);
    }
    const update = db.prepare(`
      UPDATE orders SET data = ?
      WHERE id = ? AND rider_user_id = ? AND json_extract(data, '$.status') = ?
    `).run(JSON.stringify(order), row.id, req.user.id, previousStatus);
    if (update.changes !== 1) return { error: "Delivery status changed. Refresh and try again.", status: 409 };
    return { order: toOrder({ ...row, data: JSON.stringify(order) }) };
  })();
  if (result.error) return sendError(res, result.status, result.error);
  return res.json(result.order);
});

app.get("/api/orders", requireUser, (req, res) => {
  const orders = db.prepare("SELECT id, created_at, data FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  res.json(orders.map(toOrder));
});

function validLocation(location) {
  return Boolean(
    location &&
    typeof location === "object" &&
    !Array.isArray(location) &&
    stringField(location.address, { min: 1, max: 200 }) &&
    typeof location.lat === "number" &&
    Number.isFinite(location.lat) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    typeof location.lng === "number" &&
    Number.isFinite(location.lng) &&
    location.lng >= -180 &&
    location.lng <= 180,
  );
}

async function validateOrderInput(body, user) {
  if (
    !body ||
    !stringField(body.from, { min: 1, max: 200 }) ||
    !stringField(body.to, { min: 1, max: 200 }) ||
    (body.phone !== undefined && !stringField(body.phone, { max: 30 })) ||
    (body.mode !== undefined && !["Send", "Receive"].includes(body.mode)) ||
    !validLocation(body.fromLocation) ||
    !validLocation(body.toLocation)
  ) {
    return { error: "Choose valid pickup and destination locations." };
  }
  const phone = typeof body.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  const recipientPhone = phone
    ? phone.startsWith("234") ? `+${phone}` : `+234${phone.replace(/^0/, "")}`
    : user.phone;
  if (!/^\+234\d{10}$/.test(recipientPhone)) return { error: "Enter a valid Nigerian recipient phone number." };
  if (body.promo !== undefined && typeof body.promo !== "string") return { error: "Promo code is invalid." };
  if (body.pk !== undefined && !stringField(body.pk, { max: 100 })) return { error: "Package type is invalid." };
  if (body.note !== undefined && !stringField(body.note, { max: 1000 })) return { error: "Order note is too long." };
  const promo = typeof body.promo === "string" ? body.promo.trim().toUpperCase() : "";
  if (promo && !activePromo(promo)) return { error: "That promo code is invalid, expired, or fully redeemed." };
  const route = await calculateDrivingRoute(body.fromLocation, body.toLocation);
  const quote = quoteFor(route.km, promo);
  return {
    order: {
      from: body.from.trim(),
      to: body.to.trim(),
      phone: recipientPhone,
      mode: body.mode || "Send",
      km: quote.km,
      price: quote.total,
      baseFare: quote.base,
      distanceFare: quote.distance,
      discount: quote.discount,
      fromLocation: body.fromLocation,
      toLocation: body.toLocation,
      ...(body.pk !== undefined ? { pk: body.pk.trim() } : {}),
      ...(body.note !== undefined ? { note: body.note.trim() } : {}),
      ...(promo ? { promo } : {}),
    },
  };
}

const insertOrder = db.prepare("INSERT INTO orders (id, user_id, created_at, data) VALUES (?, ?, ?, ?)");
const saveOrder = db.transaction((id, userId, createdAt, order) => {
  if (order.promo) {
    const result = db.prepare(`
      UPDATE promos SET redemption_count = redemption_count + 1
      WHERE code = ? AND active = 1
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at > ?)
        AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
    `).run(order.promo, Date.now(), Date.now());
    if (result.changes !== 1) {
      const error = new Error("That promo code is no longer available. Request a fresh quote.");
      error.status = 409;
      throw error;
    }
  }
  insertOrder.run(id, userId, createdAt, JSON.stringify(order));
});

app.get("/api/orders/active", requireUser, (req, res) => {
  const rows = db.prepare("SELECT id, user_id, rider_user_id, created_at, data FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  const active = rows.find((row) => activeStatuses.has(JSON.parse(row.data).status));
  return res.json(active ? toOrderForParticipant(active, req.user.id) : null);
});

app.get("/api/orders/:id", requireUser, (req, res) => {
  const row = db.prepare("SELECT id, user_id, rider_user_id, created_at, data FROM orders WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return sendError(res, 404, "Order not found.");
  return res.json(toOrderForParticipant(row, req.user.id));
});

app.get("/api/orders/:id/messages", requireUser, (req, res) => {
  const row = db.prepare(`
    SELECT id, user_id, rider_user_id, data FROM orders WHERE id = ?
  `).get(req.params.id);
  if (!row) return sendError(res, 404, "Delivery not found.");
  const chat = getOrderChat(row, req.user.id);
  if (chat.error) return sendError(res, chat.status, chat.error);
  const messages = db.prepare(`
    SELECT order_messages.id, order_messages.sender_user_id AS senderId,
      users.name AS senderName, order_messages.sender_role AS senderRole,
      order_messages.text, order_messages.created_at AS createdAt
    FROM order_messages
    JOIN users ON users.id = order_messages.sender_user_id
    WHERE order_messages.order_id = ?
    ORDER BY order_messages.created_at DESC, order_messages.rowid DESC
    LIMIT 200
  `).all(req.params.id).reverse().map((message) => ({
    ...message,
    mine: message.senderId === req.user.id,
  }));
  return res.json(messages);
});

app.post("/api/orders/:id/messages", requireUser, limitByUser("chat-message-user-minute", 30, 60 * 1000), (req, res) => {
  const body = getBody(req);
  if (!body || !stringField(body.text, { min: 1, max: 1000 }) ||
      !["customer", "rider"].includes(body.senderRole) ||
      Object.keys(body).some((key) => key !== "text" && key !== "senderRole")) {
    return sendError(res, 400, "Enter a message of up to 1000 characters.");
  }
  const row = db.prepare(`
    SELECT id, user_id, rider_user_id, data FROM orders WHERE id = ?
  `).get(req.params.id);
  if (!row) return sendError(res, 404, "Delivery not found.");
  const chat = getOrderChat(row, req.user.id);
  if (chat.error) return sendError(res, chat.status, chat.error);
  const roleParticipantId = body.senderRole === "rider" ? row.rider_user_id : row.user_id;
  if (req.user.id !== roleParticipantId) return sendError(res, 403, "You cannot send a message as the other delivery participant.");
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const text = body.text.trim();
  db.prepare(`
    INSERT INTO order_messages (id, order_id, sender_user_id, sender_role, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, req.user.id, body.senderRole, text, createdAt);
  return res.status(201).json({
    id,
    senderId: req.user.id,
    senderName: req.user.name,
    senderRole: body.senderRole,
    text,
    createdAt,
    mine: true,
  });
});

app.post("/api/orders", requireUser, limitByUser("order-create-user-hour", 10, 60 * 60 * 1000), asyncRoute(async (req, res) => {
  const body = getBody(req);
  const validated = await validateOrderInput(body, req.user);
  if (validated.error) return sendError(res, 400, validated.error);
  if (!stringField(body.scheduledFor, { min: 1, max: 40 })) {
    return sendError(res, 400, "Choose a valid delivery date and time.");
  }
  const scheduledTime = Date.parse(body.scheduledFor);
  if (!Number.isFinite(scheduledTime) || scheduledTime <= Date.now()) {
    return sendError(res, 400, "Scheduled delivery must be in the future.");
  }
  const order = { ...validated.order, status: "Scheduled", scheduledFor: body.scheduledFor, reqAt: Date.now() };
  const id = `XR${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const createdAt = Date.now();
  saveOrder(id, req.user.id, createdAt, order);
  return res.status(201).json({ ...order, id, createdAt });
}));

app.post("/api/orders/request", requireUser, limitByUser("order-create-user-hour", 10, 60 * 60 * 1000), asyncRoute(async (req, res) => {
  const validated = await validateOrderInput(getBody(req), req.user);
  if (validated.error) return sendError(res, 400, validated.error);
  const current = db.prepare("SELECT data FROM orders WHERE user_id = ?").all(req.user.id)
    .some((row) => activeStatuses.has(JSON.parse(row.data).status));
  if (current) return sendError(res, 409, "You already have a delivery request in progress.");

  const now = Date.now();
  const order = { ...validated.order, status: "Searching", reqAt: now };
  const id = `XR${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  saveOrder(id, req.user.id, now, order);
  return res.status(201).json({ ...order, id, createdAt: now });
}));

app.post("/api/orders/:id/cancel", requireUser, (req, res) => {
  const body = getBody(req);
  if (!body || !stringField(body.reason, { min: 1, max: 200 })) return sendError(res, 400, "Select a cancellation reason.");
  const row = db.prepare("SELECT id, created_at, data FROM orders WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return sendError(res, 404, "Order not found.");
  const order = JSON.parse(row.data);
  if (!activeStatuses.has(order.status)) return sendError(res, 409, `Cannot cancel an order in ${order.status} status.`);
  order.status = "Cancelled";
  order.reason = body.reason.trim();
  order.endAt = Date.now();
  db.prepare("UPDATE orders SET data = ? WHERE id = ? AND user_id = ?").run(JSON.stringify(order), row.id, req.user.id);
  return res.json({ ...order, id: row.id, createdAt: row.created_at });
});

app.patch("/api/orders/:id", requireUser, (req, res) => {
  const body = getBody(req);
  if (!body || Object.keys(body).length === 0) return sendError(res, 400, "Provide order fields to update.");
  const row = db.prepare("SELECT id, created_at, data FROM orders WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!row) return sendError(res, 404, "Order not found.");

  const allowed = new Set(["rate", "tags", "comment", "issue"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return sendError(res, 400, "One or more order fields cannot be changed.");
  if (body.rate !== undefined && (!Number.isInteger(body.rate) || body.rate < 1 || body.rate > 5)) return sendError(res, 400, "Rating must be between 1 and 5.");
  if (body.rate !== undefined && JSON.parse(row.data).status !== "Delivered") return sendError(res, 409, "Only delivered orders can be rated.");
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 10 || body.tags.some((tag) => !stringField(tag, { max: 60 })))) {
    return sendError(res, 400, "Rating tags are invalid.");
  }
  for (const key of ["reason", "comment", "issue"]) {
    if (body[key] !== undefined && !stringField(body[key], { max: 1000 })) return sendError(res, 400, "Order feedback is too long.");
  }

  const order = { ...JSON.parse(row.data), ...body };
  db.prepare("UPDATE orders SET data = ? WHERE id = ? AND user_id = ?").run(JSON.stringify(order), row.id, req.user.id);
  return res.json({ ...order, id: row.id, createdAt: row.created_at });
});

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) return sendError(res, 400, "Invalid JSON request body.");
  if (Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
    return sendError(res, error.status, error.message);
  }
  console.error("Express API error:", error);
  return sendError(res, 500, "The local API could not complete the request.");
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Local Express API listening on http://127.0.0.1:${port}`);
});
