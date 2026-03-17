import { useEffect, useState, type FormEvent } from 'react'

type LeadForm = {
  name: string
  email: string
  company: string
  notes: string
}

type LeadModalProps = {
  title: string
  initialValue?: LeadForm
  onClose: () => void
  onSubmit: (value: LeadForm) => Promise<void>
}

const emptyLead: LeadForm = {
  name: '',
  email: '',
  company: '',
  notes: '',
}

export function LeadModal({ title, initialValue, onClose, onSubmit }: LeadModalProps) {
  const [form, setForm] = useState<LeadForm>(initialValue ?? emptyLead)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setForm(initialValue ?? emptyLead)
  }, [initialValue])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsLoading(true)
    try {
      await onSubmit(form)
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h3>{title}</h3>
        <form onSubmit={handleSubmit} className="lead-form">
          <label>
            Nome
            <input
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Empresa
            <input
              value={form.company}
              onChange={(event) => setForm((prev) => ({ ...prev, company: event.target.value }))}
            />
          </label>
          <label>
            Observações
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
