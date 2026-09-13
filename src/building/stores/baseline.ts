// 戰鬥力基準裡由玩家自己抄進來的那一部分。
//
// 推導得到的（AP 配點、裝備、寶石、符文、極限屬性、寵物、萌獸）由 core/baseline.ts 算，
// 不存在這裡 —— 那些會隨同步更新，存起來只會變成過期資料。
// 這裡存的是玩家從遊戲屬性明細抄下來的［套用中的數值］，用來覆寫推導值。
//
// 值用字串存而不是數字：輸入框綁的是字串，空字串與 0 的語意不同
// （空 = 用自動推導，0 = 確認這項真的是 0），存成數字會把這個區別抹掉。
//
// 語意是**覆寫**：玩家抄遊戲明細的［套用中的數值］，填了就以填的為準。
// 早期版本要玩家「填差額」（總值減掉自動推導的部分），那要求使用者做減法，
// 多餘且容易錯 —— 實際填錯過一次才改成現在這樣。

import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { emptyManualBaseline, type ManualBaseline } from '../core/baseline'

const STORAGE_KEY = 'mbBaselineV1'
const CHOICE_KEY = 'mbBaselineChoiceV1'

export type BaselineFieldId = keyof ManualBaseline

export type BaselineInput = Record<BaselineFieldId, string>

export interface BaselineFieldDef {
  id: BaselineFieldId
  label: string
  suffix: string
}

export interface BaselineColumn {
  label: string
  suffix: string
}

export interface BaselineRow {
  title: string
  cells: BaselineFieldId[]
}

/**
 * 排成表格而不是一堆「標籤＋輸入框」：欄位名稱只出現在表頭一次，
 * 每一列就是遊戲明細裡的一個能力值，對著抄的時候視線不用來回跳。
 */
export const STAT_COLUMNS: readonly BaselineColumn[] = [
  { label: '基本數值', suffix: '' },
  { label: '百分比', suffix: '%' },
  { label: '％未套用', suffix: '' },
  { label: '技能', suffix: '' },
  { label: '技能', suffix: '%' },
]

export const STAT_ROWS: readonly BaselineRow[] = [
  {
    title: '主屬性',
    cells: ['mainFlat', 'mainPercent', 'mainNoApply', 'mainSkillFlat', 'mainSkillPercent'],
  },
  {
    title: '副屬性',
    cells: ['subFlat', 'subPercent', 'subNoApply', 'subSkillFlat', 'subSkillPercent'],
  },
  {
    title: '攻擊力／魔力',
    cells: ['atkFlat', 'atkPercent', 'atkNoApply', 'atkSkillFlat', 'atkSkillPercent'],
  },
]

/** 傷害類沒有基底與 ％ 的交互作用，只有「數值」與「技能」兩欄 */
export const DAMAGE_COLUMNS: readonly BaselineColumn[] = [
  { label: '數值', suffix: '%' },
  { label: '技能', suffix: '%' },
]

export const DAMAGE_ROWS: readonly BaselineRow[] = [
  { title: '傷害', cells: ['damage', 'damageSkill'] },
  { title: 'BOSS傷害', cells: ['bossDamage', 'bossDamageSkill'] },
  { title: '爆擊傷害', cells: ['critDamage', 'critDamageSkill'] },
]

/**
 * 上游「特殊項目」。這些**不在**遊戲屬性明細的面板值裡，是額外加進公式的，
 * 所以對帳表六項全綠也看不出少了它們 —— 只有重算的戰鬥力會偏。
 * 實測缺這一整組會高 11.4%（375,224,878 對遊戲的 336,871,381）。
 *
 * 排成一組小表而不是一堆輸入框：欄位少、又都是「有就填、沒有就空著」，
 * 表頭寫一次就夠。
 */
export interface BaselineTable {
  /** 說明這張表在補什麼，對不上時用來定位 */
  hint?: string
  columns: readonly BaselineColumn[]
  rows: readonly BaselineRow[]
}

export const EXTRA_TABLES: readonly BaselineTable[] = [
  {
    hint: '武器校正：留空用同步資料推導，填了就以填的為準',
    columns: [
      { label: '星力', suffix: '' },
      { label: '卷軸攻', suffix: '' },
      { label: '星火階', suffix: 'T' },
      { label: '武器總攻', suffix: '' },
    ],
    rows: [
      {
        title: '武器',
        cells: ['weaponStar', 'weaponScrollAtk', 'weaponFlameLevel', 'weaponTotalAtk'],
      },
    ],
  },
  {
    hint: '女皇祝福是技能（預設為點滿的值）、P寵攻擊照寵物件數推（1套8／2套18／3套36）；灰字就是留空會用到的值，不對就覆寫',
    columns: [
      { label: '女皇祝福', suffix: '' },
      { label: 'P寵攻擊', suffix: '' },
    ],
    rows: [{ title: '其他', cells: ['empressBless', 'petAtk'] }],
  },
  {
    hint: '活動加成，API 撈不到，只能自己填',
    columns: [
      { label: '攻擊', suffix: '' },
      { label: '全屬', suffix: '' },
      { label: 'B傷', suffix: '%' },
      { label: '爆傷', suffix: '%' },
      { label: 'HP', suffix: '' },
    ],
    rows: [
      {
        title: '活動',
        cells: ['eventAtk', 'eventAllStat', 'eventBossDmg', 'eventCritDmg', 'eventHP'],
      },
    ],
  },
  {
    columns: [
      { label: '攻擊', suffix: '' },
      { label: 'B傷', suffix: '%' },
    ],
    rows: [{ title: '師徒', cells: ['mentorAtk', 'mentorBossDmg'] }],
  },
  {
    columns: [
      { label: '主屬', suffix: '' },
      { label: '副屬', suffix: '' },
      { label: '攻擊', suffix: '' },
      { label: '主屬', suffix: '%' },
    ],
    rows: [
      {
        title: '結界',
        cells: ['barrierMainStat', 'barrierSubStat', 'barrierAtk', 'barrierMainStatPercent'],
      },
    ],
  },
]

export interface BaselineChoice {
  /** 武器系列；空字串＝用武器名稱推導 */
  weaponSet: string
  /** 創世武器 10% 終傷；空字串＝由武器系列推定 */
  genesisFinal: '' | 'on' | 'off'
}

function emptyChoice(): BaselineChoice {
  return { weaponSet: '', genesisFinal: '' }
}

function loadChoice(): BaselineChoice {
  try {
    const raw = localStorage.getItem(CHOICE_KEY)
    if (!raw) return emptyChoice()
    const parsed = JSON.parse(raw) as Partial<BaselineChoice>
    return {
      weaponSet: typeof parsed.weaponSet === 'string' ? parsed.weaponSet : '',
      genesisFinal:
        parsed.genesisFinal === 'on' || parsed.genesisFinal === 'off' ? parsed.genesisFinal : '',
    }
  } catch {
    return emptyChoice()
  }
}

function emptyInput(): BaselineInput {
  const result = {} as BaselineInput
  for (const key of Object.keys(emptyManualBaseline()) as BaselineFieldId[]) {
    result[key] = ''
  }
  return result
}

function load(): BaselineInput {
  const result = emptyInput()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // 只取認得的欄位，舊版殘留的鍵不要帶進來
    for (const key of Object.keys(result) as BaselineFieldId[]) {
      const value = parsed?.[key]
      if (typeof value === 'string') result[key] = value
    }
    return result
  } catch {
    return emptyInput()
  }
}

export const useBaselineStore = defineStore('buildingBaseline', () => {
  const input = ref<BaselineInput>(load())
  const choice = ref<BaselineChoice>(loadChoice())
  const lastError = ref('')

  /** 轉成數字給計算用；空字串當 0 */
  const manual = computed<ManualBaseline>(() => {
    const result = emptyManualBaseline()
    for (const key of Object.keys(result) as BaselineFieldId[]) {
      result[key] = Number(input.value[key]) || 0
    }
    return result
  })

  /** 有沒有填過任何一格 */
  const hasAny = computed(() =>
    Object.values(input.value).some((value) => String(value).trim() !== ''),
  )

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input.value))
      lastError.value = ''
    } catch (error) {
      lastError.value = `基準儲存失敗：${(error as Error).message}`
    }
  }

  function set(id: BaselineFieldId, value: string): void {
    input.value[id] = value
    persist()
  }

  function setChoice<K extends keyof BaselineChoice>(key: K, value: BaselineChoice[K]): void {
    choice.value[key] = value
    try {
      localStorage.setItem(CHOICE_KEY, JSON.stringify(choice.value))
    } catch (error) {
      lastError.value = `基準儲存失敗：${(error as Error).message}`
    }
  }

  function clear(): void {
    input.value = emptyInput()
    choice.value = emptyChoice()
    persist()
    try {
      localStorage.removeItem(CHOICE_KEY)
    } catch {
      // 清不掉只是殘留選擇，不值得讓整頁掛掉
    }
  }

  return { input, choice, manual, hasAny, lastError, set, setChoice, clear }
})

// 開發時熱更新這個檔案會重新執行模組，但 Pinia 仍持有舊的 store 實例 ——
// 新程式讀新欄位就會讀到 undefined 而整頁當掉（實際發生過，還連帶把使用者
// 已經輸入的值洗掉）。掛上 acceptHMRUpdate 讓 store 跟著模組一起換。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useBaselineStore, import.meta.hot))
}
