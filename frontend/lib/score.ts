/**
 * Couleur d'une note /10 : rouge (mauvais) → ambre → vert (bon).
 * Interpolation linéaire entre les tokens DESIGN.md :
 *   0 → #FF716C (error)  ·  5 → #F59E0B (warning)  ·  10 → #00FC40 (success)
 * `null` → gris neutre (note absente).
 */
export function scoreColor(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '#5a5a5a';
  const v = Math.max(0, Math.min(10, value));
  const stops: { at: number; c: [number, number, number] }[] = [
    { at: 0, c: [0xff, 0x71, 0x6c] },
    { at: 5, c: [0xf5, 0x9e, 0x0b] },
    { at: 10, c: [0x00, 0xfc, 0x40] },
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (v >= stops[i].at && v <= stops[i + 1].at) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = hi.at === lo.at ? 0 : (v - lo.at) / (hi.at - lo.at);
  const ch = (i: number) => Math.round(lo.c[i] + (hi.c[i] - lo.c[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}
