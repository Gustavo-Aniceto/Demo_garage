/** "abc-1d23" → "ABC1D23" (mesma regra do banco). */
export function normalizePlate(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/** Padrão antigo (AAA9999) e Mercosul (AAA9A99). */
export function isValidPlate(input: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(input));
}

/** Exibe placa antiga com hífen (ABC-1234) e Mercosul sem (ABC1D23). */
export function formatPlate(input: string): string {
  const p = normalizePlate(input);
  return /^[A-Z]{3}[0-9]{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

export function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** Máscara progressiva: (11) 90000-0000 / (11) 4765-3376 */
export function maskPhone(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(input: string): boolean {
  const n = onlyDigits(input).length;
  return n === 10 || n === 11;
}

export function maskCpf(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function isValidCpf(input: string): boolean {
  const c = onlyDigits(input);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

const dtf = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const df = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export const formatDateTime = (iso: string | null | undefined) => (iso ? dtf.format(new Date(iso)) : "—");
export const formatDate = (iso: string | null | undefined) => (iso ? df.format(new Date(iso)) : "—");

/** Senha temporária forte: 14 caracteres, com todas as classes exigidas. */
export function generateTempPassword(): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "@#$%&*!?"];
  const all = sets.join("");
  const rnd = (n: number) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const chars = sets.map((s) => s[rnd(s.length)]);
  while (chars.length < 14) chars.push(all[rnd(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export function passwordChecks(pw: string) {
  return [
    { ok: pw.length >= 10, label: "Pelo menos 10 caracteres" },
    { ok: /[A-Z]/.test(pw), label: "Uma letra maiúscula" },
    { ok: /[a-z]/.test(pw), label: "Uma letra minúscula" },
    { ok: /\d/.test(pw), label: "Um número" },
    { ok: /[^A-Za-z0-9]/.test(pw), label: "Um símbolo (ex.: @ # !)" },
  ];
}
