import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

const focusableSelector = [
  '[data-autofocus]',
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

let openModalCount = 0

export function useModalFocus(isOpen: Ref<boolean>, rootRef: Ref<HTMLElement | null>) {
  let previousActiveElement: HTMLElement | null = null
  let countedOpen = false

  const stop = watch(
    isOpen,
    async open => {
      if (typeof document === 'undefined') return

      if (open) {
        previousActiveElement = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null

        if (!countedOpen) {
          openModalCount += 1
          countedOpen = true
        }
        document.body.classList.add('is-motion-modal-open')

        await nextTick()

        const firstFocusable = rootRef.value?.querySelector<HTMLElement>(focusableSelector)
        firstFocusable?.focus({ preventScroll: true })
        return
      }

      if (countedOpen) {
        openModalCount = Math.max(0, openModalCount - 1)
        countedOpen = false
      }
      if (openModalCount === 0) {
        document.body.classList.remove('is-motion-modal-open')
      }

      await nextTick()

      if (previousActiveElement && document.contains(previousActiveElement)) {
        previousActiveElement.focus({ preventScroll: true })
      }

      previousActiveElement = null
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    stop()

    if (countedOpen && typeof document !== 'undefined') {
      openModalCount = Math.max(0, openModalCount - 1)
      countedOpen = false

      if (openModalCount === 0) {
        document.body.classList.remove('is-motion-modal-open')
      }
    }
  })
}
