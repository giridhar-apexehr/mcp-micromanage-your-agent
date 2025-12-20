/**
 * @file MorphicButton
 *
 * HeroUI Button wrapper that encodes morphic styling as a reusable variant.
 */

import { Button } from '@heroui/button'
import { extendVariants } from '@heroui/system'

/**
 * A HeroUI Button extended with a `morphic` variant that matches the existing
 * morphic visual language (glassy surface + subtle lift + smooth transitions).
 */
export const MorphicButton = extendVariants(
  Button,
  {
    variants: {
      morphic: {
        true: 'morphic-btn transition-transform-colors-opacity data-[pressed=true]:scale-[0.98]',
        false: '',
      },
    },
    defaultVariants: {
      morphic: true,
    },
  },
  {
    twMerge: true,
  },
)
