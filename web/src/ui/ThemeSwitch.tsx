import { Monitor, Moon, Sun, type Icon } from '@phosphor-icons/react'
import { useRef, type KeyboardEvent } from 'react'
import type { ThemeChoice } from '../storage/preferences.ts'
import { nextRadioIndex } from './menuKeys.ts'

const CHOICES = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
] as const satisfies readonly {
  value: ThemeChoice
  label: string
  Icon: Icon
}[]

/**
 * Home's Theme control: a segmented control of three icon radios
 * (`docs/ui.md`, Home). Arrow keys move and select, as in a native radio
 * group; only the checked radio is in the Tab order.
 */
export function ThemeSwitch({
  choice,
  onChoose,
}: {
  choice: ThemeChoice
  onChoose(choice: ThemeChoice): void
}) {
  const radios = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent) {
    const next = nextRadioIndex(
      event.key,
      CHOICES.findIndex(({ value }) => value === choice),
      CHOICES.length,
    )
    if (next === null) return
    event.preventDefault()
    radios.current[next]?.focus()
    onChoose(CHOICES[next].value)
  }

  return (
    <div
      className="theme-switch"
      role="radiogroup"
      aria-label="Theme"
      onKeyDown={onKeyDown}
    >
      {CHOICES.map(({ value, label, Icon }, index) => (
        <button
          key={value}
          ref={(element) => {
            radios.current[index] = element
          }}
          type="button"
          role="radio"
          aria-checked={value === choice}
          aria-label={label}
          title={label}
          tabIndex={value === choice ? 0 : -1}
          onClick={() => onChoose(value)}
        >
          <Icon size={20} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
