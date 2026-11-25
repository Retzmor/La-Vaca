import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { formatCOP } from "@/lib/formatters";
import { getPaymentMethodMeta } from "@/lib/payment-methods";
import { BrandMark } from "@/components/BrandMark";
import { LiveRoomClient } from "@/components/LiveRoomClient";
import type { Item, ItemClaim, Participant, Room } from "@/types/database";

export const dynamic = "force-dynamic";

interface RoomPageProps {
  params: Promise<{ slug: string }>;
}

function normalizeSlug(rawSlug: string): string {
  try {
    return decodeURIComponent(rawSlug).trim();
  } catch {
    return rawSlug.trim();
  }
}

async function fetchRoomBySlug(slug: string): Promise<Room | null> {
  if (!isSupabaseConfigured || !slug) return null;

  try {
    const { data: room, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("[sala/[slug]] Error consultando room en Supabase:", {
        slug,
        message: error.message,
        code: error.code,
      });
      return null;
    }

    return room ?? null;
  } catch (err) {
    console.error("[sala/[slug]] Excepción consultando room:", err);
    return null;
  }
}

async function fetchRoomRelations(roomId: string): Promise<{
  items: Item[];
  participants: Participant[];
  claims: ItemClaim[];
}> {
  try {
    const [itemsRes, participantsRes, claimsRes] = await Promise.all([
      supabase
        .from("items")
        .select("*")
        .eq("room_id", roomId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("participants")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true }),
      supabase.from("item_claims").select("*").eq("room_id", roomId),
    ]);

    if (itemsRes.error) {
      console.error("[sala/[slug]] Error consultando items:", itemsRes.error);
    }
    if (participantsRes.error) {
      console.error(
        "[sala/[slug]] Error consultando participants:",
        participantsRes.error
      );
    }
    if (claimsRes.error) {
      console.error(
        "[sala/[slug]] Error consultando item_claims:",
        claimsRes.error
      );
    }

    return {
      items: Array.isArray(itemsRes.data) ? itemsRes.data : [],
      participants: Array.isArray(participantsRes.data)
        ? participantsRes.data
        : [],
      claims: Array.isArray(claimsRes.data) ? claimsRes.data : [],
    };
  } catch (err) {
    console.error("[sala/[slug]] Excepción consultando relaciones:", err);
    return {
      items: [],
      participants: [],
      claims: [],
    };
  }
}

export async function generateMetadata({
  params,
}: RoomPageProps): Promise<Metadata> {
  try {
    const { slug: rawSlug } = await params;
    const slug = normalizeSlug(rawSlug);
    const room = await fetchRoomBySlug(slug);

    if (!room) {
      return {
        title: "Sala no encontrada",
        description:
          "Esta sala de La Vaca no existe o el enlace está incompleto.",
      };
    }

    const method = getPaymentMethodMeta(room.payment_method);
    const title = `Te invitaron a dividir: ${room.title}`;
    const description =
      room.mode === "fixed"
        ? `Vaca de ${formatCOP(room.total_amount)} · Entra sin registrarte y transfiere por ${method.label}.`
        : `Cuenta de ${formatCOP(room.total_amount)} · Toca lo que consumiste y paga fácil por ${method.label} sin registrarte.`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        locale: "es_CO",
        siteName: "La Vaca",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
      },
    };
  } catch (err) {
    console.error("[sala/[slug]] Error generando metadata:", err);
    return {
      title: "La Vaca — Divide cuentas en segundos",
      description:
        "Entra sin registrarte y divide la cuenta fácil por Nequi, Daviplata o llave Bre-B.",
    };
  }
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { slug: rawSlug } = await params;
  const slug = normalizeSlug(rawSlug);
  const room = await fetchRoomBySlug(slug);

  if (!room) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-center shadow-xs space-y-5">
          <div className="flex justify-center">
            <BrandMark compact />
          </div>

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-elevated)] text-[var(--ink-secondary)]">
            <SearchX className="h-7 w-7" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-extrabold text-[var(--ink-primary)]">
              No encontramos esta sala
            </h1>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              {!isSupabaseConfigured
                ? "Aún no están configuradas las credenciales de Supabase en este servidor."
                : "Puede que el enlace esté incompleto o que esta vaca ya haya sido eliminada."}
            </p>
          </div>

          <Link
            href="/"
            className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--accent-primary)] px-5 py-3 text-sm font-extrabold text-[var(--accent-on-primary)] hover:bg-[var(--accent-primary-hover)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Crear una nueva sala
          </Link>
        </div>
      </div>
    );
  }

  const { items, participants, claims } = await fetchRoomRelations(room.id);

  return (
    <LiveRoomClient
      initialRoom={room}
      initialItems={items}
      initialParticipants={participants}
      initialClaims={claims}
    />
  );
}
