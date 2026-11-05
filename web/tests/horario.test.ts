import { openStatus } from "../src/site/SiteLayout";
import { feriados } from "../src/lib/oficina";
const cases: [string, string][] = [
  ["2026-10-27T10:00", "Aberto agora"],                                   // terça comum
  ["2026-12-25T10:00", "Fechado hoje (Natal), abre segunda"],
  ["2026-04-03T10:00", "Fechado hoje (Sexta-feira Santa), abre segunda"],
  ["2026-06-04T10:00", "Fechado hoje (Corpus Christi), abre amanhã"],
  ["2026-11-20T10:00", "Fechado hoje (Consciência Negra), abre segunda"],
  ["2026-12-24T19:00", "Fechado agora, abre segunda"],                    // 25 é Natal (sexta)
  ["2026-10-27T07:30", "Fechado agora, abre hoje"],
  ["2026-10-30T18:30", "Fechado agora, abre terça"],                      // sexta à noite; segunda 02/11 é Finados
  ["2026-10-23T18:30", "Fechado agora, abre segunda"],
];
let fail = 0;
for (const [d, exp] of cases) {
  const r = openStatus(new Date(d)).text;
  const ok = r.startsWith(exp);
  if (!ok) fail++;
  console.log(ok ? "OK  " : "FALHA", d, "→", r);
}
const f = feriados(2026);
console.log("Páscoa-derivados 2026:", Object.entries(f).filter(([, v]) => /Santa|Corpus/.test(v)));
process.exit(fail);
