import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';

export async function listBardana() {
  return prisma.bardanaStock.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createBardana(data: { name: string; quantity?: number; unit?: string; notes?: string }) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Name is required');

  return prisma.bardanaStock.create({
    data: {
      name,
      quantity: data.quantity ?? 0,
      unit: data.unit?.trim() || 'bag',
      notes: data.notes?.trim() || null,
    },
  });
}

export async function updateBardana(
  id: number,
  data: Partial<{ name: string; quantity: number; unit: string; notes: string }>,
) {
  const row = await prisma.bardanaStock.findFirst({ where: { id, isActive: true } });
  if (!row) throw new AppError(404, 'Bardana record not found');

  return prisma.bardanaStock.update({
    where: { id },
    data: {
      name: data.name?.trim() ?? row.name,
      quantity: data.quantity ?? row.quantity,
      unit: data.unit?.trim() ?? row.unit,
      notes: data.notes?.trim() ?? row.notes,
    },
  });
}
