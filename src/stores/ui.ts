import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { getStoredString } from './persist'

export type ViewKey =
  | 'overview'
  | 'craft'
  | 'character'
  | 'characterInput'
  | 'equipmentChange'
  | 'gearCompare'
  | 'valueConversion'
  | 'equipmentSets'
  | 'itemLibrary'
  | 'workbench'
  | 'familiar'
  | 'inventory'
export type CalculatorMode = 'calculator' | 'effStats'

const VALID_VIEWS: ViewKey[] = [
  'overview',
  'craft',
  'character',
  'characterInput',
  'equipmentChange',
  'gearCompare',
  'valueConversion',
  'equipmentSets',
  'itemLibrary',
  'workbench',
  'familiar',
  'inventory',
]
const VALID_MODES: CalculatorMode[] = ['calculator', 'effStats']

function restoreView(): ViewKey {
  // view id 遷移：current→characterInput、equipment→valueConversion；
  // 已移除的 apiImport 分頁退回 characterInput
  //
  // 預設是「總覽」而不是上游的手動輸入：MapleBuilding 的每一頁都要有同步過的
  // 資料才有東西可看，第一次打開停在手動輸入只會讓人不知道要幹嘛。
  // 原本的 7 個自有分頁併成兩個儀表板：同步裝備／角色資料／萌獸 → 總覽，
  // 裝備庫／製作台／物品欄 → 製作。舊的 key 還留在 ViewKey 裡當錨點用。
  const migration: Record<string, ViewKey> = {
    current: 'characterInput',
    equipment: 'valueConversion',
    equipmentSets: 'overview',
    character: 'overview',
    familiar: 'overview',
    itemLibrary: 'craft',
    workbench: 'craft',
    inventory: 'craft',
  }
  let saved = getStoredString('activeView', 'overview')
  if (migration[saved]) saved = migration[saved]
  return VALID_VIEWS.includes(saved as ViewKey) ? (saved as ViewKey) : 'overview'
}

function restoreMode(): CalculatorMode {
  const saved = getStoredString('activeCalculatorMode', 'calculator')
  return VALID_MODES.includes(saved as CalculatorMode) ? (saved as CalculatorMode) : 'calculator'
}

export const useUiStore = defineStore('ui', () => {
  const activeView = ref<ViewKey>(restoreView())
  const calculatorMode = ref<CalculatorMode>(restoreMode())
  // 桌面緊湊版 Buff 面板收合狀態（store 層級讓 combat/eff 兩個面板實例同步），預設收合
  const buffPanelOpen = ref(getStoredString('compactBuffPanelOpen', 'false') === 'true')
  // 裝備變更／數值換算共用的 Buff 抽屜；每次啟動預設收合。
  const buffDrawerOpen = ref(false)

  watch(activeView, (view) => localStorage.setItem('activeView', view), { flush: 'sync' })
  watch(calculatorMode, (mode) => localStorage.setItem('activeCalculatorMode', mode), {
    flush: 'sync',
  })
  watch(buffPanelOpen, (open) => localStorage.setItem('compactBuffPanelOpen', String(open)), {
    flush: 'sync',
  })

  return { activeView, calculatorMode, buffPanelOpen, buffDrawerOpen }
})
