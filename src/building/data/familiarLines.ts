// 萌獸詞條表：查「萌獸能有哪些詞條」，並把詞條換算成戰鬥力公式吃得下的數值。
//
// 遊戲裡每隻萌獸有**三條**詞條，而且**可以重複**（實際看過巡邏機器人兩條都是
// 「加持技能持續時間 +50%」）。所以這裡只提供選單，數值由玩家自己填。
//
// 為什麼不連數值一起給：表上的值是滿值，實際數字隨萌獸階級而不同
// （傳說的暗黑半人馬是魔攻 +14%，表上寫 +20%）。階級係數沒在資料裡找到，
// 與其猜一個係數，不如讓玩家照抄遊戲畫面 —— 那本來就是精確的。

import raw from './potentials.json'

export interface FamiliarLineDef {
  name: string
  /** 顯示模板，{x} 是數值 */
  template: string
  /** 對應的數值欄位；null 代表與戰鬥力無關 */
  field: string | null
  /** 滿值，僅供參考（放在下拉選單當提示） */
  maxValue: { x?: number; y?: number } | null
}

export const FAMILIAR_LINES: readonly FamiliarLineDef[] = raw.familiarLines as FamiliarLineDef[]

const BY_NAME = new Map(FAMILIAR_LINES.map((line) => [line.name, line]))

export function familiarLineDef(name: string): FamiliarLineDef | undefined {
  return BY_NAME.get(name)
}

/** 把詞條套上數值，變成給人看的字串 */
export function familiarLineText(name: string, value: number): string {
  const def = BY_NAME.get(name)
  if (!def) return name
  return def.template.replace('{x}', String(value)).replace('{y}', String(value))
}

/**
 * 詞條對戰鬥力的貢獻。
 *
 * 只認得出「進得了公式」的那幾種，其餘（爆擊機率、無視防禦、加持時間、
 * 中毒暈眩之類）一律回 null —— 它們不在戰鬥力公式裡（見 core/baseline.ts）。
 * 回 null 不是漏掉，是確定不算。
 */
export type FamiliarEffect =
  | { kind: 'finalDamage'; value: number }
  | { kind: 'attackPercent'; value: number; magic: boolean }
  | { kind: 'statPercent'; value: number; stat: 'str' | 'dex' | 'int' | 'luk' }
  | { kind: 'allStatPercent'; value: number }

export function familiarEffect(name: string, value: number): FamiliarEffect | null {
  const field = BY_NAME.get(name)?.field
  if (!field || !value) return null

  switch (field) {
    case 'finalDam':
      return { kind: 'finalDamage', value }
    case 'madR':
      return { kind: 'attackPercent', value, magic: true }
    case 'padR':
      return { kind: 'attackPercent', value, magic: false }
    case 'strR':
      return { kind: 'statPercent', value, stat: 'str' }
    case 'dexR':
      return { kind: 'statPercent', value, stat: 'dex' }
    case 'intR':
      return { kind: 'statPercent', value, stat: 'int' }
    case 'lukR':
      return { kind: 'statPercent', value, stat: 'luk' }
    case 'allStatR':
      return { kind: 'allStatPercent', value }
    default:
      // 固定值（STR +25、魔攻 +25…）刻意也不算：萌獸給的是萌獸自己的數值，
      // 不是角色的。只有 % 類與終傷會反映到角色面板上。
      return null
  }
}

/** 選單分兩組：會影響戰鬥力的排前面，其餘的放後面 */
export const FAMILIAR_LINE_GROUPS: ReadonlyArray<{
  label: string
  lines: readonly FamiliarLineDef[]
}> = [
  {
    label: '影響戰鬥力',
    lines: FAMILIAR_LINES.filter((line) => familiarEffect(line.name, 1) !== null),
  },
  {
    label: '不影響戰鬥力',
    lines: FAMILIAR_LINES.filter((line) => familiarEffect(line.name, 1) === null),
  },
]
