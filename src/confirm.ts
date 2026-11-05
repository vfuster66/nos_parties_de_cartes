import { reactive } from 'vue'

export const confirmState = reactive({
  open: false, title: '', message: '', confirmLabel: 'Confirmer', danger: false,
  resolve: null as null | ((v: boolean) => void),
})

/** Demande une confirmation explicite (suppressions, etc.). */
export function askConfirm(o: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    Object.assign(confirmState, { open: true, title: o.title, message: o.message, confirmLabel: o.confirmLabel ?? 'Confirmer', danger: o.danger ?? true, resolve })
  })
}
export function answerConfirm(v: boolean) {
  confirmState.open = false
  confirmState.resolve?.(v)
  confirmState.resolve = null
}
