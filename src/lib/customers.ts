import type { PrismaClient } from "@prisma/client";

// Quem é o cliente de um orçamento/venda: antes só o nome idêntico contava
// ("Ana Paula Silveira" ≠ "Ana Paula Oliveira Silveira"), e a venda ficava sem
// cliente. Agora: telefone (últimos 10 dígitos), depois e-mail, depois o nome
// sem acento/maiúsculas.

type Contact = { name?: string | null; phone?: string | null; email?: string | null };
type CustomerLike = { id: string; name: string; phone: string; email: string };

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "").slice(-10);
const normalizeName = (value: string | null | undefined) => (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function matchCustomer<T extends CustomerLike>(contact: Contact, customers: T[]): T | null {
  const phone = digits(contact.phone);
  if (phone.length === 10) {
    const byPhone = customers.find((customer) => digits(customer.phone) === phone);
    if (byPhone) return byPhone;
  }
  const email = (contact.email ?? "").trim().toLowerCase();
  if (email) {
    const byEmail = customers.find((customer) => customer.email.trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = normalizeName(contact.name);
  return name ? customers.find((customer) => normalizeName(customer.name) === name) ?? null : null;
}

/**
 * Vendas sem cliente cujo orçamento de origem bate com este cadastro passam a
 * apontar para ele — cobre vendas feitas antes de o cliente ser cadastrado.
 * Devolve quantas foram vinculadas.
 */
export async function linkOrphanOrders(prisma: Pick<PrismaClient, "salesOrder">, customer: CustomerLike) {
  const orphans = await prisma.salesOrder.findMany({
    where: { customerId: null },
    select: { id: true, quote: { select: { customerName: true, customerPhone: true, customerEmail: true } } },
  });
  const ids = orphans
    .filter((order) => order.quote && matchCustomer({ name: order.quote.customerName, phone: order.quote.customerPhone, email: order.quote.customerEmail }, [customer]))
    .map((order) => order.id);
  if (ids.length) await prisma.salesOrder.updateMany({ where: { id: { in: ids } }, data: { customerId: customer.id } });
  return ids.length;
}
