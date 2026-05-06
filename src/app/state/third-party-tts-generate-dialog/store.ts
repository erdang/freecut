import { create } from 'zustand'

interface ThirdPartyTtsGenerateDialogState {
  isOpen: boolean
  initialText: string
  sourceItemId: string | null
  open: (initialText: string, sourceItemId: string) => void
  close: () => void
}

export const useThirdPartyTtsGenerateDialogStore = create<ThirdPartyTtsGenerateDialogState>(
  (set) => ({
    isOpen: false,
    initialText: '',
    sourceItemId: null,
    open: (initialText, sourceItemId) => set({ isOpen: true, initialText, sourceItemId }),
    close: () => set({ isOpen: false, initialText: '', sourceItemId: null }),
  }),
)
