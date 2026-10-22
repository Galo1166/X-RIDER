"use client";
import Booking from "@/components/Booking";
import TripPanel from "@/components/TripPanel";
import { useTrip } from "@/lib/trip";

export default function Home() {
  const { trip } = useTrip();
  return trip ? <TripPanel /> : <Booking />;
}
