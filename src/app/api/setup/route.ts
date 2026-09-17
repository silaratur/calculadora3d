import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const existing = await prisma.user.findUnique({
    where: { email: "silaratur@gmail.com" },
  });

  if (existing) {
    return NextResponse.json({ ok: true, message: "Usuário já existe" });
  }

  const passwordHash = await bcrypt.hash("Minima.3D", 10);

  await prisma.user.create({
    data: {
      name: "Silar",
      email: "silaratur@gmail.com",
      passwordHash,
      role: "ADMIN",
    },
  });

  return NextResponse.json({ ok: true, message: "Usuário admin criado" });
}
