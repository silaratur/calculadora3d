import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SnapshotProductLine = { id?: string; name: string; quantity?: number };

/**
 * Cria ProductionItem para jobs que existiam antes desse modelo — um por
 * peça do orçamento de origem (kit), ou um item único a partir do próprio
 * pedido. Todas as peças herdam o status atual do job: não temos como saber
 * retroativamente se, digamos, só uma peça de um kit em Acabamento já tinha
 * passado por lá; o usuário separa manualmente dali em diante.
 */
async function main() {
  const jobs = await prisma.productionJob.findMany({
    where: { items: { none: {} } },
    include: { order: { include: { quote: { select: { snapshotJson: true } } } } },
  });
  console.log(`Jobs sem itens de produção: ${jobs.length}`);

  for (const job of jobs) {
    let drafts: { name: string; quantity: number; productId: string | null }[] = [
      { name: job.order.productName, quantity: job.order.quantity || 1, productId: job.order.productId },
    ];

    if (job.order.quote?.snapshotJson) {
      try {
        const snapshot = JSON.parse(job.order.quote.snapshotJson) as { products?: SnapshotProductLine[] };
        if (snapshot.products?.length) {
          const ids = snapshot.products.map((line) => line.id).filter((id): id is string => Boolean(id));
          const validIds = ids.length
            ? new Set((await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id))
            : new Set<string>();
          drafts = snapshot.products.map((line) => ({
            name: line.name,
            quantity: line.quantity || 1,
            productId: line.id && validIds.has(line.id) ? line.id : null,
          }));
        }
      } catch {
        // snapshot corrompido — mantém o fallback de item único definido acima
      }
    }

    await prisma.productionItem.createMany({
      data: drafts.map((draft) => ({
        jobId: job.id,
        name: draft.name,
        quantity: draft.quantity,
        productId: draft.productId,
        status: job.status,
        completedAt: job.completedAt,
      })),
    });
    console.log(`  ${job.order.orderNumber}: ${drafts.length} item(ns) — status ${job.status}`);
  }

  console.log("Backfill concluído.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
