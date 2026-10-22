"use client";
import type { Map as MapLibreMap, MapMouseEvent as MapLibreMouseEvent, Marker as MapLibreMarker } from "maplibre-gl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { calculateRoute, reverseGeocode } from "@/lib/geoapify";
import { useTrip } from "@/lib/trip";
import { useToast } from "./Toast";

const KANO = { lat: 12.0022, lng: 8.592 };
const GEOAPIFY_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;

export default function CityMap() {
  const {
    mapTarget, setMapTarget, mapLocations, setMapLocation, trip,
    routeInfo, setRouteInfo, setRouteLoading, setRouteError,
  } = useTrip();
  const pathname = usePathname();
  const toast = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const locationRequested = useRef(false);
  const routeRequest = useRef(0);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!GEOAPIFY_KEY || !containerRef.current) return;
    let active = true;
    let instance: MapLibreMap | null = null;

    void import("maplibre-gl").then((maplibregl) => {
      if (!active || !containerRef.current) return;
      maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
      const createdMap = new maplibregl.Map({
        container: containerRef.current,
        style: `https://maps.geoapify.com/v1/styles/osm-carto/style.json?apiKey=${encodeURIComponent(GEOAPIFY_KEY)}`,
        center: [KANO.lng, KANO.lat],
        zoom: 13,
        attributionControl: { compact: false },
      });
      instance = createdMap;
      createdMap.addControl(new maplibregl.NavigationControl(), "top-right");
      createdMap.once("load", () => {
        if (!active) return;
        createdMap.addSource("x-rider-route", {
          type: "geojson",
          data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
        });
        createdMap.addLayer({
          id: "x-rider-route-line",
          type: "line",
          source: "x-rider-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#2576e8", "line-width": 5, "line-opacity": 0.92 },
        });
        mapRef.current = createdMap;
        setMap(createdMap);
      });
      let errorShown = false;
      createdMap.on("error", () => {
        if (errorShown) return;
        errorShown = true;
        toast("Could not load the Geoapify map. Check your API key, enabled APIs, and allowed domains.");
      });
    }).catch((error: unknown) => {
      if (active) toast(error instanceof Error ? `Could not start the map: ${error.message}` : "Could not start the map.");
    });

    return () => {
      active = false;
      mapRef.current = null;
      setMap(null);
      instance?.remove();
    };
  }, [toast]);

  useEffect(() => {
    if (pathname !== "/home" || trip || !map || locationRequested.current) return;
    locationRequested.current = true;
    if (!navigator.geolocation) {
      toast("This browser does not support location. Set your pickup point on the map.");
      return;
    }

    let active = true;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        if (!active) return;
        const location = { lat: coords.latitude, lng: coords.longitude };
        setCurrentLocation(location);
        if (mapLocations.pickup || mapTarget) return;

        try {
          const place = await reverseGeocode(location.lat, location.lng);
          if (!active) return;
          if (!place) {
            toast("Current location found, but its address could not be resolved. Choose a pickup point on the map.");
            return;
          }
          setMapLocation("pickup", place);
        } catch (error) {
          if (active) toast(error instanceof Error ? `Could not resolve your current address: ${error.message}` : "Could not resolve your current address.");
        }
      },
      (error) => {
        if (!active) return;
        const message = error.code === error.PERMISSION_DENIED
          ? "Location access is blocked. Allow it in your browser settings to show your current location."
          : error.code === error.TIMEOUT
            ? "Finding your location timed out. Try again or choose a point on the map."
            : "Could not get your location. Check device location settings or choose a point on the map.";
        toast(message);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );

    return () => { active = false; };
  }, [map, mapLocations.pickup, mapTarget, pathname, setMapLocation, toast, trip]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource("x-rider-route") as import("maplibre-gl").GeoJSONSource | undefined;
    if (!source) return;
    if (!routeInfo?.path.length) {
      source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } });
      const location = mapLocations.destination ?? mapLocations.pickup;
      if (location) map.easeTo({ center: [location.lng, location.lat] });
      return;
    }
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: routeInfo.path.map(({ lat, lng }) => [lng, lat]) },
    });
    const lngs = routeInfo.path.map(({ lng }) => lng);
    const lats = routeInfo.path.map(({ lat }) => lat);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 80, maxZoom: 15, duration: 500 },
    );
  }, [map, mapLocations.destination, mapLocations.pickup, routeInfo]);

  useEffect(() => {
    if (!map) return;
    void import("maplibre-gl").then(({ Marker }) => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      const locations = [
        ...(currentLocation ? [{ location: currentLocation, className: "map-current-marker", label: "Your location" }] : []),
        ...(mapLocations.pickup ? [{ location: mapLocations.pickup, className: "map-pickup-marker", label: "Pickup point" }] : []),
        ...(mapLocations.destination ? [{ location: mapLocations.destination, className: "map-destination-marker", label: "Destination" }] : []),
      ];
      markersRef.current = locations.map(({ location, className, label }) => {
        const element = document.createElement("div");
        element.className = className;
        element.setAttribute("aria-label", label);
        return new Marker({ element, anchor: "center" }).setLngLat([location.lng, location.lat]).addTo(map);
      });
    });
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [currentLocation, map, mapLocations.destination, mapLocations.pickup]);

  useEffect(() => {
    const pickup = mapLocations.pickup;
    const destination = mapLocations.destination;
    const requestId = ++routeRequest.current;
    if (!pickup || !destination) {
      setRouteInfo(null);
      setRouteLoading(false);
      setRouteError(null);
      return;
    }

    let active = true;
    setRouteInfo(null);
    setRouteError(null);
    setRouteLoading(true);
    calculateRoute(pickup, destination).then((route) => {
      if (active && requestId === routeRequest.current) setRouteInfo(route);
    }).catch((error: unknown) => {
      if (!active || requestId !== routeRequest.current) return;
      setRouteError(error instanceof Error ? `Could not calculate the driving route: ${error.message}` : "Could not calculate the driving route.");
    }).finally(() => {
      if (active && requestId === routeRequest.current) setRouteLoading(false);
    });

    return () => { active = false; };
  }, [
    mapLocations.destination?.lat, mapLocations.destination?.lng,
    mapLocations.pickup?.lat, mapLocations.pickup?.lng,
    setRouteError, setRouteInfo, setRouteLoading,
  ]);

  const selectLocation = useCallback(async (event: MapLibreMouseEvent) => {
    if (!mapTarget || selecting) return;
    setSelecting(true);
    try {
      const place = await reverseGeocode(event.lngLat.lat, event.lngLat.lng);
      if (!place) {
        toast("No address was found for that map location. Try a nearby point.");
        return;
      }
      setMapLocation(mapTarget, { ...place, lat: event.lngLat.lat, lng: event.lngLat.lng });
      setMapTarget(null);
      toast(`${mapTarget === "pickup" ? "Pickup" : "Destination"} point selected`);
    } catch (error) {
      toast(error instanceof Error ? `Could not find that address: ${error.message}` : "Could not find an address for that map location.");
    } finally {
      setSelecting(false);
    }
  }, [mapTarget, selecting, setMapLocation, setMapTarget, toast]);

  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor = mapTarget ? "crosshair" : "";
    map.on("click", selectLocation);
    return () => { map.off("click", selectLocation); };
  }, [map, mapTarget, selectLocation]);

  if (!GEOAPIFY_KEY) {
    return (
      <div className="map map-unconfigured" role="status">
        <div className="map-config-message">
          <strong>Map provider setup needed</strong>
          <span>Create a Geoapify project, then add <code>NEXT_PUBLIC_GEOAPIFY_API_KEY</code> to <code>.env.local</code> and restart the app.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="map">
      <div ref={containerRef} className="maplibre-canvas" />
      {mapTarget && (
        <div className="map-pick-prompt">
          {selecting ? "Finding address…" : `Tap the map to select ${mapTarget === "pickup" ? "pickup" : "destination"}`}
          <button type="button" onClick={() => setMapTarget(null)}>Cancel</button>
        </div>
      )}
    </div>
  );
}
