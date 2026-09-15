// 分頁列與儀表板之間的橋。
//
// 分頁列現在同時是導覽與目錄：點「角色資料」是切到總覽 + 捲到角色資料那一段。
// 這需要兩個方向的溝通 —— 分頁列要求捲到某段，儀表板回報現在捲到哪段 ——
// 兩邊在元件樹上沒有父子關係，所以用一個很小的 store 接起來。
//
// 不放進上游的 ui store：那支是上游的，加欄位等於多一道合併時的接縫。

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useUiStore, type ViewKey } from '@/stores/ui'

/** 哪些舊分頁被併進哪個儀表板，以及對應的錨點 id */
export const ANCHOR_OF: Readonly<Record<string, { view: ViewKey; id: string }>> = {
  equipmentSets: { view: 'overview', id: 'mb-sync' },
  character: { view: 'overview', id: 'mb-character' },
  familiar: { view: 'overview', id: 'mb-familiar' },
  itemLibrary: { view: 'craft', id: 'mb-library' },
  workbench: { view: 'craft', id: 'mb-workbench' },
  inventory: { view: 'craft', id: 'mb-inventory' },
}

export const useDashboardStore = defineStore('buildingDashboard', () => {
  const ui = useUiStore()

  /** 儀表板回報的：現在捲到哪一段 */
  const current = ref('')
  /**
   * 分頁列要求捲到哪一段；儀表板捲完之後清空。
   *
   * 用「請求」而不是直接呼叫，是因為點分頁時目標儀表板可能還沒掛載 ——
   * 切 view 與捲動不在同一個 tick，直接捲會找不到元素。
   */
  const pending = ref('')

  /** 點分頁列：切到該儀表板並捲到對應區塊 */
  function go(key: string): void {
    const target = ANCHOR_OF[key]
    if (!target) {
      ui.activeView = key as ViewKey
      return
    }
    ui.activeView = target.view
    // 一律走 pending，由儀表板統一負責捲動與更新 current。
    // 這裡不要直接寫 current：切到另一個儀表板時，新掛載的那個會再算一次，
    // 兩邊搶著寫只會讓高亮閃一下又跳回去。
    pending.value = target.id
  }

  function consume(): string {
    const id = pending.value
    pending.value = ''
    return id
  }

  return { current, pending, go, consume }
})
