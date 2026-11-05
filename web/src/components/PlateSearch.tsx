import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatPlate, isValidPlate, normalizePlate } from "../lib/format";
import { friendlyError } from "../lib/errors";

/** Busca por placa desenhada como placa Mercosul — ponto de partida de todo atendimento. */
export function PlateSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "notfound" | "error">("idle");
  const [msg, setMsg] = useState("");
  const navigate = useNavigate();
  const plate = normalizePlate(value);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isValidPlate(plate)) { setState("error"); setMsg("Placa incompleta. Ex.: ABC1234 ou ABC1D23."); return; }
    setState("busy");
    const { data, error } = await supabase.from("vehicles").select("id").eq("plate_normalized", plate).maybeSingle();
    if (error) { setState("error"); setMsg(friendlyError(error)); return; }
    if (data) { navigate(`/sistema/veiculos/${data.id}`); return; }
    setState("notfound");
  }

  return (
    <form className="plate-search" onSubmit={submit} role="search">
      <label htmlFor="plate-input" className="plate-search-label">Placa do veículo</label>
      <div className="plate-row">
        <div className="plate">
          <div className="plate-band" aria-hidden><span>BRASIL</span></div>
          <input
            id="plate-input"
            className="plate-input"
            value={value}
            onChange={(e) => { setValue(normalizePlate(e.target.value).slice(0, 7)); setState("idle"); }}
            placeholder="ABC1D23"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={8}
            autoFocus={autoFocus}
            aria-describedby="plate-msg"
          />
        </div>
        <button className="btn btn-primary btn-lg" disabled={state === "busy" || plate.length < 7}>
          {state === "busy" ? "Buscando…" : "Buscar"}
        </button>
      </div>
      <p className="plate-hint">Encontre o veículo para ver o histórico ou iniciar o check-in.</p>
      <div id="plate-msg" aria-live="polite">
        {state === "error" && <p className="field-error">{msg}</p>}
        {state === "notfound" && (
          <div className="plate-notfound">
            <p>Nenhum veículo com a placa <strong>{formatPlate(plate)}</strong>.</p>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`/sistema/clientes?placa=${plate}`)}>
              Cadastrar veículo com esta placa
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
