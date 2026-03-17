export type Lead = {
  id: string
  name: string
  email: string | null
  company: string | null
  notes: string | null
  stage_id: string
  position: number
}

export type Stage = {
  id: string
  name: string
  position: number
}

export type PipelineResponse = {
  pipeline: {
    id: string
    name: string
    created_at: string
  }
  stages: Stage[]
  leads: Lead[]
}
