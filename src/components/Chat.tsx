"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send } from "lucide-react";
import { api, type OrderMessage } from "@/lib/api";

const time = (n: number) => new Date(n).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
const QUICK = ["Where are you?", "I'm at the gate", "Please call me", "Be careful, it's fragile"];
const RIDER_QUICK = ["I'm on my way", "I've arrived at pickup", "Please meet me outside"];

export default function Chat({
  open, orderId, name, context, onClose, onUnreadChange, variant = "customer",
}: {
  open: boolean;
  orderId: string;
  name: string;
  context: string;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
  variant?: "rider" | "customer";
}) {
  const [msgs, setMsgs] = useState<OrderMessage[]>([]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const quickMessages = variant === "rider" ? RIDER_QUICK : QUICK;
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "C";
  const readMarkerKey = `x-rider-chat-read:${orderId}:${variant}`;

  useEffect(() => {
    setLoading(true);
    setMsgs([]);
    setError("");
    onUnreadChange?.(0);
  }, [orderId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const next = await api.orderMessages(orderId);
        if (!mounted) return;
        setMsgs(next);
        setLoading(false);
        setError("");
        const latestMessage = next.at(-1);
        if (open) {
          if (latestMessage) window.localStorage.setItem(readMarkerKey, JSON.stringify({ id: latestMessage.id, createdAt: latestMessage.createdAt }));
          onUnreadChange?.(0);
        } else {
          const storedMarker = window.localStorage.getItem(readMarkerKey);
          const marker = storedMarker ? JSON.parse(storedMarker) as { id: string; createdAt: number } : null;
          const markerIndex = marker ? next.findIndex((message) => message.id === marker.id) : -1;
          const unread = next.filter((message, index) => {
            if (message.senderRole === variant) return false;
            if (!marker) return true;
            return markerIndex >= 0 ? index > markerIndex : message.createdAt > marker.createdAt;
          }).length;
          onUnreadChange?.(unread);
        }
      } catch (loadError) {
        if (mounted) {
          setLoading(false);
          setError(loadError instanceof Error ? loadError.message : "Could not load messages.");
        }
      }
    };
    if (open) {
      const latestMessage = msgs.at(-1);
      if (latestMessage) window.localStorage.setItem(readMarkerKey, JSON.stringify({ id: latestMessage.id, createdAt: latestMessage.createdAt }));
      onUnreadChange?.(0);
    }
    void load();
    const interval = window.setInterval(() => { void load(); }, 2500);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [open, orderId, onUnreadChange, readMarkerKey]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  async function send(text: string) {
    const messageText = text.trim();
    if (!messageText || busy) return;
    setBusy(true);
    setError("");
    try {
      const senderRole = variant === "rider" ? "rider" : "customer";
      const sent = await api.sendOrderMessage(orderId, messageText, senderRole);
      setMsgs((current) => current.some((message) => message.id === sent.id) ? current : [...current, sent]);
      if (open) {
        window.localStorage.setItem(readMarkerKey, JSON.stringify({ id: sent.id, createdAt: sent.createdAt }));
        onUnreadChange?.(0);
      }
      setValue("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send your message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`chat${open ? "" : " hide"}${variant === "rider" ? " rider-chat" : ""}`}>
      <div className="chd">
        <button className="bk" onClick={onClose} aria-label="Back to delivery"><ArrowLeft size={19} /></button>
        <div className="av2"><div className="av chat-avatar">{initials}</div><i /></div>
        <div className="chat-person"><b>{name}</b><div className="mut">{variant === "rider" ? "Customer · X-RIDER delivery" : "X-RIDER delivery"}</div></div>
      </div>
      <div className="cctx"><span>DELIVERY DETAILS</span><b>{context}</b></div>
      <div className="cmsgs">
        <div className="dsep">{variant === "rider" ? "Messages about this delivery" : "Delivery chat"}</div>
        {msgs.map((message, index) => {
          const previous = msgs[index - 1];
          const next = msgs[index + 1];
          const isOwnMessage = message.senderRole === variant;
          const first = previous?.senderRole !== message.senderRole;
          const last = next?.senderRole !== message.senderRole;
          return (
            <div
              key={message.id}
              className={`bub ${isOwnMessage ? "me chat-message--own" : "th chat-message--incoming"}${first ? " f" : ""}${last ? " l" : ""}`}
              data-sender={isOwnMessage ? "self" : "other"}
            >
              {message.text}
              {last && <div className="bt">{time(message.createdAt)}{isOwnMessage && <span className="tk"> ✓</span>}</div>}
            </div>
          );
        })}
        {loading && !msgs.length && <p className="chat-state">Loading conversation…</p>}
        {!loading && !msgs.length && !error && <p className="chat-state">No messages yet. Send a quick update to the customer.</p>}
        {error && <p role="alert" className="chat-error">{error}</p>}
        <div ref={end} />
      </div>
      <div className="cq">{quickMessages.map((quick) => <button key={quick} className="chip" disabled={busy} onClick={() => void send(quick)}>{quick}</button>)}</div>
      <div className="cin">
        <input
          aria-label="Message"
          placeholder="Write a message…"
          value={value}
          maxLength={1000}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void send(value); }}
        />
        <button disabled={!value.trim() || busy} onClick={() => void send(value)} aria-label="Send message"><Send size={18} /></button>
      </div>
    </div>
  );
}
