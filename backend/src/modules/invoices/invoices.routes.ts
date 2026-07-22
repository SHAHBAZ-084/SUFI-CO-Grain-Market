import { Router } from 'express';
import { InvoiceType } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as invoicesService from './invoices.service';
import { registerKachiMaalRoutes } from './kachi-maal.routes';

export const invoicesRouter = Router();
invoicesRouter.use(requireAuth);

registerKachiMaalRoutes(invoicesRouter);

const itemSchema = z.object({
  productId: z.number().int().optional(),
  label: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

const draftSchema = z.object({
  customerId: z.number().int().optional(),
  supplierId: z.number().int().optional(),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1),
});

invoicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type as InvoiceType | undefined;
    res.json(await invoicesService.listInvoices(type ? { type } : undefined));
  }),
);

invoicesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await invoicesService.getInvoice(parseInt(param(req.params.id), 10)));
  }),
);

function draftRoute(type: InvoiceType) {
  return asyncHandler(async (req, res) => {
    const invoice = await invoicesService.createInvoiceDraft({
      type,
      ...req.body,
      createdById: req.session.userId!,
    });
    res.status(201).json(invoice);
  });
}

invoicesRouter.post('/sale-commission', validateBody(draftSchema), draftRoute(InvoiceType.SALE_COMMISSION));
invoicesRouter.post('/sale-paunch', validateBody(draftSchema), draftRoute(InvoiceType.SALE_PAUNCH));
invoicesRouter.post('/purchase-maal', validateBody(draftSchema), draftRoute(InvoiceType.PURCHASE_MAAL));
