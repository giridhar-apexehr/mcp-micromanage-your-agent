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
          variant="light"
          className={`auto-refresh-panel__preset ${selected ? 'is-selected' : ''}`}
          aria-label={`${seconds} seconds`}
          onClick={() => onSelectPresetSeconds(seconds)}
        >
          {seconds}s
        </Button>
      )
    })
  }

  return (
    <Card className="auto-refresh-panel">
      <CardHeader className="auto-refresh-panel__header">
        <div className="auto-refresh-panel__title">Auto-refresh</div>
        <div className="auto-refresh-panel__subtitle">
          Current: {currentPollingSeconds}s
        </div>
      </CardHeader>
      <CardBody className="p-0">
        <div className="auto-refresh-panel__section">
          <div className="auto-refresh-panel__label">Presets</div>
          <div
            className="auto-refresh-panel__preset-grid"
            role="listbox"
            aria-label="Preset durations"
          >
            {renderPresetButtons()}
          </div>
        </div>

        <div className="auto-refresh-panel__section">
          <Input
            type="number"
            label="Custom (seconds)"
            labelPlacement="outside-top"
            placeholder="Enter custom seconds"
            inputMode="numeric"
            min={1}
            step={1}
            value={draftPollingSeconds}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onDraftSecondsChange(e.target.value)
            }
            classNames={{
              label: 'auto-refresh-panel__label',
              input: 'text-center',
              inputWrapper: 'auto-refresh-panel__input',
            }}
          />
        </div>

        <div className="auto-refresh-panel__footer">
          <Button
            color="primary"
            className="morphic-btn"
            isDisabled={!draftSecondsValid}
            onPress={onApply}
          >
            Apply
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
