// 裝備欄的格子排列。
//
// 照遊戲裝備視窗的位置排，五欄。空白處是遊戲裡本來就沒有格子的地方。
//
// 為什麼不直接用 API 的 item_equipment_slot：武器的部位名稱隨職業而異
// （長杖、弓、雙刀…），副武器更雜（盾牌、靈符、符咒…），寫死部位名稱會漏掉
// 其他職業。因此格子分成幾種比對方式，武器與副武器用「歸類」而不是「名稱」。

/** 格子的比對方式 */
export type SlotKind =
  | 'part' // 指定部位名稱，例如「戒指」
  | 'weapon' // 任何主武器（部位名稱隨職業而異）
  | 'secondary' // 任何副武器
  | 'pet' // 寵物本身
  | 'petItem' // 寵物裝備
  | 'familiar' // 萌獸（不是 API 的裝備，由玩家自己填）

export interface SlotCell {
  kind: SlotKind
  /** kind 為 part 時要比對的部位名稱 */
  part?: string
  /** 顯示用的標籤，空格子也會顯示 */
  label: string
}

const part = (name: string, label = name): SlotCell => ({ kind: 'part', part: name, label })

/** 副武器的部位名稱。這些不是主武器，要放在副武器格。 */
export const SECONDARY_PARTS: ReadonlySet<string> = new Set([
  '盾牌',
  '力量之盾',
  '靈符',
  '符咒',
  '遺跡',
  '深淵通行',
  '發信器',
  '魔法箭',
  '鎖鏈',
  '手鐲',
  '手環',
  '調節器',
])

/**
 * 不是武器的部位。
 * 主武器的部位名稱各職業不同，與其一一列舉，不如列出「不是武器」的，
 * 剩下的就當武器 —— 新職業上線時才不會因為沒收錄而整把武器不見。
 */
export const NON_WEAPON_PARTS: ReadonlySet<string> = new Set([
  '帽子',
  '臉飾',
  '眼飾',
  '耳環',
  '上衣',
  '套服',
  '褲/裙',
  '鞋子',
  '手套',
  '披風',
  '肩膀裝飾',
  '戒指',
  '墜飾',
  '腰帶',
  '勳章',
  '徽章',
  '胸章',
  '口袋道具',
  '機器心臟',
  '機器人',
  '圖騰',
  '寶石',
  '拼圖',
  '稱號',
  '輔助特殊技能戒指',
  ...SECONDARY_PARTS,
])

export function isWeaponPart(partName: string): boolean {
  return Boolean(partName) && !NON_WEAPON_PARTS.has(partName)
}

/** 五欄格線；null 代表該位置沒有格子 */
export const EQUIP_GRID: readonly (SlotCell | null)[][] = [
  [part('戒指'), part('臉飾'), null, part('帽子'), part('披風')],
  [part('戒指'), part('眼飾'), null, part('上衣'), part('手套')],
  [part('戒指'), part('耳環'), { kind: 'weapon', label: '武器' }, part('褲/裙'), part('鞋子')],
  [
    part('戒指'),
    part('墜飾'),
    { kind: 'secondary', label: '副武器' },
    part('肩膀裝飾'),
    part('勳章'),
  ],
  [part('腰帶'), part('墜飾'), part('徽章'), part('機器人'), part('機器心臟')],
  [
    part('口袋道具', '口袋'),
    part('輔助特殊技能戒指', '特殊戒指'),
    part('拼圖'),
    part('稱號'),
    part('胸章'),
  ],
  [
    { kind: 'pet', label: '寵物' },
    { kind: 'pet', label: '寵物' },
    { kind: 'pet', label: '寵物' },
    { kind: 'familiar', label: '萌獸' },
    null,
  ],
  [
    { kind: 'petItem', label: '寵物裝備' },
    { kind: 'petItem', label: '寵物裝備' },
    { kind: 'petItem', label: '寵物裝備' },
    null,
    null,
  ],
  [part('圖騰'), part('圖騰'), part('圖騰'), part('寶石'), null],
]
