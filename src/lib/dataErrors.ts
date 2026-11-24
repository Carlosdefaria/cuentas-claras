// Mensajes en español para los errores de la Data API (nunca el texto técnico del servidor).

import { es } from '../i18n/es'
import { DataApiError } from './dataApi'

const E = es.data

export function dataErrorMessage(error: unknown): string {
  if (!(error instanceof DataApiError)) return E.generic
  switch (error.kind) {
    case 'network':
      return E.network
    case 'unavailable':
      return E.unavailable
    case 'auth':
      return E.auth
    case 'forbidden':
      return E.forbidden
    case 'invalid':
      return E.invalid
    case 'conflict':
      return E.conflict
    case 'unsettled':
      return E.unsettled
    case 'removed':
      return E.removed
    case 'read-only':
      return E.readOnly
    default:
      return E.generic
  }
}

export const isDataError = (error: unknown, kind: DataApiError['kind']): boolean =>
  error instanceof DataApiError && error.kind === kind
