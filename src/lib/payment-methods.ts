import type { PaymentMethod } from "@/types/database";

export interface PaymentMethodMeta {
  id: PaymentMethod;
  label: string;
  shortLabel: string;
  placeholder: string;
  helperText: string;
  copyLabel: string;
  badgeClass: string;
  dotColor: string;
}

export const PAYMENT_METHODS: readonly PaymentMethodMeta[] = [
  {
    id: "bre-b",
    label: "Llave Bre-B",
    shortLabel: "Bre-B",
    placeholder: "Ej: @juanperez, 3101234567 o correo@mail.com",
    helperText: "Célular, correo, cédula o alias registrado en Bre-B.",
    copyLabel: "Copiar Llave Bre-B",
    badgeClass: "pm-badge-breb",
    dotColor: "#10B981",
  },
  {
    id: "nequi",
    label: "Nequi",
    shortLabel: "Nequi",
    placeholder: "Ej: 310 456 7890",
    helperText: "Tu número de celular asociado a Nequi.",
    copyLabel: "Copiar Nequi",
    badgeClass: "pm-badge-nequi",
    dotColor: "#DA0081",
  },
  {
    id: "daviplata",
    label: "Daviplata",
    shortLabel: "Daviplata",
    placeholder: "Ej: 315 987 6543",
    helperText: "Tu número de celular asociado a Daviplata.",
    copyLabel: "Copiar Daviplata",
    badgeClass: "pm-badge-daviplata",
    dotColor: "#ED1C27",
  },
  {
    id: "bancolombia",
    label: "Bancolombia",
    shortLabel: "Bancolombia",
    placeholder: "Ej: Ahorros 123-456789-01",
    helperText: "Número de cuenta de ahorros o corriente Bancolombia.",
    copyLabel: "Copiar Cuenta",
    badgeClass: "pm-badge-bancolombia",
    dotColor: "#EAB308",
  },
] as const;

export function getPaymentMethodMeta(method: PaymentMethod): PaymentMethodMeta {
  return (
    PAYMENT_METHODS.find((m) => m.id === method) ?? PAYMENT_METHODS[0]
  );
}
