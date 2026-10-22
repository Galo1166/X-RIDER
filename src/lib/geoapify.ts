import type { MapLocation, RouteInfo } from "./trip";

type GeoapifyFeature = {
  geometry?: { coordinates?: unknown };
  properties?: {
    formatted?: string;
    lat?: number;
    lon?: number;
    distance?: number;
    time?: number;
  };
};

type GeoapifyResponse = {
  features?: GeoapifyFeature[];
  message?: string;
  error?: string;
};

const API_BASE = "https://api.geoapify.com/v1";
const KANO = { lat: 12.0022, lng: 8.592 };

function apiUrl(path: string, params: Record<string, string | number>) {
  const apiKey = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
  if (!apiKey) throw new Error("Add NEXT_PUBLIC_GEOAPIFY_API_KEY to .env.local to enable maps.");
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries({ ...params, apiKey }).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url;
}

async function request(url: URL): Promise<GeoapifyResponse> {
  const response = await fetch(url);
  const result = await response.json() as GeoapifyResponse;
  if (!response.ok) {
    throw new Error(result.message ?? result.error ?? `Geoapify request failed (${response.status}).`);
  }
  return result;
}

function asMapLocation(feature?: GeoapifyFeature): MapLocation | null {
  const address = feature?.properties?.formatted;
  const lat = feature?.properties?.lat;
  const lng = feature?.properties?.lon;
  if (!address || typeof lat !== "number" || !Number.isFinite(lat) || typeof lng !== "number" || !Number.isFinite(lng)) return null;
  return { address, lat, lng };
}

export async function searchPlaces(query: string): Promise<MapLocation[]> {
  const url = apiUrl("geocode/autocomplete", {
    text: query,
    filter: "countrycode:ng",
    bias: `proximity:${KANO.lng},${KANO.lat}`,
    limit: 5,
    format: "geojson",
  });
  const result = await request(url);
  return (result.features ?? []).map(asMapLocation).filter((place): place is MapLocation => place !== null);
}

export async function reverseGeocode(lat: number, lng: number): Promise<MapLocation | null> {
  const url = apiUrl("geocode/reverse", { lat, lon: lng, format: "geojson", limit: 1 });
  const result = await request(url);
  return asMapLocation(result.features?.[0]);
}

export async function calculateRoute(from: MapLocation, to: MapLocation): Promise<RouteInfo> {
  const url = apiUrl("routing", {
    waypoints: `${from.lat},${from.lng}|${to.lat},${to.lng}`,
    mode: "drive",
    format: "geojson",
  });
  const result = await request(url);
  const feature = result.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const distance = feature?.properties?.distance;
  const duration = feature?.properties?.time;
  if (!Array.isArray(coordinates) || !coordinates.length || typeof distance !== "number" ||
      !Number.isFinite(distance) || typeof duration !== "number" || !Number.isFinite(duration)) {
    throw new Error("No driving route was found between these places. Choose different map results.");
  }

  const positions: unknown[] = [];
  coordinates.forEach((segment) => {
    if (Array.isArray(segment) && Array.isArray(segment[0])) positions.push(...segment);
    else positions.push(segment);
  });
  const path = positions.flatMap((position) => {
    if (!Array.isArray(position) || position.length < 2 ||
        typeof position[0] !== "number" || !Number.isFinite(position[0]) ||
        typeof position[1] !== "number" || !Number.isFinite(position[1])) return [];
    return [{ lat: position[1], lng: position[0] }];
  });
  if (!path.length) throw new Error("The route service returned an invalid route geometry.");

  return {
    from: { lat: from.lat, lng: from.lng },
    to: { lat: to.lat, lng: to.lng },
    km: distance / 1000,
    durationSeconds: Math.ceil(duration),
    path,
  };
}
