// 儀表板的錨點導覽：分頁列點一下 → 捲到該區塊；捲動時反過來標示現在在哪一段。
//
// 為什麼要有「捲動時反標」：分頁列現在同時是導覽與目錄。只在點擊時更新的話，
// 使用者捲到別區之後標示還停在原地，比沒有標示更誤導。

import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 上游的工具列是 sticky 的，錨點要往下讓開它，不然標題會被蓋住 */
const TOOLBAR_OFFSET = 64

export interface AnchorNav {
  /** 目前捲到的區塊 id */
  current: Ref<string>
  /** 捲到指定區塊 */
  scrollTo: (id: string) => void
  /** 重新判斷一次現在在哪一段（捲動動畫結束後用） */
  sync: () => void
}

/**
 * 為什麼不用 IntersectionObserver：
 *
 * 最後一段通常很短（物品欄只有 79px）。捲到底時它仍然在視窗下半部，
 * 任何「看視窗上緣有沒有進入」的觀察帶都涵蓋不到它，於是分頁列永遠不會標到
 * 最後一個標籤 —— 實際踩過：點「製作台」，亮起來的是「裝備庫」。
 *
 * 改成自己算：取最後一個「頂端已經捲過工具列」的區塊，並且捲到底時
 * 直接認定是最後一段。區塊只有三個，一次 pass 的成本可以忽略。
 */
export function useAnchorNav(ids: readonly string[]): AnchorNav {
  const current = ref(ids[0] ?? '')
  let frame = 0

  function sync(): void {
    const scrollBottom = window.scrollY + window.innerHeight
    // 捲到底：最後一段再短也算「現在在看」
    if (scrollBottom >= document.documentElement.scrollHeight - 2) {
      current.value = ids[ids.length - 1] ?? current.value
      return
    }

    let found = ids[0] ?? ''
    for (const id of ids) {
      const el = document.getElementById(id)
      if (!el) continue
      if (el.getBoundingClientRect().top <= TOOLBAR_OFFSET + 1) found = id
    }
    current.value = found
  }

  function onScroll(): void {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      sync()
    })
  }

  function scrollTo(id: string): void {
    const el = document.getElementById(id)
    if (!el) return
    // scrollIntoView 沒辦法扣掉 sticky 工具列的高度，所以自己算
    const top = el.getBoundingClientRect().top + window.scrollY - TOOLBAR_OFFSET
    window.scrollTo({ top, behavior: 'smooth' })
    current.value = id
  }

  onMounted(() => {
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    sync()
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll)
    window.removeEventListener('resize', onScroll)
    if (frame) cancelAnimationFrame(frame)
  })

  return { current, scrollTo, sync }
}
