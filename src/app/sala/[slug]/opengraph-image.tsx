import { ImageResponse } from "next/og";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { formatCOP } from "@/lib/formatters";
import { getPaymentMethodMeta } from "@/lib/payment-methods";

export const runtime = "nodejs";
export const alt = "La Vaca — Te invitaron a dividir una cuenta";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  let title = "Divide tu cuenta en segundos";
  let totalLabel = "Sin registros";
  let methodLabel = "Bre-B · Nequi · Daviplata";
  let modeLabel = "La Vaca";

  try {
    const { slug: rawSlug } = await params;
    const slug = decodeURIComponent(rawSlug).trim();

    if (isSupabaseConfigured && slug) {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("title, total_amount, payment_method, mode")
        .eq("slug", slug)
        .maybeSingle();

      if (error) {
        console.error("[opengraph-image] Error consultando Supabase:", error);
      } else if (room) {
        title = room.title;
        totalLabel = formatCOP(room.total_amount);
        methodLabel = getPaymentMethodMeta(room.payment_method).label;
        modeLabel =
          room.mode === "fixed" ? "CUOTA FIJA / VACA" : "FACTURA POR ÍTEMS";
      }
    }
  } catch (err) {
    console.error("[opengraph-image] Excepción generando datos OG:", err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#F5F4EF",
          padding: "56px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "18px",
                backgroundColor: "#0B875B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
                fontSize: "34px",
                fontWeight: 800,
              }}
            >
              $
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "34px",
                  fontWeight: 800,
                  color: "#111513",
                  lineHeight: 1.05,
                }}
              >
                La Vaca
              </span>
              <span style={{ fontSize: "18px", color: "#4E5752" }}>
                Cuentas claras, amistad larga
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              backgroundColor: "#E5F6EE",
              color: "#064E35",
              padding: "12px 22px",
              borderRadius: "999px",
              fontSize: "20px",
              fontWeight: 700,
            }}
          >
            {modeLabel}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#FFFFFF",
            borderRadius: "32px",
            border: "2px solid #E3DFD4",
            padding: "44px",
            gap: "18px",
          }}
        >
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: "#0B875B",
            }}
          >
            Te invitaron a dividir:
          </span>
          <span
            style={{
              fontSize: "56px",
              fontWeight: 800,
              color: "#111513",
              lineHeight: 1.1,
            }}
          >
            {title}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "12px",
              paddingTop: "22px",
              borderTop: "2px dashed #CFC9BA",
            }}
          >
            <span
              style={{
                fontSize: "44px",
                fontWeight: 800,
                color: "#0B875B",
              }}
            >
              {totalLabel}
            </span>
            <span
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "#111513",
                backgroundColor: "#ECEAE2",
                padding: "10px 22px",
                borderRadius: "16px",
              }}
            >
              Paga con {methodLabel}
            </span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "22px",
            color: "#4E5752",
            fontWeight: 600,
          }}
        >
          <span>Sin contraseñas · Sin descargar apps</span>
          <span>1 toque para copiar llave y valor exacto</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
