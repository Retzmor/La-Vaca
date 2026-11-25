import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "La Vaca — Divide cuentas en segundos",
    template: "%s | La Vaca",
  },
  description:
    "Escanea la factura con IA o arma una vaca en segundos. Cada quien elige lo suyo y paga fácil por Nequi, Daviplata o llave Bre-B sin registrarse.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "La Vaca",
  },
  openGraph: {
    title: "La Vaca — Divide cuentas en Colombia sin enredos",
    description:
      "Escanea la factura o haz vaca con tus amigos. Cero registros, 1 toque para copiar Nequi, Daviplata o llave Bre-B.",
    type: "website",
    locale: "es_CO",
    siteName: "La Vaca",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0B0E0D",
};

const themeInitScript = `
  try {
    var savedTheme = localStorage.getItem("lavaca:theme");
    if (savedTheme === "light") {
      document.documentElement.dataset.theme = "light";
    }
  } catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es-CO"
      suppressHydrationWarning
      className={`${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased selection:bg-[#10B981]/25 selection:text-[var(--ink-primary)]">
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
      </body>
    </html>
  );
}
