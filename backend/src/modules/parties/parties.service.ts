import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../utils/helpers';
import { ensureCustomerAccount, ensureSupplierAccount } from '../accounting/accounting.service';

export async function listSaleParties() {
  return prisma.customer.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createSaleParty(data: {
  name: string;
  fatherName?: string;
  cnic?: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Name is required');

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const party = await tx.customer.create({
      data: {
        name,
        fatherName: data.fatherName?.trim() || null,
        cnic: data.cnic?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
      },
    });

    await ensureCustomerAccount(tx, { id: party.id, name: party.name });
    return party;
  });
}

export async function updateSaleParty(
  id: number,
  data: Partial<{
    name: string;
    fatherName: string;
    cnic: string;
    phone: string;
    email: string;
    address: string;
  }>,
) {
  const party = await prisma.customer.findFirst({ where: { id, isActive: true } });
  if (!party) throw new AppError(404, 'Sale party not found');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.customer.update({
      where: { id },
      data: {
        name: data.name?.trim() ?? party.name,
        fatherName: data.fatherName?.trim() ?? party.fatherName,
        cnic: data.cnic?.trim() ?? party.cnic,
        phone: data.phone?.trim() ?? party.phone,
        email: data.email?.trim() ?? party.email,
        address: data.address?.trim() ?? party.address,
      },
    });
    await ensureCustomerAccount(tx, { id: updated.id, name: updated.name });
    return updated;
  });
}

export async function removeSaleParty(id: number) {
  const party = await prisma.customer.findFirst({ where: { id, isActive: true } });
  if (!party) throw new AppError(404, 'Sale party not found');
  return prisma.customer.update({ where: { id }, data: { isActive: false } });
}

export async function listPurchaseParties() {
  return prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createPurchaseParty(data: {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const name = data.name.trim();
  if (!name) throw new AppError(400, 'Name is required');

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const party = await tx.supplier.create({
      data: {
        name,
        contactPerson: data.contactPerson?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        address: data.address?.trim() || null,
      },
    });

    await ensureSupplierAccount(tx, { id: party.id, name: party.name });
    return party;
  });
}

export async function updatePurchaseParty(
  id: number,
  data: Partial<{
    name: string;
    contactPerson: string;
    phone: string;
    email: string;
    address: string;
  }>,
) {
  const party = await prisma.supplier.findFirst({ where: { id, isActive: true } });
  if (!party) throw new AppError(404, 'Purchase party not found');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.supplier.update({
      where: { id },
      data: {
        name: data.name?.trim() ?? party.name,
        contactPerson: data.contactPerson?.trim() ?? party.contactPerson,
        phone: data.phone?.trim() ?? party.phone,
        email: data.email?.trim() ?? party.email,
        address: data.address?.trim() ?? party.address,
      },
    });
    await ensureSupplierAccount(tx, { id: updated.id, name: updated.name });
    return updated;
  });
}

export async function removePurchaseParty(id: number) {
  const party = await prisma.supplier.findFirst({ where: { id, isActive: true } });
  if (!party) throw new AppError(404, 'Purchase party not found');
  return prisma.supplier.update({ where: { id }, data: { isActive: false } });
}
