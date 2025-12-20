import React, { useState, useEffect } from 'react'
import { Button } from '@heroui/button'
import { Card, CardBody } from '@heroui/card'
import { useBreakpoint } from '../utils/responsiveUtils'

/**
 * Component that detects mobile device orientation and displays a warning
 * Shows a recommendation to use landscape orientation using HeroUI primitives
 */
export const OrientationWarning: React.FC = () => {
  const breakpoint = useBreakpoint()
  const [isPortrait, setIsPortrait] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)

  /**
   * Detect screen orientation and update state
   */
  useEffect(() => {
    const checkOrientation = () => {
      if (window.matchMedia('(orientation: portrait)').matches) {
        setIsPortrait(true)
      } else {
        setIsPortrait(false)
      }
    }

    // Initial check
    checkOrientation()

    // Orientation change listener
    window.addEventListener('resize', checkOrientation)

    // Cleanup
    return () => {
      window.removeEventListener('resize', checkOrientation)
    }
  }, [])

  /**
   * Determine whether to show the warning based on orientation and breakpoint
   */
  const shouldShowWarning =
    isPortrait && ['xs', 'sm'].includes(breakpoint) && !isDismissed

  if (!shouldShowWarning) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      <Card
        className="m-2 shadow-lg"
        classNames={{
          base: 'bg-yellow-100 dark:bg-yellow-900/20 border-t border-yellow-200 dark:border-yellow-800',
        }}
      >
        <CardBody className="p-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <span className="text-xl mr-2" aria-hidden="true">
                📱
              </span>
              <div>
                <p className="text-yellow-800 dark:text-yellow-200 font-medium">
                  Landscape orientation recommended
                </p>
                <p className="text-yellow-700 dark:text-yellow-300 text-xs">
                  Rotate your device to landscape for a better experience.
                </p>
              </div>
            </div>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              onClick={() => setIsDismissed(true)}
              className="text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
              aria-label="Close warning"
            >
              ✕
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
