/**
 * @file AutoRefreshPanel
 *
 * Presentational auto-refresh settings panel using HeroUI primitives.
 *
 * Note: container positioning and open/close behavior are handled by the host.
 */

import { Button } from '@heroui/button'
import { Card, CardBody, CardHeader } from '@heroui/card'
import { Input } from '@heroui/input'

type AutoRefreshPanelProps = {
  currentPollingSeconds: number
  presetsSeconds: number[]
  draftPollingSeconds: string
  draftSecondsForSelection: number
  draftSecondsValid: boolean
  onSelectPresetSeconds: (seconds: number) => void
  onDraftSecondsChange: (value: string) => void
  onApply: () => void
}

/**
 * Auto-refresh settings panel using HeroUI primitives.
 * Preserves polling logic and user interactions.
 */
export function AutoRefreshPanel({
  currentPollingSeconds,
  presetsSeconds,
  draftPollingSeconds,
  draftSecondsForSelection,
  draftSecondsValid,
  onSelectPresetSeconds,
  onDraftSecondsChange,
  onApply,
}: AutoRefreshPanelProps) {
  /**
   * Render preset duration buttons with selection state
   */
  const renderPresetButtons = () => {
    return presetsSeconds.map((seconds) => {
      const selected = seconds === draftSecondsForSelection
      return (
        <Button
          key={seconds}
          size="sm"
          variant={selected ? 'solid' : 'bordered'}
          color={selected ? 'primary' : 'default'}
          className="min-w-unit-12"
          aria-label={`${seconds} seconds`}
          onClick={() => onSelectPresetSeconds(seconds)}
        >
          {seconds}s
        </Button>
      )
    })
  }

  return (
    <Card className="w-80">
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-1">
          <div className="text-lg font-semibold">Auto-refresh</div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Current: {currentPollingSeconds}s
          </div>
        </div>
      </CardHeader>
      <CardBody className="pt-0">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">Presets</div>
            <div
              className="flex flex-wrap gap-2"
              role="listbox"
              aria-label="Preset durations"
            >
              {renderPresetButtons()}
            </div>
          </div>

          <div>
            <Input
              type="number"
              label="Custom (seconds)"
              labelPlacement="outside"
              placeholder="Enter custom seconds"
              inputMode="numeric"
              min={1}
              step={1}
              value={draftPollingSeconds}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onDraftSecondsChange(e.target.value)}
              description="Minimum 1 second"
              classNames={{
                input: "text-center",
              }}
            />
          </div>

          <div className="pt-2">
            <Button
              color="primary"
              className="w-full"
              isDisabled={!draftSecondsValid}
              onClick={onApply}
            >
              Apply
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  )
}
