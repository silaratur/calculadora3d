/**
 * Cálculo de custo e preço da operação, em um só lugar.
 *
 * Antes disto a calculadora tinha a conta completa inline em `/calculator`, o
 * catálogo tinha uma soma própria e a venda não calculava nada. As três telas
 * agora usam as funções daqui, então mudar uma regra de preço muda o sistema
 * inteiro.
 */

export type PricingSettingsLike = {
  energyRate: number;
  defaultPowerWatts: number;
  laborRate: number;
  monthlyRent: number;
  monthlySubscriptions: number;
  monthlyMaintenance: number;
  monthlyOtherCosts: number;
  monthlyPieces: number;
  defaultMarkup: number;
  defaultLossRate: number;
};

export type ChannelFees = {
  commissionRate: number;
  fixedFee: number;
  adsRate: number;
};

export const noChannelFees: ChannelFees = { commissionRate: 0, fixedFee: 0, adsRate: 0 };

/**
 * Custo fixo mensal rateado pelo número de peças produzidas por mês. Se o mês
 * corrente já foi lançado em Custos Fixos (`monthlyTotalOverride`), usa o
 * total de lá; senão cai nos 4 campos antigos de `PricingSettings`.
 */
export function fixedCostPerPiece(settings: PricingSettingsLike, monthlyTotalOverride?: number) {
  const monthly =
    monthlyTotalOverride ??
    settings.monthlyRent + settings.monthlySubscriptions + settings.monthlyMaintenance + settings.monthlyOtherCosts;
  return monthly / Math.max(settings.monthlyPieces, 1);
}

export type PieceCostInput = {
  weightGrams: number;
  /** Preço do rolo inteiro; caia para o custo por kg quando não houver. */
  materialUnitPrice: number;
  /** Peso do rolo em gramas (1000 para 1kg). */
  materialUnitWeightGrams: number;
  /**
   * Quando informado, ignora weightGrams/materialUnitPrice/materialUnitWeightGrams
   * e usa este valor direto como custo de filamento — para produtos multi-material
   * (Catálogo Novo), cujo custo já vem somado de `calculateMultiMaterialCost`.
   */
  filamentCostOverride?: number;
  printTimeHours: number;
  /** Mão de obra de preparo e de limpeza, em minutos, fora do tempo de máquina. */
  prepMinutes?: number;
  cleanupMinutes?: number;
  laborRatePerHour: number;
  energyRatePerKwh: number;
  powerWatts: number;
  printerPurchasePrice?: number;
  printerUsefulLifeHours?: number;
  printerMaintenancePerHour?: number;
  /** Soma dos insumos usados na peça (argolas, embalagem, ímãs...). */
  suppliesCost?: number;
  fixedCostPerPiece?: number;
  lossRatePercent?: number;
};

export type PieceCost = {
  /** Horas de máquina. */
  printTimeHours: number;
  /** Horas de trabalho humano (preparo + limpeza/pós-processamento — impressão é hora máquina, não mão de obra). */
  laborHours: number;
  filament: number;
  labor: number;
  energy: number;
  /** Depreciação da impressora + manutenção, proporcional ao tempo de impressão. */
  machine: number;
  supplies: number;
  fixedCosts: number;
  /** Soma antes da reserva para perdas. */
  base: number;
  /** Reserva para refugo/reimpressão. */
  reserve: number;
  /** Custo unitário final da peça. */
  total: number;
};

/** Custo de uma linha de material: gramas usadas × preço proporcional ao peso do rolo. */
export function materialLineCost(material: { unitPrice: number; unitWeightGrams: number }, grams: number) {
  return (grams / (material.unitWeightGrams || 1000)) * material.unitPrice;
}

/**
 * Soma o custo de filamento de um produto multi-material: uma linha por
 * material usado, cada uma com suas próprias gramas. Usado tanto no preview
 * do formulário do Catálogo quanto no cálculo autoritativo da API — mesma
 * fórmula nos dois lados.
 */
export function calculateMultiMaterialCost(lines: { grams: number; material: { unitPrice: number; unitWeightGrams: number } }[]) {
  return lines.reduce((sum, line) => sum + materialLineCost(line.material, line.grams), 0);
}

export function calculatePieceCost(input: PieceCostInput): PieceCost {
  const printTimeHours = Math.max(input.printTimeHours, 0);
  // Impressão é hora máquina (linha `machine`, depreciação+manutenção) — mão
  // de obra é só o tempo de gente trabalhando: fatiamento/preparo e
  // limpeza/pós-processamento.
  const laborHours = (input.prepMinutes ?? 0) / 60 + (input.cleanupMinutes ?? 0) / 60;

  const rollWeight = input.materialUnitWeightGrams || 1000;
  const filament = input.filamentCostOverride ?? (input.weightGrams / rollWeight) * input.materialUnitPrice;
  const labor = laborHours * input.laborRatePerHour;
  const energy = (input.powerWatts / 1000) * printTimeHours * input.energyRatePerKwh;

  const depreciationPerHour = input.printerUsefulLifeHours
    ? (input.printerPurchasePrice ?? 0) / input.printerUsefulLifeHours
    : 0;
  const machine = (depreciationPerHour + (input.printerMaintenancePerHour ?? 0)) * printTimeHours;

  const supplies = input.suppliesCost ?? 0;
  const fixedCosts = input.fixedCostPerPiece ?? 0;

  const base = filament + labor + energy + machine + supplies + fixedCosts;
  const reserve = (base * (input.lossRatePercent ?? 0)) / 100;

  return {
    printTimeHours,
    laborHours,
    filament,
    labor,
    energy,
    machine,
    supplies,
    fixedCosts,
    base,
    reserve,
    total: base + reserve,
  };
}

export type PricingMethod = "markup" | "margin";

export type SuggestedPriceInput = {
  unitCost: number;
  /** Markup (% sobre o custo) ou margem (% sobre o preço final), conforme `method`. */
  markupPercent: number;
  channel?: ChannelFees;
  /** Desconto aplicado por unidade depois de embutir as taxas. */
  discountPerUnit?: number;
  /** "markup" (padrão) multiplica o custo; "margin" garante que o lucro seja X% do preço final. */
  method?: PricingMethod;
};

export type SuggestedPrice = {
  /** Preço que cobre o custo e as taxas, sem lucro. */
  minimum: number;
  /** Preço com o markup/margem cheios, antes de desconto. */
  suggested: number;
  /** O que de fato seria cobrado, após desconto. */
  final: number;
  /** Quanto das taxas do canal está embutido no preço sugerido. */
  channelFees: number;
};

/** Custo × (1+markup) no modo markup; custo ÷ (1-margem) no modo margem — a mesma % do slider, duas leituras. */
function priceBeforeFees(unitCost: number, percent: number, method: PricingMethod) {
  if (method === "margin") {
    const marginFraction = Math.min(Math.max(percent / 100, 0), 0.95);
    return unitCost / (1 - marginFraction);
  }
  return unitCost * (1 + percent / 100);
}

/**
 * Embute as taxas do canal no preço em vez de descontá-las depois: dividir por
 * (1 - comissão - ads) é o que garante que a margem sobre o líquido seja a
 * pretendida, e não menor.
 */
export function calculateSuggestedPrice({
  unitCost,
  markupPercent,
  channel = noChannelFees,
  discountPerUnit = 0,
  method = "markup",
}: SuggestedPriceInput): SuggestedPrice {
  const takeRate = Math.max(1 - channel.commissionRate - channel.adsRate, 0.01);
  const gross = (value: number) => (value + channel.fixedFee) / takeRate;

  const minimum = gross(unitCost);
  const suggested = gross(priceBeforeFees(unitCost, markupPercent, method));

  return {
    minimum,
    suggested,
    final: Math.max(suggested - discountPerUnit, 0),
    channelFees: suggested - unitCost * (1 + markupPercent / 100),
  };
}

export type OrderMetricsInput = {
  quantity: number;
  /** Preço praticado por unidade. */
  unitPrice: number;
  /** Custo unitário congelado na data da venda. */
  unitCost: number;
  discountPerUnit?: number;
  /** Taxa de marketplace por unidade, em reais. */
  marketplaceFee?: number;
  /** Frete pago pela empresa, valor total do pedido. */
  shippingCost?: number;
  /** Horas de impressão por unidade. */
  printTimeHours?: number;
};

export type OrderMetrics = {
  grossRevenue: number;
  discountTotal: number;
  feesTotal: number;
  netRevenue: number;
  totalCost: number;
  profitTotal: number;
  profitPerUnit: number;
  /** Margem sobre o faturamento líquido. */
  marginPercent: number;
  totalPrintHours: number;
  /** A métrica que decide se vale ocupar a impressora. */
  profitPerHour: number;
};

export function calculateOrderMetrics({
  quantity,
  unitPrice,
  unitCost,
  discountPerUnit = 0,
  marketplaceFee = 0,
  shippingCost = 0,
  printTimeHours = 0,
}: OrderMetricsInput): OrderMetrics {
  const qty = Math.max(quantity, 0);

  const grossRevenue = qty * unitPrice;
  const discountTotal = qty * discountPerUnit;
  const feesTotal = qty * marketplaceFee + shippingCost;
  const netRevenue = grossRevenue - discountTotal - feesTotal;
  const totalCost = qty * unitCost;
  const profitTotal = netRevenue - totalCost;
  const totalPrintHours = qty * printTimeHours;

  return {
    grossRevenue,
    discountTotal,
    feesTotal,
    netRevenue,
    totalCost,
    profitTotal,
    profitPerUnit: qty ? profitTotal / qty : 0,
    marginPercent: netRevenue ? (profitTotal / netRevenue) * 100 : 0,
    totalPrintHours,
    profitPerHour: totalPrintHours ? profitTotal / totalPrintHours : 0,
  };
}

export type Assessment = { level: "good" | "warning" | "bad"; message: string };

export function assessMargin(marginPercent: number, targetPercent: number): Assessment {
  if (marginPercent <= 0) {
    return { level: "bad", message: `Prejuízo: margem de ${marginPercent.toFixed(1)}%. Revise preço ou custo antes de produzir.` };
  }
  if (marginPercent < 15) {
    return { level: "bad", message: `Margem baixa: ${marginPercent.toFixed(1)}%. Abaixo de 15% qualquer imprevisto come o lucro.` };
  }
  if (marginPercent < targetPercent) {
    return { level: "warning", message: `Margem de ${marginPercent.toFixed(1)}%, abaixo da meta de ${targetPercent.toFixed(0)}%.` };
  }
  return { level: "good", message: `Margem saudável: ${marginPercent.toFixed(1)}%, na meta de ${targetPercent.toFixed(0)}%.` };
}

/**
 * Compara o lucro por hora de máquina com o valor da hora de trabalho. Se a
 * impressora rende menos que a própria mão de obra, a peça é longa demais para
 * o preço — o caso clássico de venda que parece boa e ocupa a máquina à toa.
 */
export function assessProfitPerHour(profitPerHour: number, laborRatePerHour: number): Assessment {
  if (profitPerHour <= 0) {
    return { level: "bad", message: "Lucro por hora negativo: a produção não se paga." };
  }
  if (profitPerHour < laborRatePerHour * 0.5) {
    return {
      level: "warning",
      message: `Lucro por hora baixo (R$ ${profitPerHour.toFixed(2)}/h). Para peças longas pode não compensar a máquina ocupada.`,
    };
  }
  return { level: "good", message: `Lucro por hora de R$ ${profitPerHour.toFixed(2)}/h.` };
}

/**
 * @deprecated Cálculo simplificado que atende só a home antiga (`/`). Use
 * `calculatePieceCost` + `calculateSuggestedPrice`, que consideram energia,
 * depreciação da impressora, insumos e taxas de canal.
 */
export type CostBreakdownInput = {
  weightGrams: number;
  materialCostPerKg: number;
  printTimeHours: number;
  laborRatePerHour: number;
  overheadRate: number;
  marginPercent: number;
};

/** @deprecated Ver nota em `CostBreakdownInput`. */
export function calculateCostBreakdown({
  weightGrams,
  materialCostPerKg,
  printTimeHours,
  laborRatePerHour,
  overheadRate,
  marginPercent,
}: CostBreakdownInput) {
  const materialCost = (weightGrams / 1000) * materialCostPerKg;
  const laborCost = printTimeHours * laborRatePerHour;
  const overheadCost = (materialCost + laborCost) * overheadRate;
  const totalCost = materialCost + laborCost + overheadCost;
  const profit = totalCost * (marginPercent / 100);
  const price = totalCost + profit;

  return {
    materialCost: Number(materialCost.toFixed(2)),
    laborCost: Number(laborCost.toFixed(2)),
    overheadCost: Number(overheadCost.toFixed(2)),
    totalCost: Number(totalCost.toFixed(2)),
    profit: Number(profit.toFixed(2)),
    price: Number(price.toFixed(2)),
  };
}
