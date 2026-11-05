import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { useId } from "react";

interface Wrap { label: string; hint?: ReactNode; error?: string | null }

export function TextField({ label, hint, error, ...rest }: Wrap & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}{rest.required && <span className="req" aria-hidden> *</span>}</label>
      <input id={id} aria-invalid={!!error} aria-describedby={`${id}-h`} {...rest} />
      {(error || hint) && <p id={`${id}-h`} className={error ? "field-error" : "field-hint"}>{error || hint}</p>}
    </div>
  );
}

export function SelectField({ label, hint, error, children, ...rest }: Wrap & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} {...rest}>{children}</select>
      {(error || hint) && <p className={error ? "field-error" : "field-hint"}>{error || hint}</p>}
    </div>
  );
}

export function TextArea({ label, hint, error, ...rest }: Wrap & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={3} {...rest} />
      {(error || hint) && <p className={error ? "field-error" : "field-hint"}>{error || hint}</p>}
    </div>
  );
}
