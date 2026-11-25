import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Database,
  Sparkles,
  HardDrive,
  Mail,
  Trash2,
} from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: {
    absolute: "Política de Privacidad — La Vaca",
  },
  description:
    "Política de Privacidad de La Vaca: qué datos recopilamos, cómo procesamos facturas con Google Gemini, sincronización con Supabase y eliminación de datos.",
};

const CONTACT_EMAIL = "soporte.lavaca@gmail.com";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh pb-14">
      <div className="mx-auto max-w-lg px-4 pt-5 sm:px-5 sm:pt-8 space-y-6">
        {/* Header superior */}
        <header className="flex items-center justify-between gap-2">
          <BrandMark compact />
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-1.5 text-xs font-bold text-[var(--ink-primary)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-ink)] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver al inicio
            </Link>
            <ThemeToggle />
          </div>
        </header>

        {/* Encabezado de documento */}
        <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-xs space-y-2.5 animate-fade-up">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[11px] font-bold text-[var(--accent-ink)]">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            Transparencia y Privacidad
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--ink-primary)] leading-tight">
            Política de Privacidad
          </h1>
          <p className="text-xs text-[var(--ink-secondary)] leading-relaxed">
            Última actualización: noviembre de 2026 · Aplicación{" "}
            <strong className="text-[var(--ink-primary)]">La Vaca</strong>{" "}
            (Colombia).
          </p>
        </section>

        {/* Contenido estructurado */}
        <main className="space-y-4">
          {/* 1. Responsable */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]">
              <Mail className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <h2>1. Responsable de la aplicación</h2>
            </div>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              <strong className="text-[var(--ink-primary)]">La Vaca</strong> es
              una aplicación web progresiva (PWA) desarrollada por{" "}
              <strong className="text-[var(--ink-primary)]">Erwin Salas</strong>{" "}
              para facilitar la división de cuentas de restaurantes, pedidos y
              cuotas fijas en Colombia sin exigir registro de usuarios.
            </p>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              Si tienes dudas sobre esta política o el manejo de tu información,
              puedes escribirnos a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="font-semibold text-[var(--accent-primary)] underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          {/* 2. Datos que recopilamos */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]">
              <Database className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <h2>2. Datos que recopilamos</h2>
            </div>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              No solicitamos contraseñas, cédulas obligatorias, correos
              personales ni datos bancarios privados (como claves o CVV). Solo
              tratamos la información que decides ingresar para usar una sala:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--ink-secondary)] leading-relaxed">
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Datos de la sala:
                </strong>{" "}
                nombre o título del plan (ej. &ldquo;Almuerzo viernes&rdquo;),
                modo de división y montos totales.
              </li>
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Listas de consumo:
                </strong>{" "}
                nombres de ítems, cantidades, valores en pesos colombianos (COP),
                impuestos y propinas.
              </li>
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Participantes:
                </strong>{" "}
                nombres o alias ingresados voluntariamente al unirse a la sala y
                su estado de pago (&ldquo;Pagado&rdquo; o &ldquo;Pendiente&rdquo;).
              </li>
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Medios de pago visibles para el grupo:
                </strong>{" "}
                el número o identificador ingresado por el organizador para
                recibir transferencias (Nequi, Daviplata, cuenta Bancolombia o
                llave Bre-B).
              </li>
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Imágenes de facturas:
                </strong>{" "}
                fotografías o capturas que subes temporalmente cuando usas el
                escáner automático.
              </li>
            </ul>
          </section>

          {/* 3. Uso de IA y terceros */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]">
              <Sparkles className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <h2>3. Inteligencia Artificial (Google Gemini) y terceros</h2>
            </div>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              Para ofrecer el escaneo automático y la colaboración en vivo,
              utilizamos dos proveedores tecnológicos bajo conexiones cifradas
              (HTTPS/TLS):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--ink-secondary)] leading-relaxed">
              <li>
                <strong className="text-[var(--ink-primary)]">
                  API de Google Gemini (OCR de facturas):
                </strong>{" "}
                cuando cargas la foto de una factura, la imagen comprimida se
                envía de forma cifrada a la API de Google Gemini únicamente para
                extraer los ítems, precios, impuestos y propina.{" "}
                <strong className="text-[var(--ink-primary)]">
                  No almacenamos las fotografías de tus facturas en nuestros
                  servidores ni en bases de datos
                </strong>
                , y el procesamiento mediante la API de Gemini no se usa para
                entrenar modelos con tus recibos.
              </li>
              <li>
                <strong className="text-[var(--ink-primary)]">
                  Supabase (Base de datos y tiempo real):
                </strong>{" "}
                los textos y valores de las salas, ítems y participantes se
                guardan y sincronizan en tiempo real a través de Supabase para
                que las personas que tengan el enlace compartido puedan ver y
                marcar lo que consumieron al instante.
              </li>
            </ul>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              La Vaca no vende información a terceros ni utiliza rastreadores
              publicitarios.
            </p>
          </section>

          {/* 4. Almacenamiento local y eliminación */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]">
              <HardDrive className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <h2>4. Almacenamiento local (localStorage)</h2>
            </div>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              Utilizamos el almacenamiento local del navegador (
              <code className="font-mono text-xs text-[var(--ink-primary)]">
                localStorage
              </code>
              ) exclusivamente para recordar tu participante dentro de cada sala
              que visitas (sin tener que volver a escribir tu nombre al
              recargar) y tu preferencia de tema oscuro o claro. Puedes borrar
              estos datos en cualquier momento desde la configuración de tu
              navegador o app.
            </p>
          </section>

          {/* 5. Eliminación de datos */}
          <section className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--ink-primary)]">
              <Trash2 className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
              <h2>5. Eliminación de salas y derechos del usuario</h2>
            </div>
            <p className="text-sm text-[var(--ink-secondary)] leading-relaxed">
              De acuerdo con la Ley 1581 de 2012 de Protección de Datos
              Personales en Colombia y los requisitos de Google Play, cualquier
              usuario u organizador puede solicitar la eliminación definitiva de
              una sala, sus ítems, medios de pago asociados o registros de
              participantes escribiendo a{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
                  "Solicitud de eliminación de datos — La Vaca"
                )}`}
                className="font-semibold text-[var(--accent-primary)] underline underline-offset-2"
              >
                {CONTACT_EMAIL}
              </a>{" "}
              e indicando el enlace o código de la sala. Atenderemos la
              solicitud en el menor tiempo posible.
            </p>
          </section>
        </main>

        {/* Footer */}
        <footer className="pt-2 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-2xl bg-[var(--accent-primary)] px-5 py-3 text-sm font-extrabold text-[var(--accent-on-primary)] hover:bg-[var(--accent-primary-hover)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a La Vaca
          </Link>
        </footer>
      </div>
    </div>
  );
}
