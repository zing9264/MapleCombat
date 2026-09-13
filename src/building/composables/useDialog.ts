// 自製對話框，用來取代 window.confirm / window.prompt。
//
// 為什麼非換不可：這個 app 打包成 Tauri 桌面版，Windows 上跑的是 WebView2，
// 而 **WebView2 沒有實作 window.prompt** —— 實測主控台會直接吐
// 「prompt() is not supported.」。也就是說「命名」功能在桌面版是壞的。
// confirm() 雖然能用，但它會凍結整個畫面、不能套樣式、也沒辦法寫測試，
// 一併換掉比較一致。
//
// 介面刻意做成 Promise，讓呼叫點幾乎 1:1 對應原本的寫法：
//   if (window.confirm(msg))     →  if (await dialog.confirm({ ... }))
//   const name = window.prompt() →  const name = await dialog.prompt({ ... })

import { onScopeDispose, ref, type Ref } from 'vue'

export interface ConfirmOptions {
  title: string
  /** 訊息逐行給，不要塞 \n —— 版面由 CSS 決定，不是由字串決定 */
  lines?: string[]
  confirmLabel?: string
  cancelLabel?: string
  /** 危險操作（刪除／覆蓋）用紅色主按鈕 */
  danger?: boolean
}

export interface PromptOptions extends ConfirmOptions {
  initial?: string
  placeholder?: string
  maxLength?: number
}

export interface DialogState {
  kind: 'confirm' | 'prompt'
  title: string
  lines: string[]
  confirmLabel: string
  cancelLabel: string
  danger: boolean
  placeholder: string
  maxLength: number
}

export interface DialogController {
  state: Ref<DialogState | null>
  input: Ref<string>
  confirm(options: ConfirmOptions): Promise<boolean>
  prompt(options: PromptOptions): Promise<string | null>
  /** 使用者按下確認 */
  ok(): void
  /** 使用者取消、按 Esc、或點背景 */
  cancel(): void
}

type Settle = (value: boolean | string | null) => void

export function useDialog(): DialogController {
  const state = ref<DialogState | null>(null)
  const input = ref('')
  let settle: Settle | null = null

  /** 結束目前這個對話框並回覆呼叫端 */
  function finish(value: boolean | string | null): void {
    const pending = settle
    settle = null
    state.value = null
    pending?.(value)
  }

  function open(next: DialogState, initial: string): Promise<boolean | string | null> {
    // 前一個還沒回覆就又開一個的話，先把它當成取消收掉，
    // 否則那個 Promise 永遠不會 settle，呼叫端會卡住。
    if (settle) finish(state.value?.kind === 'prompt' ? null : false)

    input.value = initial
    state.value = next
    return new Promise((resolve) => {
      settle = resolve
    })
  }

  function base(options: ConfirmOptions, kind: 'confirm' | 'prompt'): DialogState {
    return {
      kind,
      title: options.title,
      lines: options.lines ?? [],
      confirmLabel: options.confirmLabel ?? '確認',
      cancelLabel: options.cancelLabel ?? '取消',
      danger: options.danger ?? false,
      placeholder: '',
      maxLength: 0,
    }
  }

  async function confirm(options: ConfirmOptions): Promise<boolean> {
    return (await open(base(options, 'confirm'), '')) === true
  }

  async function prompt(options: PromptOptions): Promise<string | null> {
    const result = await open(
      {
        ...base(options, 'prompt'),
        placeholder: options.placeholder ?? '',
        maxLength: options.maxLength ?? 0,
      },
      options.initial ?? '',
    )
    return typeof result === 'string' ? result : null
  }

  function ok(): void {
    finish(state.value?.kind === 'prompt' ? input.value : true)
  }

  function cancel(): void {
    finish(state.value?.kind === 'prompt' ? null : false)
  }

  // 對話框開著時元件被卸載（例如切換分頁），Promise 不收掉就會永遠懸著
  onScopeDispose(() => {
    if (settle) cancel()
  })

  return { state, input, confirm, prompt, ok, cancel }
}
