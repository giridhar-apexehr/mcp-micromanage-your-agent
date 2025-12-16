/**
 * @file useFloatingPanel
 *
 * Shared hook for managing floating panels anchored to a trigger element.
 *
 * Features:
 * - Two-phase visibility (`isRendered` + `isOpen`) to support CSS enter/exit transitions.
 * - Automatic anchor-relative positioning with viewport clamping.
 * - Repositioning on resize and scroll.
 * - Optional outside click and Escape key handling.
 */

import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

export type FloatingPanelPosition = { top: number; left: number }

export type UseFloatingPanelOptions = {
  /**
   * Ref to the element that anchors the panel (typically the trigger button).
   */
  anchorRef: RefObject<HTMLElement | null>

  /**
   * Optional ref to the panel element itself. Used for outside-click detection.
   */
  panelRef?: RefObject<HTMLElement | null>

  /**
   * Optional ref to an additional element that should be treated as "inside" clicks.
   * Useful when the anchor wrapper is broader than the trigger button.
   */
  ignoreOutsideClickRef?: RefObject<HTMLElement | null>

  /**
   * Whether to close the panel on outside click.
   */
  closeOnOutsideClick?: boolean

  /**
   * Whether to close the panel on Escape.
   */
  closeOnEscape?: boolean

  /**
   * Margin (px) between anchor and panel.
   */
  margin?: number

  /**
   * Max panel width used for viewport clamping.
   */
  maxPanelWidth?: number

  /**
   * Min panel width used for viewport clamping.
   */
  minPanelWidth?: number

  /**
   * Delay (ms) to keep the panel mounted after closing so CSS transitions can play.
   */
  closeDelayMs?: number
}

export type UseFloatingPanelResult = {
  isRendered: boolean
  isOpen: boolean
  position: FloatingPanelPosition | null
  open: () => void
  close: () => void
  reset: () => void
  toggle: () => void
  updatePosition: () => void
}

/**
 * Hook that encapsulates common floating panel behavior.
 */
export const useFloatingPanel = (
  options: UseFloatingPanelOptions,
): UseFloatingPanelResult => {
  const {
    anchorRef,
    panelRef,
    ignoreOutsideClickRef,
    closeOnOutsideClick = true,
    closeOnEscape = true,
    margin = 10,
    maxPanelWidth = 320,
    minPanelWidth = 200,
    closeDelayMs = 180,
  } = options

  const [isOpen, setIsOpen] = useState<boolean>(false)
  const [isRendered, setIsRendered] = useState<boolean>(false)
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null)

  const closeTimeoutRef = useRef<number | null>(null)

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }, [])

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return

    const rect = anchor.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    const panelWidth = Math.min(
      maxPanelWidth,
      Math.max(minPanelWidth, viewportWidth - 20),
    )
    const desiredLeft = rect.left
    const clampedLeft = Math.min(
      Math.max(10, desiredLeft),
      viewportWidth - 10 - panelWidth,
    )
    const top = rect.bottom + margin

    setPosition({ top, left: clampedLeft })
  }, [anchorRef, margin, maxPanelWidth, minPanelWidth])

  const open = useCallback(() => {
    clearCloseTimeout()
    setIsRendered(true)
    requestAnimationFrame(() => {
      setIsOpen(true)
    })
  }, [clearCloseTimeout])

  const close = useCallback(() => {
    setIsOpen(false)
    clearCloseTimeout()

    closeTimeoutRef.current = window.setTimeout(() => {
      setIsRendered(false)
      closeTimeoutRef.current = null
    }, closeDelayMs)
  }, [clearCloseTimeout, closeDelayMs])

  const reset = useCallback(() => {
    clearCloseTimeout()
    setIsOpen(false)
    setIsRendered(false)
    setPosition(null)
  }, [clearCloseTimeout])

  const toggle = useCallback(() => {
    if (isOpen) {
      close()
      return
    }
    open()
  }, [close, isOpen, open])

  useEffect(() => {
    if (!isOpen) return
    updatePosition()

    const handleViewportChange = () => updatePosition()
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)

    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [isOpen, updatePosition])

  useEffect(() => {
    if (!isOpen || !closeOnOutsideClick) return

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node

      if (
        ignoreOutsideClickRef?.current &&
        ignoreOutsideClickRef.current.contains(target)
      ) {
        return
      }

      if (anchorRef.current && anchorRef.current.contains(target)) {
        return
      }

      if (panelRef?.current && panelRef.current.contains(target)) {
        return
      }

      close()
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [
    anchorRef,
    close,
    closeOnOutsideClick,
    ignoreOutsideClickRef,
    isOpen,
    panelRef,
  ])

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, closeOnEscape, isOpen])

  useEffect(() => {
    return () => {
      clearCloseTimeout()
    }
  }, [clearCloseTimeout])

  return {
    isRendered,
    isOpen,
    position,
    open,
    close,
    reset,
    toggle,
    updatePosition,
  }
}
