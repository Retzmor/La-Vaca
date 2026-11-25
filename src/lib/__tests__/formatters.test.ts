import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatCOP,
  parseCOPInput,
  calculateParticipantBreakdown,
  calculateRoomSummary,
  getInitials,
} from "../formatters.ts";
import type { Item, ItemClaim, Participant, Room } from "../../types/database.ts";

describe("formatCOP", () => {
  it("formatea enteros a moneda colombiana sin decimales", () => {
    assert.equal(formatCOP(45000), "$ 45.000");
    assert.equal(formatCOP(0), "$ 0");
    assert.equal(formatCOP(1250000), "$ 1.250.000");
    assert.equal(formatCOP(999.6), "$ 1.000");
    assert.equal(formatCOP(-15000), "-$ 15.000");
  });
});

describe("parseCOPInput", () => {
  it("convierte cadenas con puntos de miles y símbolos colombianos a enteros", () => {
    assert.equal(parseCOPInput("$ 32.000"), 32000);
    assert.equal(parseCOPInput("32.000"), 32000);
    assert.equal(parseCOPInput("32.000,00"), 32000);
    assert.equal(parseCOPInput("1.250.000"), 1250000);
    assert.equal(parseCOPInput("45000"), 45000);
    assert.equal(parseCOPInput(""), 0);
  });
});

describe("calculateParticipantBreakdown — modo factura (receipt)", () => {
  const room: Pick<Room, "mode" | "total_amount" | "tax_amount" | "tip_amount"> = {
    mode: "receipt",
    total_amount: 118000,
    tax_amount: 8000, // 8% impoconsumo sobre 100.000
    tip_amount: 10000, // 10% propina voluntaria sobre 100.000
  };

  const items: Item[] = [
    {
      id: "i1",
      room_id: "r1",
      name: "Bandeja Paisa",
      price: 40000,
      quantity: 1,
      sort_order: 0,
      created_at: "",
    },
    {
      id: "i2",
      room_id: "r1",
      name: "Ajiaco",
      price: 30000,
      quantity: 1,
      sort_order: 1,
      created_at: "",
    },
    {
      id: "i3",
      room_id: "r1",
      name: "Picada compartida",
      price: 30000,
      quantity: 1,
      sort_order: 2,
      created_at: "",
    },
  ];

  const participants: Participant[] = [
    { id: "p1", room_id: "r1", name: "Camila", avatar_color: "#0B875B", has_paid: true, paid_at: null, created_at: "" },
    { id: "p2", room_id: "r1", name: "Andrés", avatar_color: "#1D4ED8", has_paid: false, paid_at: null, created_at: "" },
    { id: "p3", room_id: "r1", name: "Sofía", avatar_color: "#C026D3", has_paid: false, paid_at: null, created_at: "" },
  ];

  // p1 comió Bandeja (40k) + 1/3 Picada (10k) = 50k (50% del subtotal)
  // p2 comió Ajiaco (30k) + 1/3 Picada (10k) = 40k (40% del subtotal)
  // p3 comió 1/3 Picada (10k) = 10k (10% del subtotal)
  const claims: ItemClaim[] = [
    { id: "c1", room_id: "r1", item_id: "i1", participant_id: "p1", created_at: "" },
    { id: "c2", room_id: "r1", item_id: "i2", participant_id: "p2", created_at: "" },
    { id: "c3", room_id: "r1", item_id: "i3", participant_id: "p1", created_at: "" },
    { id: "c4", room_id: "r1", item_id: "i3", participant_id: "p2", created_at: "" },
    { id: "c5", room_id: "r1", item_id: "i3", participant_id: "p3", created_at: "" },
  ];

  it("divide ítems compartidos entre 3 y suma impuesto y propina proporcional", () => {
    const p1 = calculateParticipantBreakdown(room, items, claims, participants, "p1");
    assert.equal(p1.consumption, 50000);
    assert.equal(p1.tax, 4000);
    assert.equal(p1.tip, 5000);
    assert.equal(p1.total, 59000);

    const p2 = calculateParticipantBreakdown(room, items, claims, participants, "p2");
    assert.equal(p2.consumption, 40000);
    assert.equal(p2.tax, 3200);
    assert.equal(p2.tip, 4000);
    assert.equal(p2.total, 47200);

    const p3 = calculateParticipantBreakdown(room, items, claims, participants, "p3");
    assert.equal(p3.consumption, 10000);
    assert.equal(p3.tax, 800);
    assert.equal(p3.tip, 1000);
    assert.equal(p3.total, 11800);

    assert.equal(p1.total + p2.total + p3.total, 118000);
  });

  it("calcula correctamente el resumen de recaudación y faltantes", () => {
    const summary = calculateRoomSummary(room, items, claims, participants);
    assert.equal(summary.grandTotal, 118000);
    assert.equal(summary.unclaimedItemsCount, 0);
    assert.equal(summary.paidCount, 1);
    assert.equal(summary.collectedAmount, 59000);
    assert.equal(summary.pendingAmount, 59000);
  });
});

describe("calculateParticipantBreakdown — modo cuota fija (fixed)", () => {
  it("divide el total equitativamente entre los participantes", () => {
    const room: Pick<Room, "mode" | "total_amount" | "tax_amount" | "tip_amount"> = {
      mode: "fixed",
      total_amount: 120000,
      tax_amount: 0,
      tip_amount: 0,
    };
    const participants: Participant[] = [
      { id: "p1", room_id: "r2", name: "Mateo", avatar_color: "#0B875B", has_paid: true, paid_at: null, created_at: "" },
      { id: "p2", room_id: "r2", name: "Laura", avatar_color: "#1D4ED8", has_paid: false, paid_at: null, created_at: "" },
      { id: "p3", room_id: "r2", name: "Juan", avatar_color: "#C026D3", has_paid: false, paid_at: null, created_at: "" },
      { id: "p4", room_id: "r2", name: "Valeria", avatar_color: "#D97706", has_paid: false, paid_at: null, created_at: "" },
    ];

    const res = calculateParticipantBreakdown(room, [], [], participants, "p1");
    assert.equal(res.total, 30000);
    assert.equal(res.consumption, 30000);
    assert.equal(res.taxAndTip, 0);
  });
});

describe("getInitials", () => {
  it("genera iniciales legibles", () => {
    assert.equal(getInitials("Camila Gómez"), "CG");
    assert.equal(getInitials("Andrés"), "AN");
    assert.equal(getInitials("  "), "?");
  });
});
