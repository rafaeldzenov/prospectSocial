import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api'

export const api = axios.create({ baseURL })

export function setApiToken(token: string | null) {
  if (!token) {
    delete api.defaults.headers.common.Authorization
    return
  }

  api.defaults.headers.common.Authorization = `Bearer ${token}`
}
