// Cuenta atrás para «Reenviar código» (el servidor limita los envíos).

import { useCallback, useEffect, useState } from 'react'

export function useCooldown(seconds: number, startActive = true) {
  const [left, setLeft] = useState(startActive ? seconds : 0)
  useEffect(() => {
    if (left <= 0) return
    const id = window.setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => window.clearTimeout(id)
  }, [left])
  const restart = useCallback(() => setLeft(seconds), [seconds])
  return { left, restart }
}
