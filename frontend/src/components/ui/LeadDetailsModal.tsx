import { useState } from 'react'
import { api } from '../../lib/api'

type LeadDetailsResponse = {
  lead: {
    id: string
    nome: string | null
    empresa: string | null
    telefone: string | null
    email: string | null
    cidade: string | null
    estado: string | null
    origem: string | null
    created_at: string | null
  }
  pipeline: {
    etapa: string | null
    status: string | null
    temperatura: string | null
    responsavel: string | null
    score: number | null
    updated_at: string | null
  } | null
  deal: {
    valor_estimado: number | null
    probabilidade: number | null
    data_fechamento_prevista: string | null
    status: string | null
    motivo_perda: string | null
  } | null
  interactions: Array<{
    id: string
    tipo: string | null
    descricao: string | null
    status: string | null
    data_interacao: string | null
    proxima_acao_em: string | null
  }>
  cadenceExecutions: Array<{
    id: string
    cadence_nome: string
    step_atual: number | null
    proxima_execucao: string | null
    status: string | null
  }>
  cadenceTemplates: Array<{
    id: string
    nome: string | null
  }>
}

type LeadDetailsModalProps = {
  details: LeadDetailsResponse
  onClose: () => void
  onRefresh: () => Promise<void> | void
}

function formatDate(value: string | null) {
  if (!value) return 'Nao definido'
  return new Date(value).toLocaleString('pt-BR')
}

function formatCurrency(value: number | null) {
  const safeValue = value ?? 0
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(safeValue)
}

function toBadgeClass(value: string | null | undefined) {
  const normalized = (value ?? 'pendente').toLowerCase().replace(/\s+/g, '-')
  return `status-badge status-${normalized}`
}

function compactText(value: string, max = 90) {
  if (value.length <= max) return value
  return `${value.slice(0, max)}...`
}

function parseInteractionDescription(description: string | null) {
  if (!description) return []
  return description
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
}

function extractImportMetadata(interactions: LeadDetailsResponse['interactions']) {
  const entries = interactions.flatMap((interaction) => parseInteractionDescription(interaction.descricao))
  const metadata = new Map<string, string>()

  for (const entry of entries) {
    const separatorIndex = entry.indexOf(':')
    if (separatorIndex === -1) continue
    const key = entry.slice(0, separatorIndex).trim().toLowerCase()
    const value = entry.slice(separatorIndex + 1).trim()
    if (!value.length) continue
    if (!metadata.has(key)) metadata.set(key, value)
  }

  return {
    endereco: metadata.get('endereco') ?? null,
    categoria: metadata.get('categoria') ?? null,
    site: metadata.get('site') ?? null,
    maps: metadata.get('maps') ?? null,
    nota: metadata.get('nota') ?? null,
    reviews: metadata.get('qtd reviews') ?? null,
  }
}

export function LeadDetailsModal({ details, onClose, onRefresh }: LeadDetailsModalProps) {
  const lead = details.lead
  const location = [lead.cidade, lead.estado].filter(Boolean).join(' / ') || 'Nao informada'
  const importMetadata = extractImportMetadata(details.interactions)
  const score = details.pipeline?.score ?? 0
  const probability = details.deal?.probabilidade ?? 0
  const etapa = details.pipeline?.etapa ?? 'Novo Lead'
  const canShowSendEmail = etapa === 'Contato Inicial'
  const temperatura = details.pipeline?.temperatura ?? 'Nao definida'
  const company = lead.empresa ?? lead.nome ?? 'Sem empresa'
  const leadName = lead.nome ?? company
  const leadOrigin = importMetadata.categoria ?? lead.origem ?? 'Nao informada'
  const quickOpportunity =
    probability >= 70
      ? 'Alta chance de conversao'
      : probability >= 35
        ? 'Chance moderada de conversao'
        : 'Chance inicial de conversao'
  const latestInteraction = details.interactions[0] ?? null
  const [saving, setSaving] = useState(false)
  const [updatingInteractionId, setUpdatingInteractionId] = useState<string | null>(null)
  const [sendingWebhook, setSendingWebhook] = useState(false)
  const [showEmailConfirm, setShowEmailConfirm] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState('')
  const [emailError, setEmailError] = useState('')
  const [interactionFeedback, setInteractionFeedback] = useState('')
  const [interactionError, setInteractionError] = useState('')
  const [activeTab, setActiveTab] = useState<'visao' | 'edicao' | 'acoes' | 'email'>('visao')

  const [profileForm, setProfileForm] = useState({
    nome: lead.nome ?? '',
    empresa: lead.empresa ?? '',
    email: lead.email ?? '',
    telefone: lead.telefone ?? '',
    cidade: lead.cidade ?? '',
    estado: lead.estado ?? '',
    origem: lead.origem ?? '',
  })

  const [interactionForm, setInteractionForm] = useState({
    lead_cadence_id: details.cadenceExecutions[0]?.id ?? '',
    tipo: 'contato',
    descricao: '',
    status: 'pendente',
    proxima_acao_em: '',
  })

  const [cadenceForm, setCadenceForm] = useState({
    cadence_nome: details.cadenceTemplates[0]?.nome ?? 'Follow-up inicial',
    proxima_execucao: '',
    status: 'ativo',
  })

  async function saveProfile() {
    setSaving(true)
    try {
      await api.patch(`/kanban/leads/${lead.id}/profile`, {
        ...profileForm,
        empresa: profileForm.empresa || undefined,
        email: profileForm.email || undefined,
        telefone: profileForm.telefone || undefined,
        cidade: profileForm.cidade || undefined,
        estado: profileForm.estado || undefined,
        origem: profileForm.origem || undefined,
      })
      await onRefresh()
    } finally {
      setSaving(false)
    }
  }

  async function saveInteraction() {
    if (!interactionForm.descricao.trim() || !interactionForm.lead_cadence_id) return
    setInteractionFeedback('')
    setInteractionError('')
    setSaving(true)
    try {
      await api.post(`/kanban/leads/${lead.id}/interactions`, {
        ...interactionForm,
        proxima_acao_em: interactionForm.proxima_acao_em || undefined,
      })
      setInteractionForm({
        lead_cadence_id: interactionForm.lead_cadence_id,
        tipo: interactionForm.tipo,
        descricao: '',
        status: interactionForm.status,
        proxima_acao_em: '',
      })
      await onRefresh()
      setInteractionFeedback('Interacao registrada com sucesso.')
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'message' in error.response.data &&
        typeof error.response.data.message === 'string'
          ? error.response.data.message
          : 'Nao foi possivel registrar a interacao.'
      setInteractionError(message)
    } finally {
      setSaving(false)
    }
  }

  async function saveCadence() {
    if (!cadenceForm.cadence_nome.trim() || !cadenceForm.proxima_execucao) return
    setSaving(true)
    try {
      await api.post(`/kanban/leads/${lead.id}/cadences`, {
        ...cadenceForm,
        proxima_execucao: new Date(cadenceForm.proxima_execucao).toISOString(),
      })
      await onRefresh()
    } finally {
      setSaving(false)
    }
  }

  async function updateInteractionStatus(interactionId: string, status: string) {
    setInteractionFeedback('')
    setInteractionError('')
    setUpdatingInteractionId(interactionId)
    try {
      await api.patch(`/kanban/leads/${lead.id}/interactions/${interactionId}/status`, { status })
      await onRefresh()
      setInteractionFeedback('Status da interacao atualizado.')
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'message' in error.response.data &&
        typeof error.response.data.message === 'string'
          ? error.response.data.message
          : 'Nao foi possivel atualizar o status.'
      setInteractionError(message)
    } finally {
      setUpdatingInteractionId(null)
    }
  }

  async function confirmSendEmail() {
    setEmailFeedback('')
    setEmailError('')
    setSendingWebhook(true)
    try {
      await api.post(`/kanban/leads/${lead.id}/send-email`)
      setShowEmailConfirm(false)
      setEmailFeedback('Webhook enviado com sucesso.')
    } catch (error) {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'message' in error.response.data &&
        typeof error.response.data.message === 'string'
          ? error.response.data.message
          : 'Nao foi possivel enviar para o webhook.'
      setEmailError(message)
    } finally {
      setSendingWebhook(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal details-modal">
        <header className="details-header">
          <div>
            <span className="details-kicker">Ficha do lead</span>
            <h3>{lead.nome ?? 'Sem nome'}</h3>
            <p className="details-subtitle">
              {lead.email ?? 'Sem email'} - criado em {formatDate(lead.created_at)}
            </p>
          </div>
          <div className="details-header-actions">
            <span className={toBadgeClass(details.pipeline?.status ?? 'ativo')}>
              {details.pipeline?.status ?? 'ativo'}
            </span>
            <button type="button" className="ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        </header>

        <nav className="details-tabs">
          <button
            type="button"
            className={activeTab === 'visao' ? 'details-tab active' : 'details-tab'}
            onClick={() => setActiveTab('visao')}
          >
            Visao rapida
          </button>
          <button
            type="button"
            className={activeTab === 'edicao' ? 'details-tab active' : 'details-tab'}
            onClick={() => setActiveTab('edicao')}
          >
            Editar lead
          </button>
          <button
            type="button"
            className={activeTab === 'acoes' ? 'details-tab active' : 'details-tab'}
            onClick={() => setActiveTab('acoes')}
          >
            Interacoes e cadencias
          </button>
          {canShowSendEmail ? (
            <button
              type="button"
              className={activeTab === 'email' ? 'details-tab active' : 'details-tab'}
              onClick={() => setActiveTab('email')}
            >
              Enviar email
            </button>
          ) : null}
        </nav>

        <section className="details-summary">
          <article className="summary-item">
            <span>Etapa</span>
            <strong>{details.pipeline?.etapa ?? 'Novo Lead'}</strong>
          </article>
          <article className="summary-item">
            <span>Temperatura</span>
            <strong>{temperatura}</strong>
          </article>
          <article className="summary-item">
            <span>Score</span>
            <strong>{score}</strong>
          </article>
          <article className="summary-item">
            <span>Probabilidade</span>
            <strong>{probability}%</strong>
          </article>
          <article className="summary-item">
            <span>Valor do deal</span>
            <strong>{formatCurrency(details.deal?.valor_estimado ?? 0)}</strong>
          </article>
        </section>

        {activeTab === 'visao' ? (
          <>
            <section className="details-insights-grid">
              <article className="details-card">
                <h4>Quem e esse lead</h4>
                <div className="lead-hero">
                  <div className="lead-hero-avatar">{leadName.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <p className="lead-hero-name">{leadName}</p>
                    <p className="lead-hero-sub">{company}</p>
                  </div>
                </div>

                <div className="lead-info-grid">
                  <article className="lead-info-item">
                    <span>Segmento</span>
                    <strong>{leadOrigin}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Contato principal</span>
                    <strong>{lead.telefone ?? lead.email ?? 'Nao informado'}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Email</span>
                    <strong>{lead.email ?? 'Nao informado'}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Localizacao</span>
                    <strong>{location}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Endereco</span>
                    <strong>{importMetadata.endereco ?? 'Nao informado'}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Site</span>
                    <strong>{importMetadata.site ?? 'Nao informado'}</strong>
                  </article>
                </div>
              </article>

              <article className="details-card">
                <h4>Leitura da oportunidade</h4>
                <p className="opportunity-highlight">{quickOpportunity}</p>
                <div className="opportunity-progress-wrap">
                  <div className="opportunity-progress-label">
                    <span>Probabilidade de fechamento</span>
                    <strong>{probability}%</strong>
                  </div>
                  <div className="opportunity-progress-track">
                    <div className="opportunity-progress-fill" style={{ width: `${Math.min(100, Math.max(0, probability))}%` }} />
                  </div>
                </div>

                <div className="lead-info-grid opportunity-grid">
                  <article className="lead-info-item">
                    <span>Etapa atual</span>
                    <strong>{etapa}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Status</span>
                    <strong>
                      <span className={toBadgeClass(details.deal?.status ?? 'aberto')}>
                        {details.deal?.status ?? 'aberto'}
                      </span>
                    </strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Valor estimado</span>
                    <strong>{formatCurrency(details.deal?.valor_estimado ?? 0)}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Responsavel</span>
                    <strong>{details.pipeline?.responsavel ?? 'Nao definido'}</strong>
                  </article>
                  <article className="lead-info-item">
                    <span>Nota / reviews</span>
                    <strong>
                      {importMetadata.nota ?? '--'} / {importMetadata.reviews ?? '--'}
                    </strong>
                  </article>
                </div>
              </article>
            </section>

            <section className="details-block details-single-focus">
              <h4>Ultima interacao relevante</h4>
              {latestInteraction ? (
                <div className="latest-interaction">
                  <div className="timeline-title-row">
                    <strong>{latestInteraction.tipo ?? 'Interacao'}</strong>
                    <span className={toBadgeClass(latestInteraction.status ?? 'pendente')}>
                      {latestInteraction.status ?? 'pendente'}
                    </span>
                  </div>
                  {parseInteractionDescription(latestInteraction.descricao).length > 0 ? (
                    <ul className="interaction-tags">
                      {parseInteractionDescription(latestInteraction.descricao).map((part) => (
                        <li key={part} title={part}>
                          {compactText(part)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted-text">Sem descricao.</p>
                  )}
                  <small>{formatDate(latestInteraction.data_interacao)}</small>
                </div>
              ) : (
                <p className="muted-text">Sem interacoes registradas.</p>
              )}
            </section>
          </>
        ) : null}

        {activeTab === 'edicao' ? (
          <section className="details-insights-grid">
            <article className="details-card edit-panel">
              <h4>Dados de contato</h4>
              <p className="panel-subtitle">Atualize os dados principais para facilitar o próximo contato.</p>
              <div className="details-edit-grid">
                <label>
                  Nome do lead
                  <input
                    placeholder="Ex.: Rafael Monteiro"
                    value={profileForm.nome}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, nome: event.target.value }))}
                  />
                </label>
                <label>
                  Empresa
                  <input
                    placeholder="Ex.: RafaelCars"
                    value={profileForm.empresa}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, empresa: event.target.value }))}
                  />
                </label>
                <label>
                  Telefone
                  <input
                    placeholder="Ex.: +55 11 99999-9999"
                    value={profileForm.telefone}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, telefone: event.target.value }))}
                  />
                </label>
                <label>
                  Email
                  <input
                    placeholder="Ex.: contato@empresa.com"
                    value={profileForm.email}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, email: event.target.value }))}
                  />
                </label>
                <label>
                  Cidade
                  <input
                    placeholder="Ex.: São Paulo"
                    value={profileForm.cidade}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, cidade: event.target.value }))}
                  />
                </label>
                <label>
                  Estado
                  <input
                    placeholder="Ex.: SP"
                    value={profileForm.estado}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, estado: event.target.value }))}
                  />
                </label>
                <label className="full-row">
                  Origem
                  <input
                    placeholder="Ex.: Indicação, Instagram, Importação CSV"
                    value={profileForm.origem}
                    onChange={(event) => setProfileForm((prev) => ({ ...prev, origem: event.target.value }))}
                  />
                </label>
              </div>
              <div className="edit-actions">
                <button type="button" className="ghost" onClick={saveProfile} disabled={saving}>
                  Salvar contato
                </button>
              </div>
            </article>

            <article className="details-card edit-panel">
              <h4>Dados da oportunidade</h4>
              <p className="panel-subtitle">Bloco informativo para consulta rápida da negociação.</p>
              <div className="lead-info-grid readonly-opportunity-grid">
                <article className="lead-info-item">
                  <span>Etapa</span>
                  <strong>{etapa}</strong>
                </article>
                <article className="lead-info-item">
                  <span>Responsavel</span>
                  <strong>{details.pipeline?.responsavel ?? 'Nao definido'}</strong>
                </article>
                <article className="lead-info-item">
                  <span>Temperatura</span>
                  <strong>{temperatura}</strong>
                </article>
                <article className="lead-info-item">
                  <span>Score</span>
                  <strong>{score}</strong>
                </article>
                <article className="lead-info-item">
                  <span>Probabilidade</span>
                  <strong>{probability}%</strong>
                </article>
                <article className="lead-info-item">
                  <span>Valor estimado</span>
                  <strong>{formatCurrency(details.deal?.valor_estimado ?? 0)}</strong>
                </article>
              </div>
              <p className="muted-text">Esta seção é informativa e não editável.</p>
            </article>
          </section>
        ) : null}

        {activeTab === 'acoes' ? (
          <>
            <section className="details-block details-single-focus">
              <h4>Registrar nova interacao</h4>
              <div className="details-edit-grid">
                <label>
                  Cadencia vinculada
                  <select
                    value={interactionForm.lead_cadence_id}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, lead_cadence_id: event.target.value }))
                    }
                  >
                    <option value="">Selecione uma cadencia</option>
                    {details.cadenceExecutions.map((cadenceExecution) => (
                      <option key={cadenceExecution.id} value={cadenceExecution.id}>
                        {cadenceExecution.cadence_nome} ({cadenceExecution.status ?? 'ativo'})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tipo de contato
                  <select
                    value={interactionForm.tipo}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, tipo: event.target.value }))
                    }
                  >
                    <option value="contato">contato</option>
                    <option value="whatsapp">whatsapp</option>
                    <option value="ligacao">ligacao</option>
                    <option value="email">email</option>
                    <option value="reuniao">reuniao</option>
                    <option value="visita">visita</option>
                    <option value="outro">outro</option>
                  </select>
                </label>
                <label>
                  Status
                  <select
                    value={interactionForm.status}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="pendente">pendente</option>
                    <option value="concluido">concluido</option>
                    <option value="em_andamento">em andamento</option>
                    <option value="cancelado">cancelado</option>
                  </select>
                </label>
                <label className="full-row">
                  Descricao
                  <textarea
                    rows={3}
                    value={interactionForm.descricao}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, descricao: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Proxima acao em
                  <input
                    type="datetime-local"
                    value={interactionForm.proxima_acao_em}
                    onChange={(event) =>
                      setInteractionForm((prev) => ({ ...prev, proxima_acao_em: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={saveInteraction}
                disabled={saving || !interactionForm.lead_cadence_id}
              >
                Registrar interacao
              </button>
              {interactionFeedback ? <p className="success-text">{interactionFeedback}</p> : null}
              {interactionError ? <p className="error-text">{interactionError}</p> : null}
            </section>

            <section className="details-block details-single-focus">
              <h4>Historico de interacoes</h4>
              {details.interactions.length === 0 ? (
                <p className="muted-text">Nenhuma interacao registrada ainda.</p>
              ) : (
                <ul className="details-list">
                  {details.interactions.map((interaction) => (
                    <li key={interaction.id}>
                      <div className="timeline-title-row">
                        <strong>{interaction.tipo ?? 'Interacao'}</strong>
                        <select
                          className={`interaction-status-select ${toBadgeClass(interaction.status ?? 'pendente')}`}
                          value={interaction.status ?? 'pendente'}
                          onChange={(event) => updateInteractionStatus(interaction.id, event.target.value)}
                          disabled={updatingInteractionId === interaction.id}
                        >
                          <option value="pendente">pendente</option>
                          <option value="concluido">concluido</option>
                          <option value="em_andamento">em andamento</option>
                          <option value="cancelado">cancelado</option>
                        </select>
                      </div>
                      <p>{interaction.descricao ?? 'Sem descricao'}</p>
                      <small>
                        Registrada em: {formatDate(interaction.data_interacao)} | Proxima acao:{' '}
                        {formatDate(interaction.proxima_acao_em)}
                      </small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="details-block details-single-focus">
              <h4>Cadencias</h4>
              {details.cadenceExecutions.length === 0 ? (
                <p className="muted-text">Sem cadencias vinculadas.</p>
              ) : (
                <ul className="details-list">
                  {details.cadenceExecutions.map((item) => (
                    <li key={item.id}>
                      <div className="timeline-title-row">
                        <strong>{item.cadence_nome}</strong>
                        <span className={toBadgeClass(item.status ?? 'ativo')}>
                          {item.status ?? 'ativo'}
                        </span>
                      </div>
                      <small>Proxima execucao: {formatDate(item.proxima_execucao)}</small>
                    </li>
                  ))}
                </ul>
              )}

              <div className="details-edit-grid cadence-form">
                <label>
                  Nome da cadencia
                  <input
                    value={cadenceForm.cadence_nome}
                    onChange={(event) =>
                      setCadenceForm((prev) => ({ ...prev, cadence_nome: event.target.value }))
                    }
                    list="cadence-template-list"
                  />
                  <datalist id="cadence-template-list">
                    {details.cadenceTemplates.map((template) => (
                      <option key={template.id} value={template.nome ?? ''} />
                    ))}
                  </datalist>
                </label>
                <label>
                  Proxima execucao
                  <input
                    type="datetime-local"
                    value={cadenceForm.proxima_execucao}
                    onChange={(event) =>
                      setCadenceForm((prev) => ({ ...prev, proxima_execucao: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Status
                  <input
                    value={cadenceForm.status}
                    onChange={(event) => setCadenceForm((prev) => ({ ...prev, status: event.target.value }))}
                  />
                </label>
              </div>
              <button type="button" className="ghost" onClick={saveCadence} disabled={saving}>
                Registrar cadencia
              </button>
            </section>
          </>
        ) : null}

        {activeTab === 'email' && canShowSendEmail ? (
          <section className="details-block details-single-focus">
            <h4>Enviar email</h4>
            <p className="muted-text">
              Esse envio dispara o webhook com a empresa e o email do lead.
            </p>
            <div className="lead-info-grid" style={{ marginTop: '0.8rem' }}>
              <article className="lead-info-item">
                <span>Empresa</span>
                <strong>{company}</strong>
              </article>
              <article className="lead-info-item">
                <span>Email</span>
                <strong>{lead.email ?? 'Nao informado'}</strong>
              </article>
            </div>
            <div className="edit-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setEmailFeedback('')
                  setEmailError('')
                  setShowEmailConfirm(true)
                }}
                disabled={sendingWebhook}
              >
                Enviar email
              </button>
            </div>
            {emailFeedback ? <p className="success-text">{emailFeedback}</p> : null}
            {emailError ? <p className="error-text">{emailError}</p> : null}
          </section>
        ) : null}

        {showEmailConfirm ? (
          <div className="modal-backdrop">
            <div className="modal">
              <h3>Confirmar envio</h3>
              <p>
                Deseja enviar para o webhook os dados da empresa <strong>{company}</strong> e email{' '}
                <strong>{lead.email ?? 'Nao informado'}</strong>?
              </p>
              <div className="modal-actions">
                <button type="button" className="ghost" onClick={() => setShowEmailConfirm(false)}>
                  Cancelar
                </button>
                <button type="button" onClick={confirmSendEmail} disabled={sendingWebhook}>
                  Conformar envio
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
