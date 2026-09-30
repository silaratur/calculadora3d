const brlFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Valor em reais para a tela ("R$ 11,95", "−R$ 11,95"). O sinal é o menos
 * tipográfico (U+2212), não o hífen: depois de um hífen o navegador pode
 * quebrar a linha e deixava o "-" sozinho numa linha e o valor na outra.
 */
export function brl(value: number) {
  const text = brlFormatter.format(value);
  return text.replace(/^-/, "\u2212");
}
