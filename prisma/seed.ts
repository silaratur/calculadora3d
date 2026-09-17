import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "silaratur@gmail.com" },
  });

  if (!existing) {
    await prisma.user.create({
      data: {
        name: "Silar",
        email: "silaratur@gmail.com",
        passwordHash: await bcrypt.hash("Minima.3D", 10),
        role: "ADMIN",
      },
    });
  }

  const products = [
    {
      sku: "PLA-001",
      name: "Suporte de Mesa",
      category: "Acessórios",
      description: "Suporte funcional para organização de mesa.",
      material: "PLA",
      weightGrams: 120,
      volumeCm3: 85,
      printTimeHours: 2.5,
      materialCost: 4.2,
      laborCost: 12.5,
      overheadCost: 3.8,
      profitMargin: 35,
      cost: 20.5,
      price: 31.7,
      active: true,
    },
    {
      sku: "PETG-014",
      name: "Organizador Modular",
      category: "Organização",
      description: "Organizador para pequenos itens de escritório.",
      material: "PETG",
      weightGrams: 220,
      volumeCm3: 160,
      printTimeHours: 4.1,
      materialCost: 9.4,
      laborCost: 19.8,
      overheadCost: 6.1,
      profitMargin: 32,
      cost: 35.3,
      price: 52.1,
      active: true,
    },
  ];

  for (const item of products) {
    const exists = await prisma.product.findUnique({ where: { sku: item.sku } });
    if (!exists) {
      await prisma.product.create({ data: item });
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
