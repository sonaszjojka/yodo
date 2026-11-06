import {
  ArrowLineUp,
  ClipboardText,
  Copy,
  CopySimple,
  Trash,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { Editor } from '../core/editor/editor.ts'

interface MoreItem {
  label: string
  icon: ReactNode
  run(editor: Editor): void
  /** Whether the item is off; only "Paste style" can be. */
  disabled?(canPaste: boolean): boolean
}

/** The "more" menu's items in order; their count sizes the menu (menuSize). */
export const MORE_ITEMS: MoreItem[] = [
  {
    label: 'Duplicate',
    icon: <CopySimple size={18} aria-hidden />,
    run: (editor) => editor.duplicateSelected(),
  },
  {
    label: 'Copy style',
    icon: <Copy size={18} aria-hidden />,
    run: (editor) => editor.copyStyle(),
  },
  {
    label: 'Paste style',
    icon: <ClipboardText size={18} aria-hidden />,
    run: (editor) => editor.pasteStyle(),
    disabled: (canPaste) => !canPaste,
  },
  {
    label: 'Bring to front',
    icon: <ArrowLineUp size={18} aria-hidden />,
    run: (editor) => editor.arrange('front'),
  },
  {
    label: 'Delete',
    icon: <Trash size={18} aria-hidden />,
    run: (editor) => editor.deleteSelected(),
  },
]
