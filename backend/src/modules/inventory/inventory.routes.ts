import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, param, validateBody } from '../../utils/helpers';
import * as bardanaService from './bardana.service';

export const inventoryRouter = Router();
inventoryRouter.use(requireAuth);

inventoryRouter.get(
  '/bardana',
  asyncHandler(async (_req, res) => {
    res.json(await bardanaService.listBardana());
  }),
);

inventoryRouter.post(
  '/bardana',
  validateBody(
    z.object({
      name: z.string().min(1),
      quantity: z.number().min(0).optional(),
      unit: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.status(201).json(await bardanaService.createBardana(req.body));
  }),
);

inventoryRouter.patch(
  '/bardana/:id',
  validateBody(
    z.object({
      name: z.string().optional(),
      quantity: z.number().min(0).optional(),
      unit: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    res.json(await bardanaService.updateBardana(parseInt(param(req.params.id), 10), req.body));
  }),
);
