import type { Item, ItemClaim, Participant, Room } from "@/types/database";

/**
 * Formatea un valor numérico a pesos colombianos (COP) sin decimales.
 * Ejemplo: 45000 -> "$ 45.000", 1250000 -> "$ 1.250.000"
 */
export function formatCOP(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "$ 0";
  }

  const rounded = Math.round(amount);
  const isNegative = rounded < 0;
  const absStr = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return isNegative ? `-$ ${absStr}` : `$ ${absStr}`;
}

/**
 * Formatea solo el valor entero con puntos de miles (útil para inputs numéricos).
 * Ejemplo: 45000 -> "45.000"
 */
export function formatCOPNumber(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return "";
  }
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Convierte cadenas de precios colombianos ("$ 32.000", "32.000,00", "32000") a entero COP.
 */
export function parseCOPInput(raw: string | number): number {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 0;
  }

  const trimmed = raw.trim().replace(/[^0-9.,]/g, "");
  if (!trimmed) return 0;

  // Caso con decimales de centavos al final tipo "32.000,00" o "32,000.00"
  let normalized = trimmed;
  if (/,\d{1,2}$/.test(normalized)) {
    normalized = normalized.replace(/,\d{1,2}$/, "");
  } else if (/\.\d{1,2}$/.test(normalized) && !/\.\d{3}$/.test(normalized)) {
    normalized = normalized.replace(/\.\d{1,2}$/, "");
  }

  const digitsOnly = normalized.replace(/[.,]/g, "");
  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export interface ClaimedItemShare {
  item: Item;
  sharedWithCount: number;
  shareAmount: number;
}

export interface ParticipantBreakdown {
  participantId: string;
  consumption: number;
  tax: number;
  tip: number;
  taxAndTip: number;
  total: number;
  proportion: number;
  claimedItems: ClaimedItemShare[];
}

export interface RoomFinancialSummary {
  itemsSubtotal: number;
  taxAmount: number;
  tipAmount: number;
  grandTotal: number;
  claimedSubtotal: number;
  unclaimedSubtotal: number;
  unclaimedItemsCount: number;
  paidCount: number;
  totalParticipants: number;
  collectedAmount: number;
  pendingAmount: number;
}

/**
 * Calcula el desglose exacto a pagar para un participante específico.
 * - En modo 'receipt': suma su cuota de cada ítem seleccionado (precio / # personas)
 *   + porcentaje proporcional de impuesto (impoconsumo/IVA) y propina.
 * - En modo 'fixed': divide el total_amount en partes iguales entre todos los participantes.
 */
export function calculateParticipantBreakdown(
  room: Pick<Room, "mode" | "total_amount" | "tax_amount" | "tip_amount">,
  items: Item[],
  claims: ItemClaim[],
  participants: Participant[],
  participantId: string
): ParticipantBreakdown {
  if (room.mode === "fixed") {
    const count = Math.max(participants.length, 1);
    const share = Math.round(room.total_amount / count);
    return {
      participantId,
      consumption: share,
      tax: 0,
      tip: 0,
      taxAndTip: 0,
      total: share,
      proportion: 1 / count,
      claimedItems: [],
    };
  }

  const billSubtotal = items.reduce((acc, item) => acc + Math.max(0, item.price), 0);

  // Agrupar reclamos por item_id para evitar O(n^2)
  const claimersByItem = new Map<string, Set<string>>();
  for (const claim of claims) {
    let set = claimersByItem.get(claim.item_id);
    if (!set) {
      set = new Set<string>();
      claimersByItem.set(claim.item_id, set);
    }
    set.add(claim.participant_id);
  }

  let exactConsumption = 0;
  const claimedItems: ClaimedItemShare[] = [];

  for (const item of items) {
    const claimers = claimersByItem.get(item.id);
    if (!claimers || !claimers.has(participantId)) {
      continue;
    }
    const sharedWithCount = claimers.size;
    const shareExact = item.price / sharedWithCount;
    exactConsumption += shareExact;
    claimedItems.push({
      item,
      sharedWithCount,
      shareAmount: Math.round(shareExact),
    });
  }

  const proportion =
    billSubtotal > 0 && exactConsumption > 0 ? exactConsumption / billSubtotal : 0;

  const exactTax = room.tax_amount * proportion;
  const exactTip = room.tip_amount * proportion;

  const consumption = Math.round(exactConsumption);
  const tax = Math.round(exactTax);
  const tip = Math.round(exactTip);
  const taxAndTip = tax + tip;
  const total = consumption + taxAndTip;

  return {
    participantId,
    consumption,
    tax,
    tip,
    taxAndTip,
    total,
    proportion,
    claimedItems,
  };
}

/**
 * Calcula un mapa de desgloses para todos los participantes de la sala.
 */
export function calculateAllBreakdowns(
  room: Pick<Room, "mode" | "total_amount" | "tax_amount" | "tip_amount">,
  items: Item[],
  claims: ItemClaim[],
  participants: Participant[]
): Map<string, ParticipantBreakdown> {
  const map = new Map<string, ParticipantBreakdown>();
  for (const participant of participants) {
    map.set(
      participant.id,
      calculateParticipantBreakdown(room, items, claims, participants, participant.id)
    );
  }
  return map;
}

/**
 * Calcula el resumen general de la sala (total cuenta, ítems sin reclamar, recaudado).
 */
export function calculateRoomSummary(
  room: Pick<Room, "mode" | "total_amount" | "tax_amount" | "tip_amount">,
  items: Item[],
  claims: ItemClaim[],
  participants: Participant[]
): RoomFinancialSummary {
  const breakdowns = calculateAllBreakdowns(room, items, claims, participants);
  const paidCount = participants.filter((p) => p.has_paid).length;

  let collectedAmount = 0;
  for (const p of participants) {
    if (p.has_paid) {
      collectedAmount += breakdowns.get(p.id)?.total ?? 0;
    }
  }

  if (room.mode === "fixed") {
    const grandTotal = Math.max(0, room.total_amount);
    return {
      itemsSubtotal: grandTotal,
      taxAmount: 0,
      tipAmount: 0,
      grandTotal,
      claimedSubtotal: grandTotal,
      unclaimedSubtotal: 0,
      unclaimedItemsCount: 0,
      paidCount,
      totalParticipants: participants.length,
      collectedAmount,
      pendingAmount: Math.max(0, grandTotal - collectedAmount),
    };
  }

  const itemsSubtotal = items.reduce((acc, item) => acc + Math.max(0, item.price), 0);
  const claimedItemIds = new Set(claims.map((c) => c.item_id));

  let claimedSubtotal = 0;
  let unclaimedSubtotal = 0;
  let unclaimedItemsCount = 0;

  for (const item of items) {
    if (claimedItemIds.has(item.id)) {
      claimedSubtotal += Math.max(0, item.price);
    } else {
      unclaimedSubtotal += Math.max(0, item.price);
      unclaimedItemsCount += 1;
    }
  }

  const grandTotal = itemsSubtotal + room.tax_amount + room.tip_amount;

  return {
    itemsSubtotal,
    taxAmount: room.tax_amount,
    tipAmount: room.tip_amount,
    grandTotal,
    claimedSubtotal,
    unclaimedSubtotal,
    unclaimedItemsCount,
    paidCount,
    totalParticipants: participants.length,
    collectedAmount,
    pendingAmount: Math.max(0, grandTotal - collectedAmount),
  };
}

/**
 * Obtiene las iniciales de un nombre (máximo 2 caracteres en mayúscula).
 */
export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const AVATAR_COLORS = [
  "#0B875B", // Esmeralda
  "#1D4ED8", // Azul Bre-B
  "#C026D3", // Fucsia vibrante
  "#D97706", // Ámbar cálido
  "#DC2626", // Rojo coral
  "#0F766E", // Petróleo
  "#4F46E5", // Índigo
  "#BE185D", // Frambuesa
  "#0369A1", // Cian profundo
  "#65A30D", // Lima oscura
] as const;

export function pickAvatarColor(seed: string | number): string {
  if (typeof seed === "number") {
    return AVATAR_COLORS[Math.abs(seed) % AVATAR_COLORS.length];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
