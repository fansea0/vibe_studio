import { createContext, useContext } from 'react'

interface PaletteContextValue {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const noop = () => {}

export const PaletteContext = createContext<PaletteContextValue>({
  isOpen: false,
  open: noop,
  close: noop,
  toggle: noop,
})

export const usePalette = (): PaletteContextValue => useContext(PaletteContext)
