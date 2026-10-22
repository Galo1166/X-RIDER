"use client";
import type { ReactNode } from "react";

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="md" onClick={onClose}>
      <div className="mb" onClick={(e) => e.stopPropagation()}>
        <div className="chh"><b>{title}</b><button className="bk" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}
