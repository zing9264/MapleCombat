// 萌獸（萌獸）：逐條記錄每一隻提供的詞條。
//
// 為什麼終傷要跟其他詞條分開存：
//   終傷是**乘算**，而且遊戲是以 float32 累加器逐條相加的（見 src/core/familiar.ts）；
//   魔力%／物攻% 則是**加算**，直接進公式的 percentAtk。
//   兩者混在一起遲早會被當成可以相加的同一種東西，那會算錯。
//
// 為什麼不做成「裝備」放進物品欄與換裝比較：
//   換裝時萌獸不會變，前後相減本來就會抵銷，放進去只是多餘。
//
// 使用者的原話是「基底名稱不重要，上面給的數值才是有影響的」，
// 所以名稱只是給人看的備註，可以留空。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { famMultFromSources } from '@/core/familiar'

const STORAGE_KEY = 'mbFamiliarV1'
const MAX_LABEL_LENGTH = 20

export interface FamiliarLine {
  id: string
  /** 顯示用備註，可留空 */
  label: string
  /** 最終傷害 %，**乘算** */
  finalDamage: number
  /** 魔法攻擊力 %，加算 */
  magicPowerPercent: number
  /** 攻擊力 %，加算 */
  attackPowerPercent: number
}

export type FamiliarInit = Partial<Omit<FamiliarLine, 'id'>>

/**
 * 遊戲裡的標準終傷值：主萌獸每條 20%（超貴萌獸 25%），羈絆每條 2%（最多 4 條）。
 * 20% 與 25% 互斥 —— 整組主萌獸要嘛全 20、要嘛全 25，不會混用。
 * 這裡只提供快速選項，不強制，因為玩家可能遇到我們沒收錄的來源。
 */
export const FAMILIAR_PRESETS: ReadonlyArray<{ label: string; value: number }> = [
  { label: '主萌獸', value: 20 },
  { label: '主萌獸（超貴）', value: 25 },
  { label: '羈絆', value: 2 },
]

function createId(): string {
  return `fam_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
}

const num = (value: unknown): number => Number(value) || 0

function load(): FamiliarLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // 舊版存檔只有 finalDamage，缺的欄位補 0，不要讓它變成 undefined 汙染加總
    return (parsed as FamiliarLine[])
      .filter((line) => line && typeof line === 'object')
      .map((line) => ({
        id: String(line.id || createId()),
        label: String(line.label ?? ''),
        finalDamage: num(line.finalDamage),
        magicPowerPercent: num(line.magicPowerPercent),
        attackPowerPercent: num(line.attackPowerPercent),
      }))
  } catch {
    return []
  }
}

export const useFamiliarStore = defineStore('buildingFamiliar', () => {
  const lines = ref<FamiliarLine[]>(load())
  const lastError = ref('')

  /** 終傷的逐條數值，直接餵給戰鬥力公式的 famFinalSources */
  const sources = computed(() => lines.value.map((line) => line.finalDamage).filter((n) => n !== 0))

  /** 終傷總和；僅供顯示，計算一律用逐條 */
  const totalPercent = computed(() => sources.value.reduce((sum, n) => sum + n, 0))

  /** float32 逐條累加後的倍率，與遊戲內運算順序一致 */
  const multiplier = computed(() => famMultFromSources(sources.value))

  /** 魔力%／物攻% 是加算，直接相加即可 */
  const magicPowerPercent = computed(() =>
    lines.value.reduce((sum, line) => sum + line.magicPowerPercent, 0),
  )
  const attackPowerPercent = computed(() =>
    lines.value.reduce((sum, line) => sum + line.attackPowerPercent, 0),
  )

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines.value))
      lastError.value = ''
    } catch (error) {
      lastError.value = `萌獸儲存失敗：${(error as Error).message}`
    }
  }

  function add(init: FamiliarInit = {}): FamiliarLine {
    const line: FamiliarLine = {
      id: createId(),
      label: (init.label ?? '').slice(0, MAX_LABEL_LENGTH),
      finalDamage: num(init.finalDamage),
      magicPowerPercent: num(init.magicPowerPercent),
      attackPowerPercent: num(init.attackPowerPercent),
    }
    lines.value.push(line)
    persist()
    return line
  }

  function update(id: string, patch: FamiliarInit): void {
    const target = lines.value.find((line) => line.id === id)
    if (!target) return
    if (patch.label !== undefined) target.label = patch.label.slice(0, MAX_LABEL_LENGTH)
    if (patch.finalDamage !== undefined) target.finalDamage = num(patch.finalDamage)
    if (patch.magicPowerPercent !== undefined) {
      target.magicPowerPercent = num(patch.magicPowerPercent)
    }
    if (patch.attackPowerPercent !== undefined) {
      target.attackPowerPercent = num(patch.attackPowerPercent)
    }
    persist()
  }

  function remove(id: string): void {
    lines.value = lines.value.filter((line) => line.id !== id)
    persist()
  }

  function clear(): void {
    lines.value = []
    persist()
  }

  return {
    lines,
    sources,
    totalPercent,
    multiplier,
    magicPowerPercent,
    attackPowerPercent,
    lastError,
    add,
    update,
    remove,
    clear,
  }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useFamiliarStore, import.meta.hot))
}
