"use client";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { MapPin } from "lucide-react";
import { searchPlaces } from "@/lib/geoapify";
import type { MapLocation } from "@/lib/trip";
import { useToast } from "./Toast";

type Props = {
  value: string;
  placeholder: string;
  className: string;
  style?: CSSProperties;
  onChange: (value: string) => void;
  onSelect: (location: MapLocation) => void;
};

export default function PlaceAutocompleteInput({ value, placeholder, className, style, onChange, onSelect }: Props) {
  const toast = useToast();
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<MapLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const callbacks = useRef({ onChange, onSelect });
  callbacks.current = { onChange, onSelect };

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    const input = query.trim();
    if (!process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY || input.length < 2 || !isOpen) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    let active = true;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const places = await searchPlaces(input);
        if (active) setSuggestions(places);
      } catch (error) {
        if (active) {
          setSuggestions([]);
          toast(error instanceof Error ? `Could not load place suggestions: ${error.message}` : "Could not load place suggestions.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [isOpen, query, toast]);

  function selectPlace(place: MapLocation) {
    setQuery(place.address);
    setSuggestions([]);
    setIsOpen(false);
    callbacks.current.onChange(place.address);
    callbacks.current.onSelect(place);
  }

  return (
    <div className={`place-autocomplete ${className}`} style={style}>
      <input
        className="place-autocomplete-field"
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && suggestions.length > 0}
        aria-controls={listId}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);
          callbacks.current.onChange(nextQuery);
        }}
      />
      {isOpen && (loading || suggestions.length > 0) && (
        <ul id={listId} className="place-suggestions" role="listbox" aria-label="Place suggestions">
          {loading && <li className="place-suggestion-status" role="status">Searching nearby places…</li>}
          {suggestions.map((place) => (
            <li key={`${place.lat},${place.lng},${place.address}`}>
              <button
                className="place-suggestion"
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectPlace(place)}
              >
                <MapPin className="place-suggestion-pin" size={17} aria-hidden="true" />
                <span className="place-suggestion-copy">
                  <strong>{place.address.split(",")[0]}</strong>
                  <span>{place.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
