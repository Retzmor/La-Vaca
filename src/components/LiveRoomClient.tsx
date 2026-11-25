"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  MessageCircle,
  Plus,
  Receipt,
  RefreshCw,
  Users,
  AlertCircle,
  CheckCircle2,
  UserCheck,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  calculateAllBreakdowns,
  calculateRoomSummary,
  formatCOP,
  formatCOPNumber,
  getInitials,
  parseCOPInput,
  pickAvatarColor,
} from "@/lib/formatters";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { JoinRoomModal } from "@/components/JoinRoomModal";
import { PaymentCard } from "@/components/PaymentCard";
import { ParticipantStatus } from "@/components/ParticipantStatus";
import type {
  Item,
  ItemClaim,
  Participant,
  Room,
} from "@/types/database";

interface LiveRoomClientProps {
  initialRoom: Room;
  initialItems: Item[];
  initialParticipants: Participant[];
  initialClaims: ItemClaim[];
}

export function LiveRoomClient({
  initialRoom,
  initialItems,
  initialParticipants,
  initialClaims,
}: LiveRoomClientProps) {
  const [room, setRoom] = useState<Room>(initialRoom);
  const [items, setItems] = useState<Item[]>(initialItems);
  const [participants, setParticipants] =
    useState<Participant[]>(initialParticipants);
  const [claims, setClaims] = useState<ItemClaim[]>(initialClaims);

  const [currentParticipantId, setCurrentParticipantId] = useState<
    string | null
  >(null);
  const [identityChecked, setIdentityChecked] = useState(false);

  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "error"
  >("connecting");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUpdatingPaid, setIsUpdatingPaid] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState("");

  // Mini formulario opcional para agregar un ítem olvidado en vivo
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemPrice, setNewItemPrice] = useState(0);
  const [isAddingItem, setIsAddingItem] = useState(false);

  const storageKey = `lavaca:participant:${room.slug}`;

  // Obtener URL pública en navegador para compartir por WhatsApp
  useEffect(() => {
    setRoomUrl(window.location.href);
  }, []);

  // Recuperar identidad del participante desde localStorage
  useEffect(() => {
    try {
      const savedId = window.localStorage.getItem(storageKey);
      if (savedId && initialParticipants.some((p) => p.id === savedId)) {
        setCurrentParticipantId(savedId);
      }
    } catch {
      // Ignora restricciones de storage privado
    } finally {
      setIdentityChecked(true);
    }
  }, [storageKey, initialParticipants]);

  // Refresco completo manual o al reconectar
  const refetchRoomState = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [roomRes, itemsRes, participantsRes, claimsRes] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", room.id).single(),
        supabase
          .from("items")
          .select("*")
          .eq("room_id", room.id)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("participants")
          .select("*")
          .eq("room_id", room.id)
          .order("created_at", { ascending: true }),
        supabase.from("item_claims").select("*").eq("room_id", room.id),
      ]);

      if (roomRes.data) setRoom(roomRes.data);
      if (itemsRes.data) setItems(itemsRes.data);
      if (participantsRes.data) setParticipants(participantsRes.data);
      if (claimsRes.data) setClaims(claimsRes.data);
    } finally {
      setIsRefreshing(false);
    }
  }, [room.id]);

  // Suscripción Supabase Realtime a participants, item_claims, items y rooms
  useEffect(() => {
    const channel = supabase
      .channel(`lavaca-room-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "participants",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as Participant;
            setParticipants((prev) =>
              prev.some((p) => p.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Participant;
            setParticipants((prev) =>
              prev.map((p) => (p.id === updated.id ? updated : p))
            );
          } else if (payload.eventType === "DELETE") {
            const removed = payload.old as Partial<Participant>;
            if (removed.id) {
              setParticipants((prev) => prev.filter((p) => p.id !== removed.id));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "item_claims",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as ItemClaim;
            setClaims((prev) => {
              const exists = prev.some(
                (c) =>
                  c.id === incoming.id ||
                  (c.item_id === incoming.item_id &&
                    c.participant_id === incoming.participant_id)
              );
              if (exists) {
                return prev.map((c) =>
                  c.item_id === incoming.item_id &&
                  c.participant_id === incoming.participant_id
                    ? incoming
                    : c
                );
              }
              return [...prev, incoming];
            });
          } else if (payload.eventType === "DELETE") {
            const removed = payload.old as Partial<ItemClaim>;
            setClaims((prev) =>
              prev.filter((c) => {
                if (removed.id && c.id === removed.id) return false;
                if (
                  removed.item_id &&
                  removed.participant_id &&
                  c.item_id === removed.item_id &&
                  c.participant_id === removed.participant_id
                ) {
                  return false;
                }
                return true;
              })
            );
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "items",
          filter: `room_id=eq.${room.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const incoming = payload.new as Item;
            setItems((prev) =>
              prev.some((i) => i.id === incoming.id) ? prev : [...prev, incoming]
            );
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as Item;
            setItems((prev) =>
              prev.map((i) => (i.id === updated.id ? updated : i))
            );
          } else if (payload.eventType === "DELETE") {
            const removed = payload.old as Partial<Item>;
            if (removed.id) {
              setItems((prev) => prev.filter((i) => i.id !== removed.id));
            }
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          setRoom(payload.new as Room);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setRealtimeStatus("error");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room.id]);

  // Cálculos financieros derivados
  const participantById = useMemo(() => {
    const map = new Map<string, Participant>();
    for (const p of participants) {
      map.set(p.id, p);
    }
    return map;
  }, [participants]);

  const currentParticipant = currentParticipantId
    ? participantById.get(currentParticipantId) ?? null
    : null;

  const claimsByItemId = useMemo(() => {
    const map = new Map<string, ItemClaim[]>();
    for (const claim of claims) {
      const list = map.get(claim.item_id) ?? [];
      list.push(claim);
      map.set(claim.item_id, list);
    }
    return map;
  }, [claims]);

  const breakdowns = useMemo(
    () => calculateAllBreakdowns(room, items, claims, participants),
    [room, items, claims, participants]
  );

  const summary = useMemo(
    () => calculateRoomSummary(room, items, claims, participants),
    [room, items, claims, participants]
  );

  const myBreakdown = currentParticipantId
    ? breakdowns.get(currentParticipantId) ?? null
    : null;

  // Unirse como nuevo participante
  async function handleJoinNew(name: string) {
    const { data, error } = await supabase
      .from("participants")
      .insert({
        room_id: room.id,
        name,
        avatar_color: pickAvatarColor(`${name}-${participants.length}`),
        has_paid: false,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(
        error?.message || "No pudimos registrarte en la sala. Intenta de nuevo."
      );
    }

    setParticipants((prev) =>
      prev.some((p) => p.id === data.id) ? prev : [...prev, data]
    );
    setCurrentParticipantId(data.id);
    try {
      window.localStorage.setItem(storageKey, data.id);
    } catch {
      // Ignora storage bloqueado
    }
  }

  function handleSelectExistingParticipant(participant: Participant) {
    setCurrentParticipantId(participant.id);
    try {
      window.localStorage.setItem(storageKey, participant.id);
    } catch {
      // Ignora storage bloqueado
    }
  }

  function handleSwitchIdentity() {
    setCurrentParticipantId(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Ignora
    }
  }

  // Tocar un ítem para reclamarlo / soltarlo con actualización optimista
  async function handleToggleClaim(item: Item) {
    if (!currentParticipantId) return;
    setActionError(null);

    const existing = claims.find(
      (c) => c.item_id === item.id && c.participant_id === currentParticipantId
    );

    if (existing) {
      // Quitar reclamo (optimista)
      setClaims((prev) => prev.filter((c) => c.id !== existing.id));

      const { error } = await supabase
        .from("item_claims")
        .delete()
        .eq("item_id", item.id)
        .eq("participant_id", currentParticipantId);

      if (error) {
        // Revertir
        setClaims((prev) => [...prev, existing]);
        setActionError("No pudimos actualizar tu selección. Revisa tu conexión.");
      }
    } else {
      // Agregar reclamo (optimista)
      const tempId = `temp-${item.id}-${currentParticipantId}`;
      const optimistic: ItemClaim = {
        id: tempId,
        room_id: room.id,
        item_id: item.id,
        participant_id: currentParticipantId,
        created_at: new Date().toISOString(),
      };
      setClaims((prev) => [...prev, optimistic]);

      const { data, error } = await supabase
        .from("item_claims")
        .insert({
          room_id: room.id,
          item_id: item.id,
          participant_id: currentParticipantId,
        })
        .select("*")
        .single();

      if (error) {
        // Si ya existía por doble toque (23505), refrescamos; si no, revertimos
        if (error.code === "23505") {
          void refetchRoomState();
        } else {
          setClaims((prev) => prev.filter((c) => c.id !== tempId));
          setActionError("No pudimos guardar tu selección. Intenta de nuevo.");
        }
      } else if (data) {
        setClaims((prev) =>
          prev.map((c) => (c.id === tempId ? data : c))
        );
      }
    }
  }

  // Marcar como pagado / deshacer
  async function handleTogglePaid(nextPaid: boolean) {
    if (!currentParticipantId) return;
    setIsUpdatingPaid(true);
    setActionError(null);

    const paidAt = nextPaid ? new Date().toISOString() : null;

    setParticipants((prev) =>
      prev.map((p) =>
        p.id === currentParticipantId
          ? { ...p, has_paid: nextPaid, paid_at: paidAt }
          : p
      )
    );

    const { error } = await supabase
      .from("participants")
      .update({ has_paid: nextPaid, paid_at: paidAt })
      .eq("id", currentParticipantId);

    if (error) {
      setParticipants((prev) =>
        prev.map((p) =>
          p.id === currentParticipantId ? { ...p, has_paid: !nextPaid } : p
        )
      );
      setActionError("No pudimos actualizar tu estado de pago. Intenta de nuevo.");
    }

    setIsUpdatingPaid(false);
  }

  // Agregar un ítem olvidado directamente en la sala en vivo
  async function handleAddMissingItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleanName = newItemName.trim();
    if (!cleanName || newItemPrice <= 0) return;

    setIsAddingItem(true);
    setActionError(null);

    const { data, error } = await supabase
      .from("items")
      .insert({
        room_id: room.id,
        name: cleanName,
        price: newItemPrice,
        quantity: 1,
        sort_order: items.length,
      })
      .select("*")
      .single();

    if (error || !data) {
      setActionError("No pudimos agregar el ítem. Intenta de nuevo.");
      setIsAddingItem(false);
      return;
    }

    const nextTotal =
      items.reduce((acc, i) => acc + i.price, 0) +
      data.price +
      room.tax_amount +
      room.tip_amount;

    await supabase
      .from("rooms")
      .update({ total_amount: nextTotal })
      .eq("id", room.id);

    setItems((prev) =>
      prev.some((i) => i.id === data.id) ? prev : [...prev, data]
    );
    setRoom((prev) => ({ ...prev, total_amount: nextTotal }));
    setNewItemName("");
    setNewItemPrice(0);
    setShowAddItem(false);
    setIsAddingItem(false);
  }

  // Enlace WhatsApp
  const whatsappHref = useMemo(() => {
    const shareUrl = roomUrl || "";
    const message =
      room.mode === "fixed"
        ? `¡Hey! Armamos vaca para "${room.title}" (${formatCOP(room.total_amount)}) en La Vaca.\n\nEntra aquí sin registrarte para ver tu cuota y transferir:\n${shareUrl}`
        : `¡Hey! Te invitaron a dividir "${room.title}" (${formatCOP(summary.grandTotal)}) en La Vaca.\n\nEntra aquí sin registrarte, marca lo que consumiste y paga fácil:\n${shareUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }, [room.mode, room.title, room.total_amount, summary.grandTotal, roomUrl]);

  async function handleCopyRoomLink() {
    if (!roomUrl) return;
    try {
      await navigator.clipboard.writeText(roomUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback silencioso
    }
  }

  const showJoinModal = identityChecked && !currentParticipant;

  return (
    <div className="min-h-dvh pb-14">
      {showJoinModal && (
        <JoinRoomModal
          roomTitle={room.title}
          existingParticipants={participants}
          onJoinNew={handleJoinNew}
          onSelectExisting={handleSelectExistingParticipant}
        />
      )}

      <div className="mx-auto max-w-lg px-4 pt-4 sm:px-5 sm:pt-6 space-y-5">
        {/* Barra superior */}
        <header className="flex items-center justify-between gap-2">
          <BrandMark compact />

          <div className="flex items-center gap-2">
            {/* Indicador Realtime */}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold border ${
                realtimeStatus === "connected"
                  ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                  : realtimeStatus === "error"
                  ? "border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] text-[var(--badge-amber-ink)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--ink-secondary)]"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  realtimeStatus === "connected"
                    ? "bg-[var(--accent-primary)] animate-pulse"
                    : realtimeStatus === "error"
                    ? "bg-amber-400"
                    : "bg-[var(--ink-muted)]"
                }`}
              />
              {realtimeStatus === "connected"
                ? "En vivo"
                : realtimeStatus === "error"
                ? "Sin señal"
                : "Conectando"}
            </span>

            <button
              type="button"
              onClick={() => void refetchRoomState()}
              disabled={isRefreshing}
              aria-label="Actualizar datos de la sala"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)] transition-colors"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>

            <ThemeToggle />
          </div>
        </header>

        {/* Encabezado de la sala + CTA destacado de WhatsApp */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-4 animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-bold text-[var(--ink-secondary)] mb-2">
                {room.mode === "receipt" ? (
                  <>
                    <Receipt className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    Factura por ítems
                  </>
                ) : (
                  <>
                    <Users className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    Cuota Fija / Vaca
                  </>
                )}
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink-primary)] leading-tight break-words">
                {room.title}
              </h1>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Total
              </p>
              <p className="font-money text-lg font-extrabold text-[var(--ink-primary)]">
                {formatCOP(summary.grandTotal)}
              </p>
            </div>
          </div>

          {/* Identidad actual */}
          {currentParticipant && (
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-3.5 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white ring-1 ring-white/20"
                  style={{ backgroundColor: currentParticipant.avatar_color }}
                >
                  {getInitials(currentParticipant.name)}
                </span>
                <span className="text-xs text-[var(--ink-secondary)] truncate">
                  Participando como{" "}
                  <strong className="font-bold text-[var(--ink-primary)]">
                    {currentParticipant.name}
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleSwitchIdentity}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--accent-ink)] hover:underline"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Cambiar
              </button>
            </div>
          )}

          {/* Botón superior destacado: Compartir enlace por WhatsApp */}
          <div className="flex items-center gap-2">
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[50px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-[#081C10] shadow-md shadow-[#25D366]/20 hover:bg-[#1EBE5B] active:scale-[0.985] transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/35"
            >
              <MessageCircle className="h-5 w-5 shrink-0 stroke-[2.25]" />
              Compartir enlace por WhatsApp
            </a>

            <button
              type="button"
              onClick={handleCopyRoomLink}
              aria-label="Copiar enlace de la sala"
              className="min-h-[50px] min-w-[50px] inline-flex items-center justify-center rounded-2xl border-2 border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--ink-primary)] hover:border-[var(--border-strong)] active:scale-95 transition-all"
              title="Copiar enlace"
            >
              {copiedLink ? (
                <Check className="h-5 w-5 text-[var(--accent-primary)]" />
              ) : (
                <Copy className="h-5 w-5" />
              )}
            </button>
          </div>
        </section>

        {/* Mensaje de error en acciones */}
        {actionError && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--badge-danger-border)] bg-[var(--badge-danger-bg)] px-4 py-3 text-xs font-semibold text-[var(--badge-danger-ink)] flex items-center gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* MODO FACTURA: Lista interactiva de ítems */}
        {room.mode === "receipt" ? (
          <section
            aria-label="Ítems de la factura"
            className="space-y-3"
          >
            <div className="flex items-end justify-between gap-2 px-1">
              <div>
                <h2 className="text-base font-extrabold tracking-tight text-[var(--ink-primary)]">
                  Toca lo que consumiste
                </h2>
                <p className="text-xs text-[var(--ink-secondary)]">
                  Si varios tocan el mismo ítem, se divide en partes iguales.
                </p>
              </div>
              {summary.unclaimedItemsCount > 0 ? (
                <span className="shrink-0 rounded-full border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--badge-amber-ink)]">
                  {summary.unclaimedItemsCount} sin dueño
                </span>
              ) : (
                items.length > 0 && (
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--accent-ink)]">
                    <CheckCircle2 className="h-3 w-3 text-[var(--accent-primary)]" />
                    Todo asignado
                  </span>
                )
              )}
            </div>

            {summary.unclaimedItemsCount > 0 && (
              <div className="rounded-2xl border border-[var(--badge-amber-border)] bg-[var(--badge-amber-bg)] px-3.5 py-2.5 text-xs text-[var(--badge-amber-ink)] flex items-center justify-between gap-2">
                <span>
                  Faltan{" "}
                  <strong>
                    {summary.unclaimedItemsCount}{" "}
                    {summary.unclaimedItemsCount === 1 ? "ítem" : "ítems"}
                  </strong>{" "}
                  por reclamar
                </span>
                <span className="font-money font-bold">
                  {formatCOP(summary.unclaimedSubtotal)}
                </span>
              </div>
            )}

            <div className="space-y-2.5">
              {items.map((item) => {
                const itemClaims = claimsByItemId.get(item.id) ?? [];
                const claimers = itemClaims
                  .map((c) => participantById.get(c.participant_id))
                  .filter((p): p is Participant => Boolean(p));

                const isSelectedByMe = Boolean(
                  currentParticipantId &&
                    itemClaims.some(
                      (c) => c.participant_id === currentParticipantId
                    )
                );

                const shareCount = claimers.length;
                const splitAmount =
                  shareCount > 0 ? Math.round(item.price / shareCount) : item.price;

                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!currentParticipantId}
                    onClick={() => void handleToggleClaim(item)}
                    aria-pressed={isSelectedByMe}
                    className={`w-full text-left rounded-2xl border-2 p-4 transition-all active:scale-[0.985] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] ${
                      isSelectedByMe
                        ? "border-[#10B981] bg-[rgba(16,185,129,0.14)] shadow-xs"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Check visual */}
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                            isSelectedByMe
                              ? "border-[#10B981] bg-[#10B981] text-[#041F15]"
                              : "border-[var(--border-strong)] bg-[var(--bg-elevated)] text-transparent"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {item.quantity > 1 && (
                              <span className="rounded-md bg-[var(--pill-active-bg)] px-1.5 py-0.5 font-money text-[11px] font-bold text-[var(--pill-active-ink)]">
                                {item.quantity}x
                              </span>
                            )}
                            <span className="text-[15px] font-bold text-[var(--ink-primary)] leading-snug break-words">
                              {item.name}
                            </span>
                          </div>

                          {shareCount > 1 ? (
                            <p className="mt-1 text-xs font-semibold text-[var(--accent-ink)]">
                              Compartido entre {shareCount} ·{" "}
                              <span className="font-money font-bold">
                                {formatCOP(splitAmount)} c/u
                              </span>
                            </p>
                          ) : shareCount === 0 ? (
                            <p className="mt-1 text-xs text-[var(--ink-muted)]">
                              Sin reclamar · Toca si fue tuyo
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-money text-[15px] font-extrabold text-[var(--ink-primary)]">
                          {formatCOP(item.price)}
                        </span>
                      </div>
                    </div>

                    {/* Avatares / iniciales de quienes comparten este ítem */}
                    {claimers.length > 0 && (
                      <div className="mt-3 pl-9 flex flex-wrap items-center gap-1.5">
                        {claimers.map((claimer) => (
                          <span
                            key={claimer.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chip-bg)] border border-[var(--chip-border)] pl-1 pr-2.5 py-0.5 text-[11px] font-semibold text-[var(--ink-primary)] shadow-2xs"
                          >
                            <span
                              className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-extrabold text-white ring-1 ring-white/20"
                              style={{ backgroundColor: claimer.avatar_color }}
                            >
                              {getInitials(claimer.name)}
                            </span>
                            <span className="max-w-[90px] truncate">
                              {claimer.id === currentParticipantId
                                ? "Tú"
                                : claimer.name}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Opción rápida para añadir un ítem olvidado en la mesa */}
            {!showAddItem ? (
              <button
                type="button"
                onClick={() => setShowAddItem(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] py-3 text-xs font-bold text-[var(--ink-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-ink)] transition-colors"
              >
                <Plus className="h-4 w-4" />
                ¿Faltó algún ítem en la cuenta? Agrégalo aquí
              </button>
            ) : (
              <form
                onSubmit={handleAddMissingItem}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-3 animate-fade-up"
              >
                <p className="text-xs font-bold text-[var(--ink-primary)]">
                  Agregar ítem adicional
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                  <input
                    type="text"
                    required
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    placeholder="Nombre del producto"
                    className="sm:col-span-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 text-sm font-medium text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <div className="sm:col-span-2 flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2.5 focus-within:border-[var(--accent-primary)]">
                    <span className="font-money text-xs text-[var(--ink-muted)] mr-1">
                      $
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      required
                      value={formatCOPNumber(newItemPrice)}
                      onChange={(e) =>
                        setNewItemPrice(parseCOPInput(e.target.value))
                      }
                      placeholder="15.000"
                      className="w-full bg-transparent font-money text-sm font-bold text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] text-right focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddItem(false)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--ink-secondary)] hover:bg-[var(--bg-elevated)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingItem}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-xs font-extrabold text-[var(--accent-on-primary)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-60"
                  >
                    {isAddingItem ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5" />
                    )}
                    Guardar ítem
                  </button>
                </div>
              </form>
            )}
          </section>
        ) : (
          /* MODO CUOTA FIJA / VACA */
          <section
            aria-label="Resumen de cuota fija"
            className="rounded-3xl border border-[var(--accent-border)] bg-[var(--accent-soft)] p-5 text-center space-y-2"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent-ink)]">
              Cuota por persona en este momento
            </p>
            <p className="font-money text-4xl font-extrabold text-[var(--accent-primary)]">
              {formatCOP(
                Math.round(room.total_amount / Math.max(participants.length, 1))
              )}
            </p>
            <p className="text-xs text-[var(--ink-secondary)]">
              Total de{" "}
              <strong className="font-money text-[var(--ink-primary)]">
                {formatCOP(room.total_amount)}
              </strong>{" "}
              dividido en partes iguales entre{" "}
              <strong className="text-[var(--ink-primary)]">
                {Math.max(participants.length, 1)}{" "}
                {Math.max(participants.length, 1) === 1
                  ? "participante"
                  : "participantes"}
              </strong>
              .
            </p>
          </section>
        )}

        {/* Tarjeta de Liquidación Personal */}
        <PaymentCard
          room={room}
          currentParticipant={currentParticipant}
          breakdown={myBreakdown}
          totalParticipants={participants.length}
          isUpdatingPaid={isUpdatingPaid}
          onTogglePaid={handleTogglePaid}
        />

        {/* Lista Pública de Estado de Pagos */}
        <ParticipantStatus
          mode={room.mode}
          participants={participants}
          currentParticipantId={currentParticipantId}
          breakdowns={breakdowns}
          summary={summary}
        />

        {/* Footer */}
        <footer className="pt-2 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--ink-secondary)] hover:text-[var(--accent-primary)] transition-colors"
          >
            ¿Otro plan? Crear una nueva Vaca →
          </Link>
        </footer>
      </div>
    </div>
  );
}
