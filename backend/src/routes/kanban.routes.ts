import { Router } from 'express'
import { z } from 'zod'
import { ensureAuth } from '../middlewares/auth.js'
import {
  addLeadCadence,
  addLeadInteraction,
  createLead,
  deleteLead,
  getLeadDetails,
  getPipelineView,
  importLeadsFromCsvRows,
  moveLead,
  reorderStages,
  updateLeadInteractionStatus,
  updateLeadOpportunity,
  updateLeadProfile,
  updateLead,
} from '../services/kanban.service.js'
import { asyncHandler } from '../utils/http.js'

const kanbanRoutes = Router()
kanbanRoutes.use(ensureAuth)

const idParamSchema = z.object({
  leadId: z.string().uuid(),
})

kanbanRoutes.get(
  '/pipeline/default',
  asyncHandler(async (req, res) => {
    const data = await getPipelineView(req.userId!)
    res.status(200).json(data)
  }),
)

kanbanRoutes.get(
  '/leads/:leadId/details',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const data = await getLeadDetails(req.userId!, leadId)
    res.status(200).json(data)
  }),
)

const leadSchema = z.object({
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email().optional(),
  company: z.string().min(1).optional(),
  notes: z.string().optional(),
})

kanbanRoutes.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const payload = leadSchema.parse(req.body)
    const lead = await createLead(req.userId!, payload)
    res.status(201).json(lead)
  }),
)

const updateLeadSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  company: z.string().min(1).optional(),
  notes: z.string().optional(),
})

kanbanRoutes.put(
  '/leads/:leadId',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = updateLeadSchema.parse(req.body)
    const lead = await updateLead(req.userId!, leadId, payload)
    res.status(200).json(lead)
  }),
)

const profileSchema = z.object({
  nome: z.string().min(2),
  empresa: z.string().optional(),
  email: z.string().email().optional(),
  telefone: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  origem: z.string().optional(),
})

kanbanRoutes.patch(
  '/leads/:leadId/profile',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = profileSchema.parse(req.body)
    const updated = await updateLeadProfile(req.userId!, leadId, {
      nome: payload.nome,
      empresa: payload.empresa ?? null,
      email: payload.email ?? null,
      telefone: payload.telefone ?? null,
      cidade: payload.cidade ?? null,
      estado: payload.estado ?? null,
      origem: payload.origem ?? null,
    })
    res.status(200).json(updated)
  }),
)

const opportunitySchema = z.object({
  etapa: z.string().min(1),
  status: z.string().min(1),
  temperatura: z.string().optional(),
  responsavel: z.string().optional(),
  score: z.coerce.number().min(0),
  deal_status: z.string().optional(),
  valor_estimado: z.coerce.number().min(0).optional(),
  probabilidade: z.coerce.number().min(0).max(100).optional(),
  data_fechamento_prevista: z.string().optional(),
  motivo_perda: z.string().optional(),
})

kanbanRoutes.patch(
  '/leads/:leadId/opportunity',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = opportunitySchema.parse(req.body)
    await updateLeadOpportunity(req.userId!, leadId, {
      etapa: payload.etapa,
      status: payload.status,
      temperatura: payload.temperatura ?? null,
      responsavel: payload.responsavel ?? null,
      score: payload.score,
      deal_status: payload.deal_status ?? null,
      valor_estimado: payload.valor_estimado ?? null,
      probabilidade: payload.probabilidade ?? null,
      data_fechamento_prevista: payload.data_fechamento_prevista ?? null,
      motivo_perda: payload.motivo_perda ?? null,
    })
    res.status(204).send()
  }),
)

kanbanRoutes.delete(
  '/leads/:leadId',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    await deleteLead(req.userId!, leadId)
    res.status(204).send()
  }),
)

const moveLeadSchema = z.object({
  toStageId: z.string().min(1),
  toPosition: z.coerce.number().min(0),
})

kanbanRoutes.post(
  '/leads/:leadId/move',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = moveLeadSchema.parse(req.body)
    const lead = await moveLead(req.userId!, leadId, payload.toStageId, payload.toPosition)
    res.status(200).json(lead)
  }),
)

const interactionSchema = z.object({
  lead_cadence_id: z.string().uuid(),
  tipo: z.string().min(1),
  descricao: z.string().min(1),
  status: z.string().min(1),
  proxima_acao_em: z.string().optional(),
})

const interactionParamsSchema = z.object({
  leadId: z.string().uuid(),
  interactionId: z.string().uuid(),
})

const updateInteractionStatusSchema = z.object({
  status: z.string().min(1),
})

kanbanRoutes.post(
  '/leads/:leadId/interactions',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = interactionSchema.parse(req.body)
    const inserted = await addLeadInteraction(req.userId!, leadId, {
      ...payload,
      proxima_acao_em: payload.proxima_acao_em ?? null,
    })
    res.status(201).json(inserted)
  }),
)

kanbanRoutes.patch(
  '/leads/:leadId/interactions/:interactionId/status',
  asyncHandler(async (req, res) => {
    const { leadId, interactionId } = interactionParamsSchema.parse(req.params)
    const payload = updateInteractionStatusSchema.parse(req.body)
    const updated = await updateLeadInteractionStatus(req.userId!, leadId, interactionId, payload.status)
    res.status(200).json(updated)
  }),
)

const cadenceSchema = z.object({
  cadence_nome: z.string().min(1),
  proxima_execucao: z.string().min(1),
  status: z.string().min(1),
})

kanbanRoutes.post(
  '/leads/:leadId/cadences',
  asyncHandler(async (req, res) => {
    const { leadId } = idParamSchema.parse(req.params)
    const payload = cadenceSchema.parse(req.body)
    const inserted = await addLeadCadence(req.userId!, leadId, payload)
    res.status(201).json(inserted)
  }),
)

const reorderSchema = z.object({
  stages: z.array(
    z.object({
      id: z.string().min(1),
      position: z.coerce.number().min(0),
      name: z.string(),
    }),
  ),
})

kanbanRoutes.post(
  '/stages/reorder',
  asyncHandler(async (req, res) => {
    const payload = reorderSchema.parse(req.body)
    await reorderStages(req.userId!, payload.stages)
    res.status(204).send()
  }),
)

const csvImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.any())),
})

kanbanRoutes.post(
  '/import/csv',
  asyncHandler(async (req, res) => {
    const payload = csvImportSchema.parse(req.body)
    const result = await importLeadsFromCsvRows(req.userId!, payload.rows)
    res.status(200).json(result)
  }),
)

export { kanbanRoutes }
