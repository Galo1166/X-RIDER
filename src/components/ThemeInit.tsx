"use client";
import { useEffect } from "react";

export default function ThemeInit() {
  useEffect(() => { const t = localStorage.getItem("xr_theme"); if (t) document.documentElement.dataset.theme = t; }, []);
  return null;
}
