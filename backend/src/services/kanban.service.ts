import { AppError } from '../utils/http.js'
import { supabaseAdmin } from '../lib/supabase.js'

export type Stage = {
  id: string
  name: string
  position: number
}

type CsvImportRow = Record<string, string | number | null | undefined>

const defaultStages = ['Novo Lead', 'Qualificação', 'Contato Inicial', 'Proposta', 'Fechado']

type LeadProspectRow = {
  id: string
  nome: string | null
  empresa: string | null
  email: string | null
  created_at: string | null
}

type PipelineProspectRow = {
  id: string
  lead_id: string
  etapa: string | null
  status: string | null
  temperatura: string | null
  responsavel: string | null
  score: number | null
  updated_at: string | null
}

type DealProspectRow = {
  id: string
  valor_estimado: number | null
  probabilidade: number | null
  data_fechamento_prevista: string | null
  status: string | null
  motivo_perda: string | null
}

type InteractionProspectRow = {
  id: string
  tipo: string | null
  descricao: string | null
  status: string | null
  data_interacao: string | null
  proxima_acao_em: string | null
}

type CadenceExecutionRow = {
  id: string
  cadence_id: string | null
  step_atual: number | null
  proxima_execucao: string | null
  status: string | null
}

type CadenceTemplateRow = {
  id: string
  nome: string | null
}

function normalizeKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
}

function parseMaybeNumber(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.replace(',', '.').trim()
  const parsed = Number(normalized)
  return Number.isNaN(parsed) ? null : parsed
}

function parseRowValue(row: CsvImportRow, aliases: string[]) {
  const entries = Object.entries(row)
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias)
    const found = entries.find(([key]) => normalizeKey(key) === normalizedAlias)
    if (!found) continue
    const rawValue = found[1]
    if (rawValue === null || rawValue === undefined) return null
    const value = String(rawValue).trim()
    return value.length ? value : null
  }
  return null
}

function parseTemperature(nota: number | null) {
  if (nota === null) return 'morno'
  if (nota >= 4.5) return 'quente'
  if (nota >= 3) return 'morno'
  return 'frio'
}

async function createCadenceExecutionsForLead(leadId: string) {
  const cadenceTemplatesQuery = await supabaseAdmin
    .from('cadence_prospect')
    .select('id, dia_offset')
    .order('dia_offset', { ascending: true })

  if (cadenceTemplatesQuery.error) throw new AppError(cadenceTemplatesQuery.error.message, 500)

  if (cadenceTemplatesQuery.data.length === 0) return

  const cadenceExecutionsPayload = cadenceTemplatesQuery.data.map((item) => {
    const offset = item.dia_offset ?? 0
    const executionDate = new Date()
    executionDate.setDate(executionDate.getDate() + offset)
    return {
      lead_id: leadId,
      cadence_id: item.id,
      step_atual: 0,
      proxima_execucao: executionDate.toISOString(),
      status: 'ativo',
    }
  })

  const cadenceInsert = await supabaseAdmin.from('lead_cadence_prospect').insert(cadenceExecutionsPayload)
  if (cadenceInsert.error) throw new AppError(cadenceInsert.error.message, 500)
}

export async function getPipelineView(userId: string) {
  void userId

  const leadsQuery = await supabaseAdmin
    .from('leads_prospect')
    .select('id, nome, empresa, email, created_at')
    .order('created_at', { ascending: true })

  if (leadsQuery.error) throw new AppError(leadsQuery.error.message, 500)

  const pipelineQuery = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .select('id, lead_id, etapa, status, temperatura, responsavel, score, updated_at')

  if (pipelineQuery.error) throw new AppError(pipelineQuery.error.message, 500)

  const pipelineByLead = new Map<string, PipelineProspectRow>()
  for (const row of pipelineQuery.data as PipelineProspectRow[]) {
    pipelineByLead.set(row.lead_id, row)
  }

  const stageSet = new Set(defaultStages)
  for (const row of pipelineQuery.data as PipelineProspectRow[]) {
    if (row.etapa?.trim()) stageSet.add(row.etapa.trim())
  }

  const orderedStageNames = [
    ...defaultStages,
    ...Array.from(stageSet).filter((name) => !defaultStages.includes(name)),
  ]

  const stages = orderedStageNames.map((name, index) => ({
    id: name,
    name,
    position: index,
  }))

  const leads = (leadsQuery.data as LeadProspectRow[]).map((lead) => {
    const pipeline = pipelineByLead.get(lead.id)
    return {
      id: lead.id,
      name: lead.nome ?? 'Sem nome',
      email: lead.email,
      company: lead.empresa,
      notes: null,
      stage_id: pipeline?.etapa?.trim() || defaultStages[0],
      position: pipeline?.score ?? 0,
      created_at: lead.created_at,
      updated_at: pipeline?.updated_at ?? lead.created_at,
    }
  })

  return {
    pipeline: {
      id: 'default',
      name: 'Pipeline principal',
      created_at: new Date().toISOString(),
    },
    stages,
    leads,
  }
}

export async function createLead(userId: string, payload: Record<string, string | undefined>) {
  void userId
  const { stageId, name, email, company } = payload
  if (!stageId || !name) {
    throw new AppError('stageId e name são obrigatórios.', 400)
  }

  const leadInsert = await supabaseAdmin
    .from('leads_prospect')
    .insert({
      nome: name,
      empresa: company ?? null,
      email: email ?? null,
    })
    .select('*')
    .single()

  if (leadInsert.error || !leadInsert.data) {
    throw new AppError(leadInsert.error?.message ?? 'Erro ao criar lead.', 500)
  }

  const maxScoreQuery = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .select('score')
    .eq('etapa', stageId)
    .order('score', { ascending: false })
    .limit(1)

  if (maxScoreQuery.error) throw new AppError(maxScoreQuery.error.message, 500)

  const nextScore = (maxScoreQuery.data[0]?.score ?? -1) + 1

  const pipelineInsert = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .insert({
      lead_id: leadInsert.data.id,
      etapa: stageId,
      score: nextScore,
      status: 'ativo',
    })
    .select('updated_at')
    .single()

  if (pipelineInsert.error) throw new AppError(pipelineInsert.error.message, 500)

  const interactionInsert = await supabaseAdmin.from('interactions_prospect').insert({
    lead_id: leadInsert.data.id,
    tipo: 'sistema',
    descricao: 'Lead criado no portal',
    status: 'concluido',
  })

  if (interactionInsert.error) throw new AppError(interactionInsert.error.message, 500)

  const dealInsert = await supabaseAdmin.from('deals_prospect').insert({
    lead_id: leadInsert.data.id,
    valor_estimado: 0,
    probabilidade: 0,
    status: 'aberto',
  })

  if (dealInsert.error) throw new AppError(dealInsert.error.message, 500)

  await createCadenceExecutionsForLead(leadInsert.data.id)

  return {
    id: leadInsert.data.id,
    name: leadInsert.data.nome ?? name,
    email: leadInsert.data.email,
    company: leadInsert.data.empresa,
    notes: null,
    stage_id: stageId,
    position: nextScore,
    created_at: leadInsert.data.created_at,
    updated_at: pipelineInsert.data?.updated_at ?? leadInsert.data.created_at,
  }
}

export async function updateLead(
  userId: string,
  leadId: string,
  payload: Record<string, string | undefined>,
) {
  void userId

  const update = await supabaseAdmin
    .from('leads_prospect')
    .update({
      nome: payload.name,
      email: payload.email ?? null,
      empresa: payload.company ?? null,
    })
    .eq('id', leadId)
    .select('*')
    .single()

  if (update.error || !update.data) throw new AppError('Lead não encontrado para atualização.', 404)

  const pipeline = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .select('etapa, score, updated_at')
    .eq('lead_id', leadId)
    .maybeSingle()

  return {
    id: update.data.id,
    name: update.data.nome ?? 'Sem nome',
    email: update.data.email,
    company: update.data.empresa,
    notes: null,
    stage_id: pipeline.data?.etapa ?? defaultStages[0],
    position: pipeline.data?.score ?? 0,
    created_at: update.data.created_at,
    updated_at: pipeline.data?.updated_at ?? update.data.created_at,
  }
}

export async function deleteLead(userId: string, leadId: string) {
  void userId
  const remove = await supabaseAdmin.from('leads_prospect').delete().eq('id', leadId)
  if (remove.error) throw new AppError(remove.error.message, 500)
}

export async function moveLead(userId: string, leadId: string, toStageId: string, toPosition: number) {
  void userId

  const existing = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (existing.error) throw new AppError(existing.error.message, 500)

  if (existing.data?.id) {
    const update = await supabaseAdmin
      .from('lead_pipeline_prospect')
      .update({
        etapa: toStageId,
        score: toPosition,
        status: 'ativo',
      })
      .eq('lead_id', leadId)
      .select('etapa, score, updated_at')
      .single()

    if (update.error || !update.data) {
      throw new AppError(update.error?.message ?? 'Falha ao mover lead.', 500)
    }

    const lead = await supabaseAdmin
      .from('leads_prospect')
      .select('id, nome, empresa, email, created_at')
      .eq('id', leadId)
      .single()

    if (lead.error || !lead.data) throw new AppError('Lead não encontrado.', 404)

    return {
      id: lead.data.id,
      name: lead.data.nome ?? 'Sem nome',
      email: lead.data.email,
      company: lead.data.empresa,
      notes: null,
      stage_id: update.data.etapa ?? toStageId,
      position: update.data.score ?? toPosition,
      created_at: lead.data.created_at,
      updated_at: update.data.updated_at ?? lead.data.created_at,
    }
  }

  const insert = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .insert({
      lead_id: leadId,
      etapa: toStageId,
      score: toPosition,
      status: 'ativo',
    })
    .select('etapa, score, updated_at')
    .single()

  if (insert.error || !insert.data) {
    throw new AppError(insert.error?.message ?? 'Falha ao mover lead.', 500)
  }

  const lead = await supabaseAdmin
    .from('leads_prospect')
    .select('id, nome, empresa, email, created_at')
    .eq('id', leadId)
    .single()

  if (lead.error || !lead.data) throw new AppError('Lead não encontrado.', 404)

  return {
    id: lead.data.id,
    name: lead.data.nome ?? 'Sem nome',
    email: lead.data.email,
    company: lead.data.empresa,
    notes: null,
    stage_id: insert.data.etapa ?? toStageId,
    position: insert.data.score ?? toPosition,
    created_at: lead.data.created_at,
    updated_at: insert.data.updated_at ?? lead.data.created_at,
  }
}

export async function reorderStages(userId: string, stages: Stage[]) {
  void userId
  void stages
}

export async function importLeadsFromCsvRows(userId: string, rows: CsvImportRow[]) {
  void userId

  let importedCount = 0
  let skippedCount = 0

  for (const row of rows) {
    const empresa = parseRowValue(row, ['empresa', 'company', 'nome'])
    if (!empresa) {
      skippedCount += 1
      continue
    }

    const notaRaw = parseRowValue(row, ['nota', 'rating'])
    const qttReviewRaw = parseRowValue(row, ['qtt_review', 'quantidade_review', 'reviews'])
    const endereco = parseRowValue(row, ['endereco', 'endereço', 'address'])
    const cidade = parseRowValue(row, ['cidade', 'city'])
    const uf = parseRowValue(row, ['uf', 'estado', 'state'])
    const pais = parseRowValue(row, ['pais', 'country'])
    const site = parseRowValue(row, ['site', 'website'])
    const celular = parseRowValue(row, ['celular', 'telefone', 'phone'])
    const categoria = parseRowValue(row, ['categoria', 'category'])
    const maps = parseRowValue(row, ['maps', 'mapa', 'google_maps'])

    const nota = parseMaybeNumber(notaRaw)
    const qttReview = parseMaybeNumber(qttReviewRaw)
    const temperatura = parseTemperature(nota)
    const score = Math.max(0, Math.round((nota ?? 0) * 20))
    const probabilidade = Math.max(0, Math.min(100, score))

    const leadInsert = await supabaseAdmin
      .from('leads_prospect')
      .insert({
        nome: empresa,
        empresa,
        telefone: celular,
        cidade,
        estado: uf,
        origem: categoria ?? 'importacao_csv',
      })
      .select('id')
      .single()

    if (leadInsert.error || !leadInsert.data) {
      throw new AppError(leadInsert.error?.message ?? 'Falha ao criar lead via CSV.', 500)
    }

    const pipelineInsert = await supabaseAdmin.from('lead_pipeline_prospect').insert({
      lead_id: leadInsert.data.id,
      etapa: 'Novo Lead',
      status: 'ativo',
      temperatura,
      score,
      responsavel: 'importacao_csv',
    })
    if (pipelineInsert.error) throw new AppError(pipelineInsert.error.message, 500)

    const interactionDescription = [
      'Lead importado via CSV.',
      endereco ? `Endereco: ${endereco}` : null,
      categoria ? `Categoria: ${categoria}` : null,
      pais ? `Pais: ${pais}` : null,
      site ? `Site: ${site}` : null,
      maps ? `Maps: ${maps}` : null,
      nota !== null ? `Nota: ${nota}` : null,
      qttReview !== null ? `Qtd reviews: ${qttReview}` : null,
    ]
      .filter(Boolean)
      .join(' | ')

    const interactionInsert = await supabaseAdmin.from('interactions_prospect').insert({
      lead_id: leadInsert.data.id,
      tipo: 'importacao_csv',
      descricao: interactionDescription,
      status: 'concluido',
    })
    if (interactionInsert.error) throw new AppError(interactionInsert.error.message, 500)

    const dealInsert = await supabaseAdmin.from('deals_prospect').insert({
      lead_id: leadInsert.data.id,
      valor_estimado: 0,
      probabilidade,
      status: 'aberto',
    })
    if (dealInsert.error) throw new AppError(dealInsert.error.message, 500)

    await createCadenceExecutionsForLead(leadInsert.data.id)
    importedCount += 1
  }

  return {
    importedCount,
    skippedCount,
    totalRows: rows.length,
  }
}

export async function getLeadDetails(userId: string, leadId: string) {
  void userId

  const leadQuery = await supabaseAdmin
    .from('leads_prospect')
    .select('id, nome, empresa, telefone, email, cidade, estado, origem, created_at')
    .eq('id', leadId)
    .single()

  if (leadQuery.error || !leadQuery.data) throw new AppError('Lead não encontrado.', 404)

  const pipelineQuery = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .select('id, lead_id, etapa, status, temperatura, responsavel, score, updated_at')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (pipelineQuery.error) throw new AppError(pipelineQuery.error.message, 500)

  const interactionsQuery = await supabaseAdmin
    .from('interactions_prospect')
    .select('id, tipo, descricao, status, data_interacao, proxima_acao_em')
    .eq('lead_id', leadId)
    .order('data_interacao', { ascending: false })

  if (interactionsQuery.error) throw new AppError(interactionsQuery.error.message, 500)

  const dealQuery = await supabaseAdmin
    .from('deals_prospect')
    .select('id, valor_estimado, probabilidade, data_fechamento_prevista, status, motivo_perda')
    .eq('lead_id', leadId)
    .maybeSingle()

  if (dealQuery.error) throw new AppError(dealQuery.error.message, 500)

  const cadenceQuery = await supabaseAdmin
    .from('lead_cadence_prospect')
    .select('id, cadence_id, step_atual, proxima_execucao, status')
    .eq('lead_id', leadId)
    .order('proxima_execucao', { ascending: true })

  if (cadenceQuery.error) throw new AppError(cadenceQuery.error.message, 500)

  const cadenceTemplateIds = (cadenceQuery.data as CadenceExecutionRow[])
    .map((item) => item.cadence_id)
    .filter((id): id is string => Boolean(id))

  let cadenceNames = new Map<string, string>()
  if (cadenceTemplateIds.length > 0) {
    const cadenceTemplatesQuery = await supabaseAdmin
      .from('cadence_prospect')
      .select('id, nome')
      .in('id', cadenceTemplateIds)

    if (cadenceTemplatesQuery.error) throw new AppError(cadenceTemplatesQuery.error.message, 500)

    cadenceNames = new Map(cadenceTemplatesQuery.data.map((item) => [item.id, item.nome ?? 'Cadência']))
  }

  const cadenceTemplates = await supabaseAdmin
    .from('cadence_prospect')
    .select('id, nome')
    .order('nome', { ascending: true })

  if (cadenceTemplates.error) throw new AppError(cadenceTemplates.error.message, 500)

  return {
    lead: leadQuery.data,
    pipeline: (pipelineQuery.data as PipelineProspectRow | null) ?? null,
    deal: (dealQuery.data as DealProspectRow | null) ?? null,
    interactions: interactionsQuery.data as InteractionProspectRow[],
    cadenceExecutions: (cadenceQuery.data as CadenceExecutionRow[]).map((item) => ({
      ...item,
      cadence_nome: item.cadence_id ? cadenceNames.get(item.cadence_id) ?? 'Cadência' : 'Cadência',
    })),
    cadenceTemplates: cadenceTemplates.data as CadenceTemplateRow[],
  }
}

export async function updateLeadProfile(
  userId: string,
  leadId: string,
  payload: {
    nome?: string
    empresa?: string | null
    email?: string | null
    telefone?: string | null
    cidade?: string | null
    estado?: string | null
    origem?: string | null
  },
) {
  void userId

  const update = await supabaseAdmin
    .from('leads_prospect')
    .update({
      nome: payload.nome,
      empresa: payload.empresa ?? null,
      email: payload.email ?? null,
      telefone: payload.telefone ?? null,
      cidade: payload.cidade ?? null,
      estado: payload.estado ?? null,
      origem: payload.origem ?? null,
    })
    .eq('id', leadId)
    .select('*')
    .single()

  if (update.error || !update.data) {
    throw new AppError(update.error?.message ?? 'Falha ao atualizar lead.', 500)
  }

  return update.data
}

export async function updateLeadOpportunity(
  userId: string,
  leadId: string,
  payload: {
    etapa?: string
    status?: string
    temperatura?: string | null
    responsavel?: string | null
    score?: number
    deal_status?: string | null
    valor_estimado?: number | null
    probabilidade?: number | null
    data_fechamento_prevista?: string | null
    motivo_perda?: string | null
  },
) {
  void userId

  const pipelineUpdate = await supabaseAdmin
    .from('lead_pipeline_prospect')
    .update({
      etapa: payload.etapa,
      status: payload.status,
      temperatura: payload.temperatura ?? null,
      responsavel: payload.responsavel ?? null,
      score: payload.score,
    })
    .eq('lead_id', leadId)

  if (pipelineUpdate.error) {
    throw new AppError(pipelineUpdate.error.message, 500)
  }

  const dealUpdate = await supabaseAdmin
    .from('deals_prospect')
    .update({
      status: payload.deal_status ?? null,
      valor_estimado: payload.valor_estimado ?? null,
      probabilidade: payload.probabilidade ?? null,
      data_fechamento_prevista: payload.data_fechamento_prevista ?? null,
      motivo_perda: payload.motivo_perda ?? null,
    })
    .eq('lead_id', leadId)

  if (dealUpdate.error) {
    throw new AppError(dealUpdate.error.message, 500)
  }
}

export async function addLeadInteraction(
  userId: string,
  leadId: string,
  payload: {
    lead_cadence_id: string
    tipo: string
    descricao: string
    status: string
    proxima_acao_em?: string | null
  },
) {
  void userId

  const cadenceExecution = await supabaseAdmin
    .from('lead_cadence_prospect')
    .select('id, cadence_id')
    .eq('id', payload.lead_cadence_id)
    .eq('lead_id', leadId)
    .maybeSingle()

  if (cadenceExecution.error) throw new AppError(cadenceExecution.error.message, 500)
  if (!cadenceExecution.data) {
    throw new AppError('Interação deve estar vinculada a uma cadência válida do lead.', 400)
  }

  let cadenceName = 'Cadência'
  if (cadenceExecution.data.cadence_id) {
    const cadenceTemplate = await supabaseAdmin
      .from('cadence_prospect')
      .select('nome')
      .eq('id', cadenceExecution.data.cadence_id)
      .maybeSingle()

    if (cadenceTemplate.error) throw new AppError(cadenceTemplate.error.message, 500)
    cadenceName = cadenceTemplate.data?.nome ?? cadenceName
  }

  const insert = await supabaseAdmin
    .from('interactions_prospect')
    .insert({
      lead_id: leadId,
      tipo: payload.tipo,
      descricao: `Cadencia: ${cadenceName} | ${payload.descricao}`,
      status: payload.status,
      proxima_acao_em: payload.proxima_acao_em ?? null,
    })
    .select('*')
    .single()

  if (insert.error || !insert.data) {
    throw new AppError(insert.error?.message ?? 'Falha ao registrar interação.', 500)
  }

  return insert.data
}

export async function updateLeadInteractionStatus(
  userId: string,
  leadId: string,
  interactionId: string,
  status: string,
) {
  void userId

  const existing = await supabaseAdmin
    .from('interactions_prospect')
    .select('id')
    .eq('id', interactionId)
    .eq('lead_id', leadId)
    .maybeSingle()

  if (existing.error) throw new AppError(existing.error.message, 500)
  if (!existing.data) {
    throw new AppError('Interacao nao encontrada para este lead.', 404)
  }

  const update = await supabaseAdmin
    .from('interactions_prospect')
    .update({ status })
    .eq('id', interactionId)
    .eq('lead_id', leadId)
    .select('*')
    .single()

  if (update.error || !update.data) {
    throw new AppError(update.error?.message ?? 'Falha ao atualizar status da interacao.', 500)
  }

  return update.data
}

export async function sendLeadEmailWebhook(userId: string, leadId: string) {
  void userId

  const leadQuery = await supabaseAdmin
    .from('leads_prospect')
    .select('id, nome, empresa, email')
    .eq('id', leadId)
    .single()

  if (leadQuery.error || !leadQuery.data) {
    throw new AppError('Lead não encontrado.', 404)
  }

  const companyName = leadQuery.data.empresa ?? leadQuery.data.nome
  if (!companyName || !leadQuery.data.email) {
    throw new AppError('Lead precisa ter empresa e email para envio.', 400)
  }

  const webhookResponse = await fetch('https://app.eusousocial.com/webhook-test/prospect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      empresa: companyName,
      email: leadQuery.data.email,
    }),
  })

  if (!webhookResponse.ok) {
    throw new AppError('Falha ao enviar dados para o webhook.', 502)
  }

  return { success: true }
}

export async function addLeadCadence(
  userId: string,
  leadId: string,
  payload: {
    cadence_nome: string
    proxima_execucao: string
    status: string
  },
) {
  void userId

  const existing = await supabaseAdmin
    .from('cadence_prospect')
    .select('id, nome')
    .ilike('nome', payload.cadence_nome)
    .limit(1)
    .maybeSingle()

  if (existing.error) throw new AppError(existing.error.message, 500)
  let cadenceId = existing.data?.id ?? null

  if (!cadenceId) {
    const createTemplate = await supabaseAdmin
      .from('cadence_prospect')
      .insert({
        nome: payload.cadence_nome,
        dia_offset: 0,
        tipo_acao: 'manual',
        mensagem_template: '',
      })
      .select('id')
      .single()

    if (createTemplate.error || !createTemplate.data) {
      throw new AppError(createTemplate.error?.message ?? 'Falha ao criar template de cadência.', 500)
    }
    cadenceId = createTemplate.data.id
  }

  const insert = await supabaseAdmin
    .from('lead_cadence_prospect')
    .insert({
      lead_id: leadId,
      cadence_id: cadenceId,
      step_atual: 0,
      proxima_execucao: payload.proxima_execucao,
      status: payload.status,
    })
    .select('*')
    .single()

  if (insert.error || !insert.data) {
    throw new AppError(insert.error?.message ?? 'Falha ao registrar cadência.', 500)
  }

  return insert.data
}
