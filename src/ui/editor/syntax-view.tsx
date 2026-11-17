// Coloured C++ text, used by the editor's colour layer and the code panel.
import type { ReactNode } from "react";
import { SYNTAX_CLASS, tokenizeCpp, type SyntaxToken } from "./cpp-syntax";

interface SyntaxViewProps {
  code: string;
  /** May replace how a token is drawn (the code panel adds glossary hints). */
  decorate?: (token: SyntaxToken, key: number) => ReactNode | undefined;
}

export function SyntaxView({ code, decorate }: SyntaxViewProps) {
  return tokenizeCpp(code).map((t, i) =>
    decorate?.(t, i) ?? (t.kind === "plain" ? t.text : <span key={i} className={SYNTAX_CLASS[t.kind]}>{t.text}</span>)
  );
}
