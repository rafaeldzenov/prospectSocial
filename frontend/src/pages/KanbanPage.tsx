import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Eye, Plus, SquarePen, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { LeadModal } from '../components/ui/LeadModal'
import { LeadDetailsModal } from '../components/ui/LeadDetailsModal'
import { api } from '../lib/api'
import type { Lead, PipelineResponse, Stage } from '../types/kanban'

type EditableLead = {
  id: string
  name: string
  email: string
  company: string
  notes: string
}

function leadColumns(stages: Stage[], leads: Lead[]) {
  return stages.map((stage) => ({
    ...stage,
    leads: leads
      .filter((lead) => lead.stage_id === stage.id)
      .sort((a, b) => a.position - b.position),
  }))
}

function DropZone({ stageId }: { stageId: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stageId}`,
    data: { type: 'stage', stageId },
  })

  return (
    <div
      ref={setNodeRef}
      className="stage-dropzone"
      style={{ outline: isOver ? '2px dashed var(--brand)' : 'none' }}
    />
  )
}

function SortableLeadCard({
  lead,
  onOpenDetails,
  onEdit,
  onDelete,
}: {
  lead: Lead
  onOpenDetails: (leadId: string) => void
  onEdit: (lead: EditableLead) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lead.id,
    data: { type: 'lead', stageId: lead.stage_id },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  }

  return (
    <article ref={setNodeRef} style={style} className="lead-card" {...attributes} {...listeners}>
      <header>
        <h4>{lead.name}</h4>
        <div className="card-actions">
          <button type="button" className="icon-btn" onClick={() => onOpenDetails(lead.id)}>
            <Eye size={14} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() =>
              onEdit({
                id: lead.id,
                name: lead.name,
                email: lead.email ?? '',
                company: lead.company ?? '',
                notes: lead.notes ?? '',
              })
            }
          >
            <SquarePen size={14} />
          </button>
          <button type="button" className="icon-btn danger" onClick={() => onDelete(lead.id)}>
            <Trash2 size={14} />
          </button>
        </div>
      </header>
      <p>{lead.company || 'Sem empresa'}</p>
      <small>{lead.email || 'Sem email'}</small>
    </article>
  )
}

function chunkRows<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

export function KanbanPage() {
  const queryClient = useQueryClient()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [createStageId, setCreateStageId] = useState<string | null>(null)
  const [editingLead, setEditingLead] = useState<EditableLead | null>(null)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [visibleLeadsByStage, setVisibleLeadsByStage] = useState<Record<string, number>>({})
  const [importMessage, setImportMessage] = useState('')
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['kanban'],
    queryFn: async () => {
      const response = await api.get<PipelineResponse>('/kanban/pipeline/default')
      return response.data
    },
  })

  const columns = useMemo(() => {
    if (!data) return []
    return leadColumns(data.stages, data.leads)
  }, [data])

  useEffect(() => {
    if (!columns.length) return
    setVisibleLeadsByStage((previous) => {
      const next: Record<string, number> = {}
      for (const stage of columns) {
        next[stage.id] = previous[stage.id] ?? 5
      }
      return next
    })
  }, [columns])

  const { data: leadDetails, isLoading: isLoadingLeadDetails, refetch: refetchLeadDetails } = useQuery({
    queryKey: ['lead-details', selectedLeadId],
    queryFn: async () => {
      const response = await api.get(`/kanban/leads/${selectedLeadId}/details`)
      return response.data
    },
    enabled: Boolean(selectedLeadId),
  })

  const createLeadMutation = useMutation({
    mutationFn: async (payload: {
      pipelineId: string
      stageId: string
      name: string
      email: string
      company: string
      notes: string
    }) => api.post('/kanban/leads', payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  })

  const updateLeadMutation = useMutation({
    mutationFn: async (payload: EditableLead) =>
      api.put(`/kanban/leads/${payload.id}`, {
        name: payload.name,
        email: payload.email || undefined,
        company: payload.company || undefined,
        notes: payload.notes || undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  })

  const deleteLeadMutation = useMutation({
    mutationFn: async (leadId: string) => api.delete(`/kanban/leads/${leadId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  })

  const moveLeadMutation = useMutation({
    mutationFn: async (payload: { leadId: string; toStageId: string; toPosition: number }) =>
      api.post(`/kanban/leads/${payload.leadId}/move`, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  })

  const importCsvMutation = useMutation({
    mutationFn: async (rows: Record<string, string | number | null | undefined>[]) =>
      api.post('/kanban/import/csv', { rows }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanban'] }),
  })

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleCsvSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setImportMessage('')
    setError('')

    Papa.parse<Record<string, string | number | null | undefined>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (result) => {
        const rows = result.data.filter((row) => Object.values(row).some((value) => String(value ?? '').trim()))
        if (rows.length === 0) {
          setError('CSV vazio ou sem colunas válidas.')
          return
        }

        try {
          const chunks = chunkRows(rows, 120)
          let importedCount = 0
          let skippedCount = 0

          for (const chunk of chunks) {
            const response = await importCsvMutation.mutateAsync(chunk)
            importedCount += response.data?.importedCount ?? 0
            skippedCount += response.data?.skippedCount ?? 0
          }

          setImportMessage(
            `Importação concluída: ${importedCount} lead(s) importado(s), ${skippedCount} linha(s) ignorada(s).`,
          )
        } catch {
          setError('Falha ao importar CSV.')
        } finally {
          event.target.value = ''
        }
      },
      error: () => {
        setError('Não foi possível ler o arquivo CSV.')
        event.target.value = ''
      },
    })
  }

  async function handleDragEnd(event: DragEndEvent) {
    setError('')
    const { active, over } = event
    if (!over || !data || active.id === over.id) return

    const activeLeadId = String(active.id)
    const activeLead = data.leads.find((lead) => lead.id === activeLeadId)
    if (!activeLead) return

    let toStageId = activeLead.stage_id
    let toPosition = 0

    if (String(over.id).startsWith('stage-')) {
      toStageId = String(over.id).replace('stage-', '')
      const stageLeads = data.leads.filter((lead) => lead.stage_id === toStageId)
      toPosition = stageLeads.length
    } else {
      const overLead = data.leads.find((lead) => lead.id === String(over.id))
      if (!overLead) return
      toStageId = overLead.stage_id
      toPosition = overLead.position
    }

    try {
      await moveLeadMutation.mutateAsync({
        leadId: activeLead.id,
        toStageId,
        toPosition,
      })
    } catch {
      setError('Não foi possível mover o lead.')
    }
  }

  if (isLoading) {
    return <p>Carregando pipeline...</p>
  }

  if (!data) {
    return <p>Não foi possível carregar o Kanban.</p>
  }

  return (
    <section>
      <header className="page-header">
        <h2>Kanban de Prospecção</h2>
        <p>{data.pipeline.name}</p>
        <div className="page-header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvSelected}
            style={{ display: 'none' }}
          />
          <button type="button" className="ghost" onClick={handleImportClick}>
            Importar CSV
          </button>
        </div>
      </header>

      {error ? <small className="error-text">{error}</small> : null}
      {importMessage ? <small className="success-text">{importMessage}</small> : null}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="kanban-grid">
          {columns.map((stage) => (
            <section key={stage.id} className="kanban-column">
              <header className="column-header">
                <h3>{stage.name}</h3>
                <button type="button" onClick={() => setCreateStageId(stage.id)}>
                  <Plus size={14} />
                  Novo
                </button>
              </header>

              <SortableContext
                items={stage.leads.slice(0, visibleLeadsByStage[stage.id] ?? 5).map((lead) => lead.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="column-content">
                  {stage.leads.slice(0, visibleLeadsByStage[stage.id] ?? 5).map((lead) => (
                    <SortableLeadCard
                      key={lead.id}
                      lead={lead}
                      onOpenDetails={setSelectedLeadId}
                      onEdit={setEditingLead}
                      onDelete={(leadId) => deleteLeadMutation.mutate(leadId)}
                    />
                  ))}
                  {(visibleLeadsByStage[stage.id] ?? 5) < stage.leads.length ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() =>
                        setVisibleLeadsByStage((previous) => ({
                          ...previous,
                          [stage.id]: (previous[stage.id] ?? 5) + 5,
                        }))
                      }
                    >
                      Carregar mais
                    </button>
                  ) : null}
                  <DropZone stageId={stage.id} />
                </div>
              </SortableContext>
            </section>
          ))}
        </div>
      </DndContext>

      {createStageId ? (
        <LeadModal
          title="Novo lead"
          onClose={() => setCreateStageId(null)}
          onSubmit={async (value) => {
            await createLeadMutation.mutateAsync({
              pipelineId: data.pipeline.id,
              stageId: createStageId,
              name: value.name,
              email: value.email,
              company: value.company,
              notes: value.notes,
            })
          }}
        />
      ) : null}

      {editingLead ? (
        <LeadModal
          title="Editar lead"
          initialValue={editingLead}
          onClose={() => setEditingLead(null)}
          onSubmit={async (value) => {
            await updateLeadMutation.mutateAsync({
              id: editingLead.id,
              ...value,
            })
          }}
        />
      ) : null}

      {selectedLeadId && isLoadingLeadDetails ? (
        <div className="modal-backdrop">
          <div className="modal">
            <p>Carregando detalhes do lead...</p>
          </div>
        </div>
      ) : null}

      {selectedLeadId && leadDetails ? (
        <LeadDetailsModal
          details={leadDetails}
          onClose={() => setSelectedLeadId(null)}
          onRefresh={async () => {
            await queryClient.invalidateQueries({ queryKey: ['kanban'] })
            await refetchLeadDetails()
          }}
        />
      ) : null}
    </section>
  )
}
