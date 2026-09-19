import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isRole } from "@/lib/roles";

const roleSchema = z.string().refine(isRole, { message: "Perfil inválido" });

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: roleSchema,
  active: z.boolean().optional(),
});

// Senha opcional: em branco/ausente mantém a atual.
const updateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).optional().or(z.literal("")),
  role: roleSchema,
  active: z.boolean(),
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if (user.role !== "ADMIN") return { user: null, error: NextResponse.json({ error: "Só administradores podem gerenciar usuários" }, { status: 403 }) };
  return { user, error: null };
}

const publicFields = { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true } as const;

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json(await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: publicFields }));
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email.trim().toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });

  const passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.create({
    data: { name: data.name, email: data.email.trim().toLowerCase(), passwordHash, role: data.role, active: data.active ?? true },
    select: publicFields,
  });
  return NextResponse.json(user, { status: 201 });
}

export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const currentUser = auth.user!;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  // Rebaixar ou desativar o próprio usuário pelo painel é um jeito fácil de
  // se trancar pra fora sem querer — força fazer isso por outra conta admin.
  if (target.id === currentUser.id && (data.role !== "ADMIN" || !data.active)) {
    return NextResponse.json({ error: "Você não pode remover seu próprio acesso de administrador por aqui" }, { status: 400 });
  }

  if (target.role === "ADMIN" && (data.role !== "ADMIN" || !data.active)) {
    const otherActiveAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
    if (otherActiveAdmins === 0) {
      return NextResponse.json({ error: "Precisa sobrar pelo menos um administrador ativo" }, { status: 400 });
    }
  }

  const emailLower = data.email.trim().toLowerCase();
  if (emailLower !== target.email) {
    const clash = await prisma.user.findUnique({ where: { email: emailLower } });
    if (clash) return NextResponse.json({ error: "Já existe um usuário com esse e-mail" }, { status: 409 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      name: data.name,
      email: emailLower,
      role: data.role,
      active: data.active,
      ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 10) } : {}),
    },
    select: publicFields,
  });
  return NextResponse.json(user);
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const currentUser = auth.user!;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  if (id === currentUser.id) return NextResponse.json({ error: "Você não pode excluir seu próprio usuário" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (target.role === "ADMIN" && target.active) {
    const otherActiveAdmins = await prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: id } } });
    if (otherActiveAdmins === 0) {
      return NextResponse.json({ error: "Precisa sobrar pelo menos um administrador ativo" }, { status: 400 });
    }
  }

  // Exclusão lógica, igual ao resto do app — desativa em vez de apagar, pra
  // não perder o autor de produtos/orçamentos/pedidos já criados por ele.
  await prisma.user.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ success: true });
}
