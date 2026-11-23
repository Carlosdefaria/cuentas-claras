// Carga asíncrona con estados de carga / datos / error y reintento. Sin caché: cada montaje pide a la red.

import { useCallback, useEffect, useState, type DependencyList } from 'react'

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: unknown }

/**
 * `reload()` vuelve a pedir los datos mostrando la carga; `reload(true)` los pide sin quitar los que hay en pantalla
 * (p. ej. tras registrar un pago: la pantalla se queda y se actualiza al llegar la respuesta).
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> & { reload: (silent?: boolean) => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState({ n: 0, silent: false })

  useEffect(() => {
    let alive = true
    if (!attempt.silent) setState({ status: 'loading' })
    load().then(
      (data) => alive && setState({ status: 'ready', data }),
      (error: unknown) => alive && setState({ status: 'error', error }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const reload = useCallback((silent = false) => setAttempt((a) => ({ n: a.n + 1, silent })), [])
  return { ...state, reload }
}
