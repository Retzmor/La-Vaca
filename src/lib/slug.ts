/**
 * Genera un slug corto, amigable para compartir por WhatsApp y resistente a colisiones.
 * Ejemplo: "Almuerzo viernes" -> "almuerzo-viernes-k7m2"
 */
export function generateRoomSlug(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 26)
    .replace(/-$/, "");

  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    suffix += alphabet[idx];
  }

  return base ? `${base}-${suffix}` : `vaca-${suffix}`;
}
