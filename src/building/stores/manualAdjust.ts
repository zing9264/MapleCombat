// 手動覆寫：API 撈不到、只能由玩家自己填的項目。
//
// 判準很簡單：**凡是會顯示在遊戲「屬性視窗」上的，就已經在 final_stat 裡了**，
// 不該再手動填一次，否則重複計算。實測已確認師徒、女皇祝福、寵物、武器星火
// 都含在裡面（BOSS傷害那次拆解加總到 439，其中就有一條師徒系統 5%）。
//
// 真正撈不到的只有兩類：
//   1. 活動技能 buff —— 要施放才生效，擷取當下沒開就不在面板上
//   2. 萌獸終傷 —— 不是屬性視窗的欄位
//
// 其中萌獸已經獨立成 stores/familiar.ts：它是 float32 逐條累加的**乘數**，
// 跟這裡其他加法式的數值性質完全不同，混在一起遲早會被當成可以相加的東西。
// 所以這個 store 現在只剩活動 buff。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'

const STORAGE_KEY = 'mbManualAdjustV1'

export interface ManualAdjust {
  /** 活動技能：攻擊力／魔力 */
  eventAtk: string
  /** 活動技能：全屬性 */
  eventAllStat: string
  /** 活動技能：BOSS 傷害 % */
  eventBossDmg: string
  /** 活動技能：爆擊傷害 % */
  eventCritDmg: string
  /** 活動技能：MaxHP */
  eventHp: string
}

function empty(): ManualAdjust {
  return {
    eventAtk: '',
    eventAllStat: '',
    eventBossDmg: '',
    eventCritDmg: '',
    eventHp: '',
  }
}

function load(): ManualAdjust {
  const result = empty()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // 只取認得的欄位，不要用 { ...empty(), ...parsed } 展開。
    // 展開會把舊版存檔殘留的鍵一起帶進來（例如已經搬到 familiar store 的
    // famFinalSources），那些死資料會被一路寫進桌面版的資料檔；
    // 而且等於讓存檔內容可以塞進任意欄位。
    for (const key of Object.keys(result) as (keyof ManualAdjust)[]) {
      const value = parsed?.[key]
      if (typeof value === 'string') result[key] = value
    }
    return result
  } catch {
    return empty()
  }
}

/** 這些欄位的顯示標籤與說明 */
export const MANUAL_FIELDS: ReadonlyArray<{
  key: keyof ManualAdjust
  label: string
  suffix: string
}> = [
  { key: 'eventAtk', label: '活動 攻擊力/魔力', suffix: '' },
  { key: 'eventAllStat', label: '活動 全屬性', suffix: '' },
  { key: 'eventBossDmg', label: '活動 BOSS傷害', suffix: '%' },
  { key: 'eventCritDmg', label: '活動 爆擊傷害', suffix: '%' },
  { key: 'eventHp', label: '活動 MaxHP', suffix: '' },
]

export const useManualAdjustStore = defineStore('buildingManualAdjust', () => {
  const values = ref<ManualAdjust>(load())

  const hasAny = computed(() => Object.values(values.value).some((v) => String(v).trim() !== ''))

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values.value))
    } catch {
      // 容量爆掉時不要讓整頁掛掉；這幾格重填成本很低
    }
  }

  function set(key: keyof ManualAdjust, value: string): void {
    values.value[key] = value
    persist()
  }

  function clear(): void {
    values.value = empty()
    persist()
  }

  return { values, hasAny, set, clear }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useManualAdjustStore, import.meta.hot))
}
