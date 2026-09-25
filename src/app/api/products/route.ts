import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateMultiMaterialCost } from "@/lib/costing";

// Aceita dois formatos: o novo (Catálogo — `materials[]`, SKU e custo de
// material calculados aqui) e o antigo (home `/` — `material` texto livre e
// `materialCost` manual), para não quebrar quem ainda usa o formulário antigo.
const productSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  // Até 4 fotos além da capa (imageUrl) — o Catálogo aceita 5 no total.
  extraImages: z.array(z.string().min(1)).max(4).optional(),
  material: z.string().optional(),
  materials: z.array(z.object({ materialId: z.string().min(1), grams: z.number().min(0) })).optional(),
  weightGrams: z.number().min(0),
  printTimeHours: z.number().min(0),
  volumeCm3: z.number().min(0).optional(),
  materialCost: z.number().min(0).optional(),
  laborCost: z.number().min(0),
  overheadCost: z.number().min(0),
  profitMargin: z.number().min(0),
  cost: z.number().min(0),
  price: z.number().min(0),
  active: z.boolean().optional(),
  // Campos do formulário atual (src/app/catalog) — produtos antigos, criados
  // antes dele existir, ficam com tudo no padrão (0/nenhum).
  prepMinutes: z.number().min(0).optional(),
  cleanupMinutes: z.number().min(0).optional(),
  energyCost: z.number().min(0).optional(),
  machineCost: z.number().min(0).optional(),
  printerId: z.string().optional().nullable(),
  lossRatePercent: z.number().min(0).optional(),
  pricingMethod: z.enum(["markup", "margin"]).optional(),
  discountPerUnit: z.number().min(0).optional(),
  marketplaceChannelId: z.string().optional().nullable(),
});

async function ensureAuthenticated() {
  return getCurrentUser();
}

/** Letra do SKU: primeira letra da categoria, maiúscula e sem acento. */
function categoryLetter(category: string) {
  const plain = category.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const match = plain.match(/[A-Za-z]/);
  return (match?.[0] ?? "X").toUpperCase();
}

/**
 * SKU automático por categoria: <Letra>.<sequência 3 dígitos>, incrementado a
 * partir do maior número já usado com essa letra (inclusive produtos
 * arquivados, para nunca reaproveitar um código). Ex.: Decoração → D.001,
 * D.002... Natal → N.001, N.002...
 */
async function nextSkuForCategory(category: string) {
  const letter = categoryLetter(category);
  const existing = await prisma.product.findMany({
    where: { sku: { startsWith: `${letter}.` } },
    select: { sku: true },
  });
  const lastSeq = existing.reduce((max, item) => {
    const seq = Number(item.sku.slice(letter.length + 1));
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);
  return `${letter}.${String(lastSeq + 1).padStart(3, "0")}`;
}

type MaterialLine = { materialId: string; grams: number };

/** Resolve o custo e o nome de material a partir das linhas de material selecionadas na Biblioteca. */
async function resolveMaterials(lines: MaterialLine[] | undefined) {
  const rawUsable = (lines ?? []).filter((line) => line.grams > 0);
  if (!rawUsable.length) return null;

  // Duas linhas com o mesmo material (ex: "+ Adicionar material" duas vezes
  // sem trocar o filamento da segunda) violavam a constraint @@unique de
  // ProductMaterial e derrubavam a gravação inteira — aqui mescla somando as
  // gramas em vez de deixar virar erro 500.
  const gramsByMaterialId = new Map<string, number>();
  for (const line of rawUsable) gramsByMaterialId.set(line.materialId, (gramsByMaterialId.get(line.materialId) ?? 0) + line.grams);
  const usable = Array.from(gramsByMaterialId, ([materialId, grams]) => ({ materialId, grams }));

  const materials = await prisma.material.findMany({ where: { id: { in: usable.map((line) => line.materialId) } } });
  const withMaterial: { line: MaterialLine; material: (typeof materials)[number] }[] = [];
  for (const line of usable) {
    const material = materials.find((item) => item.id === line.materialId);
    if (material) withMaterial.push({ line, material });
  }

  return {
    materialName: withMaterial.map((entry) => entry.material.name).join(" + "),
    materialCost: calculateMultiMaterialCost(withMaterial.map((entry) => ({ grams: entry.line.grams, material: entry.material }))),
    lines: withMaterial.map((entry) => ({ materialId: entry.material.id, grams: entry.line.grams })),
  };
}

export async function GET(request: Request) {
  const user = await ensureAuthenticated();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // ?id= devolve só o necessário pro popup de foto (ProductPreview) — inclusive
  // de produto arquivado, que ainda aparece em orçamentos/produção antigos.
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, sku: true, name: true, category: true, description: true, imageUrl: true, extraImages: true, price: true, active: true },
    });
    if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    return NextResponse.json(product);
  }

  const [products, sales] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      include: { materials: true, printer: true, marketplaceChannel: true },
    }),
    // Total vendido por produto (soma da quantidade de todos os pedidos, sem
    // filtrar por status) — pro card do catálogo mostrar tração de vendas.
    prisma.salesOrder.groupBy({ by: ["productId"], _sum: { quantity: true }, where: { productId: { not: null } } }),
  ]);

  const salesByProduct = new Map(sales.map((row) => [row.productId, row._sum.quantity ?? 0]));
  const withSales = products.map((product) => ({ ...product, salesCount: salesByProduct.get(product.id) ?? 0 }));

  return NextResponse.json(withSales);
}

export async function POST(request: Request) {
  const user = await ensureAuthenticated();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const parsed = productSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const resolved = await resolveMaterials(data.materials);
  const baseData = {
    name: data.name,
    category: data.category,
    description: data.description ?? "",
    imageUrl: data.imageUrl ?? "",
    extraImages: JSON.stringify(data.extraImages ?? []),
    material: resolved?.materialName ?? data.material ?? "",
    weightGrams: data.weightGrams,
    volumeCm3: data.volumeCm3 ?? 0,
    printTimeHours: data.printTimeHours,
    materialCost: resolved?.materialCost ?? data.materialCost ?? 0,
    laborCost: data.laborCost,
    overheadCost: data.overheadCost,
    profitMargin: data.profitMargin,
    cost: data.cost,
    price: data.price,
    active: data.active ?? true,
    prepMinutes: data.prepMinutes ?? 0,
    cleanupMinutes: data.cleanupMinutes ?? 0,
    energyCost: data.energyCost ?? 0,
    machineCost: data.machineCost ?? 0,
    printerId: data.printerId ?? null,
    lossRatePercent: data.lossRatePercent ?? 0,
    pricingMethod: data.pricingMethod ?? "markup",
    discountPerUnit: data.discountPerUnit ?? 0,
    marketplaceChannelId: data.marketplaceChannelId ?? null,
    ...(resolved ? { materials: { create: resolved.lines } } : {}),
  };

  // Duas requisições concorrentes podem calcular o mesmo próximo SKU antes de
  // gravar (raro num app de um usuário só); a constraint @unique pega isso e
  // tentamos de novo com o próximo número.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const product = await prisma.product.create({
        data: { ...baseData, sku: await nextSkuForCategory(data.category) },
        include: { materials: true, printer: true, marketplaceChannel: true },
      });
      return NextResponse.json(product, { status: 201 });
    } catch (error) {
      const isUniqueClash = typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
      if (!isUniqueClash || attempt === 2) throw error;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o SKU" }, { status: 500 });
}

export async function PUT(request: Request) {
  const user = await ensureAuthenticated();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID do produto obrigatório" }, { status: 400 });

  const parsed = productSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const resolved = await resolveMaterials(data.materials);

  const product = await prisma.$transaction(async (tx) => {
    if (data.materials) {
      // `materials` foi enviado (mesmo vazio): o Catálogo controla as linhas por
      // completo, então substitui tudo. Se não veio (formulário antigo), preserva
      // o que já existia.
      await tx.productMaterial.deleteMany({ where: { productId: id } });
    }
    return tx.product.update({
      where: { id },
      data: {
        // sku nunca é reescrito — é permanente desde a criação.
        name: data.name,
        category: data.category,
        description: data.description ?? "",
        imageUrl: data.imageUrl ?? "",
        // Só reescreve se veio no corpo — quem não manda o campo não apaga as fotos extras.
        ...(data.extraImages ? { extraImages: JSON.stringify(data.extraImages) } : {}),
        material: resolved?.materialName ?? data.material ?? "",
        weightGrams: data.weightGrams,
        volumeCm3: data.volumeCm3 ?? 0,
        printTimeHours: data.printTimeHours,
        materialCost: resolved?.materialCost ?? data.materialCost ?? 0,
        laborCost: data.laborCost,
        overheadCost: data.overheadCost,
        profitMargin: data.profitMargin,
        cost: data.cost,
        price: data.price,
        active: data.active ?? true,
        prepMinutes: data.prepMinutes ?? 0,
        cleanupMinutes: data.cleanupMinutes ?? 0,
        energyCost: data.energyCost ?? 0,
        machineCost: data.machineCost ?? 0,
        printerId: data.printerId ?? null,
        lossRatePercent: data.lossRatePercent ?? 0,
        pricingMethod: data.pricingMethod ?? "markup",
        discountPerUnit: data.discountPerUnit ?? 0,
        marketplaceChannelId: data.marketplaceChannelId ?? null,
        ...(resolved ? { materials: { create: resolved.lines } } : {}),
      },
      include: { materials: true, printer: true, marketplaceChannel: true },
    });
  });

  return NextResponse.json(product);
}

export async function DELETE(request: Request) {
  const user = await ensureAuthenticated();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID do produto obrigatório" }, { status: 400 });

  await prisma.product.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
