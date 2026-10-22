"use client";

import { MapPin, Navigation } from "lucide-react";

export default function RiderMap({ area }: { area?: string }) {
  return (
    <div className="rider-map" role="img" aria-label="Illustrated dispatch zone map. Live rider location is not available yet.">
      <svg className="rider-map-art" viewBox="0 0 900 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="900" height="700" fill="var(--rider-map-bg)" />
        <path d="M-90 92 205 176 370 108 585 207 985 102M-80 510 178 400 390 480 610 378 980 500M155-70 265 220 212 418 350 770M558-60 480 182 605 343 528 760M820-40 690 176 770 328 650 740" fill="none" stroke="var(--rider-map-park)" strokeWidth="94" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-90 92 205 176 370 108 585 207 985 102M-80 510 178 400 390 480 610 378 980 500M155-70 265 220 212 418 350 770M558-60 480 182 605 343 528 760M820-40 690 176 770 328 650 740" fill="none" stroke="var(--rider-map-road)" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M-90 92 205 176 370 108 585 207 985 102M-80 510 178 400 390 480 610 378 980 500M155-70 265 220 212 418 350 770M558-60 480 182 605 343 528 760M820-40 690 176 770 328 650 740" fill="none" stroke="var(--rider-map-road-edge)" strokeWidth="2" strokeDasharray="7 11" strokeLinecap="round" />
        <path d="M-20 292 174 256 376 288 545 265 920 317M45 628 263 567 445 612 680 545 930 610M370-20 372 135 400 322 356 508 420 730M730-30 620 105 742 238 692 432 800 700" fill="none" stroke="var(--rider-map-local)" strokeWidth="12" strokeLinecap="round" />
        <path d="M0 0h900v700H0z" fill="url(#rider-map-grain)" opacity=".2" />
        <defs>
          <pattern id="rider-map-grain" width="44" height="44" patternUnits="userSpaceOnUse">
            <circle cx="3" cy="3" r="1.2" fill="var(--rider-map-ink)" opacity=".18" />
          </pattern>
        </defs>
      </svg>

      <div className="rider-map-label rider-map-label--north">{area || "YOUR DISPATCH AREA"}</div>
      <div className="rider-map-label rider-map-label--park">LOCAL ROUTES</div>
      <div className="rider-map-coordinate" aria-hidden="true">
        <span className="rider-location-pulse"><i /><b /></span>
        <small>RIDER APP</small>
      </div>
      <div className="rider-map-status">
        <span className="rider-map-status-icon"><MapPin size={16} /></span>
        <span><b>Dispatch area</b><small>Live location not connected</small></span>
        <Navigation size={16} aria-hidden="true" />
      </div>
      <div className="rider-map-zoom" aria-hidden="true"><span>+</span><i /><span>−</span></div>
    </div>
  );
}
