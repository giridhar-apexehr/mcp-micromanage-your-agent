/**
 * @file useThemeMode
 *
 * React hook for managing the application's theme mode.
 *
 * Responsibilities:
 * - Persist theme preference to localStorage under `themeMode`.
 * - Migrate legacy `darkMode` localStorage setting when present.
 * - Track system preference when `themeMode === 'system'`.
 * - Apply/remove the `dark-mode` class on the root document element.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'

export type ThemeMode = 'system' | 'light' | 'dark'

export type UseThemeModeResult = {
  themeMode: ThemeMode
  isDarkMode: boolean
  toggleThemeMode: () => void
}

/**
 * Hook that manages the theme mode selection and applies the `dark-mode` class.
 */
export const useThemeMode = (): UseThemeModeResult => {
  /**
   * Apply the theme-related classes on the root document element.
   *
   * This project uses `.dark-mode` for both HeroUI/Tailwind dark variants (via Tailwind config)
   * and morphic CSS variables. Only `.dark-mode` is applied to avoid duplication.
   *
   * @param isDarkModeNext Whether dark mode should be active.
   */
  const applyThemeModeClassNames = useCallback((isDarkModeNext: boolean) => {
    const root = document.documentElement

    if (isDarkModeNext) {
      root.classList.add('dark-mode')
      return
    }

    root.classList.remove('dark-mode')
  }, [])

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedThemeMode = localStorage.getItem('themeMode')
    if (
      savedThemeMode === 'system' ||
      savedThemeMode === 'light' ||
      savedThemeMode === 'dark'
    ) {
      return savedThemeMode
    }

    const legacyDarkMode = localStorage.getItem('darkMode')
    if (legacyDarkMode !== null) {
      return legacyDarkMode === 'true' ? 'dark' : 'light'
    }

    return 'system'
  })

  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  )

  const isDarkMode = useMemo(() => {
    return themeMode === 'dark'
      ? true
      : themeMode === 'light'
        ? false
        : systemPrefersDark
  }, [themeMode, systemPrefersDark])

  const toggleThemeMode = useCallback(() => {
    setThemeMode((prev) => {
      if (prev === 'system') return 'dark'
      if (prev === 'dark') return 'light'
      return 'system'
    })
  }, [])

  // Add/remove class from html tag when theme setting changes
  useEffect(() => {
    applyThemeModeClassNames(isDarkMode)

    localStorage.setItem('themeMode', themeMode)
  }, [applyThemeModeClassNames, isDarkMode, themeMode])

  useEffect(() => {
    if (themeMode !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }

    setSystemPrefersDark(mediaQuery.matches)

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [themeMode])

  return {
    themeMode,
    isDarkMode,
    toggleThemeMode,
  }
}
