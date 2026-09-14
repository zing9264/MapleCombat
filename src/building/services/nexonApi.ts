// NEXON Open API (MapleStoryTaiwan) client。
//
// 回傳值的性質（實測）：
//   final_stat 等同「遊戲內屬性視窗當下的顯示值」— 寵物、活動 buff、師徒系統
//   的加成都已經含在裡面。因此帶入計算機時，活動/師徒那幾格必須留 0，
//   否則會重複計算。
//
// 只看得到「當下啟用的裝備 preset」：
//   遊戲提供三組裝備 preset（打王/刷怪/…），玩家會臨場切換，而 API 永遠只
//   回傳當下穿在身上的那一組 — 沒有辦法指定要查第 2、3 組。實測同一支角色在
//   兩分鐘內拿到戰鬥力 8757 萬與 3 億 1472 萬，就是因為中途切了 preset。
//   （例外：hyper-stat 端點會一次回傳三組 preset。）
//
//   所以正確的用法是：玩家切到某個 preset → 擷取 → 命名保存成一份快照，
//   每組 preset 各存一份。快照就是這個工具版本的 preset。
//
// API Key 由使用者自行到 https://openapi.nexon.com 申請，存在 localStorage，
// 不隨程式碼發佈。

const BASE = 'https://open.api.nexon.com/maplestorytw/v1'
const KEY_STORAGE = 'mbNexonApiKey'

/** Development phase 限制 5 requests/sec，請求之間至少間隔這麼久 */
const THROTTLE_MS = 220

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) || ''
}

export function setApiKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed)
  else localStorage.removeItem(KEY_STORAGE)
}

export class NexonApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'NexonApiError'
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface ErrorBody {
  error?: { name?: string; message?: string }
}

async function request<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = getApiKey()
  if (!key) throw new NexonApiError('尚未設定 API Key', 0)

  // 中文角色名需要明確編碼，交給 URLSearchParams 處理。
  const query = new URLSearchParams(params).toString()
  const response = await fetch(`${BASE}${path}?${query}`, {
    headers: { 'x-nxopen-api-key': key },
  })

  if (!response.ok) {
    let code: string | undefined
    let message = `HTTP ${response.status}`
    try {
      const body = (await response.json()) as ErrorBody
      code = body.error?.name
      if (body.error?.message) message = body.error.message
    } catch {
      // 回應不是 JSON，沿用 HTTP 狀態碼訊息
    }
    throw new NexonApiError(describeError(response.status, code, message), response.status, code)
  }

  return (await response.json()) as T
}

function describeError(status: number, code: string | undefined, fallback: string): string {
  if (code === 'OPENAPI00004') return '角色名稱格式不正確'
  if (code === 'OPENAPI00006') return '查無此角色，請確認名稱與伺服器'
  if (status === 401 || status === 403) return 'API Key 無效或已失效'
  if (status === 429) return '超過流量限制（開發階段為 5 次/秒、1000 次/日），請稍後再試'
  return fallback
}

// ── 回應型別（只宣告我們會用到的欄位）──────────────────

export interface StatEntry {
  stat_name: string
  stat_value: string
}

export interface CharacterBasic {
  character_name: string
  world_name: string
  character_class: string
  character_level: number
  character_guild_name: string | null
  character_image: string
}

export interface CharacterStat {
  character_class: string
  final_stat: StatEntry[]
  remain_ap: number
}

export interface ItemOption {
  str?: string
  dex?: string
  int?: string
  luk?: string
  max_hp?: string
  max_mp?: string
  attack_power?: string
  magic_power?: string
  armor?: string
  boss_damage?: string
  ignore_monster_armor?: string
  all_stat?: string
  damage?: string
}

export interface EquipmentItem {
  item_equipment_part: string
  item_equipment_slot: string
  item_name: string
  item_base_option: ItemOption
  item_total_option: ItemOption
  item_add_option: ItemOption
  /** 紫：卷軸 */
  item_etc_option: ItemOption
  item_starforce_option: ItemOption
  starforce: string
  /** 道具圖示的 CDN 網址 */
  item_icon?: string
  scroll_upgrade: string
  scroll_upgradeable_count: string
  /**
   * 相對於原始格數的差額，鐵鎚加開過就是負數（實測敲過 3 次的裝備是 -3）。
   * 用來還原「這件裝備原本有幾格」—— 見 core/scrollSlots.ts
   */
  scroll_resilience_count?: string
  cuttable_count: string
  golden_hammer_flag: string
  potential_option_grade: string | null
  potential_option_1: string | null
  potential_option_2: string | null
  potential_option_3: string | null
  additional_potential_option_grade: string | null
  additional_potential_option_1: string | null
  additional_potential_option_2: string | null
  additional_potential_option_3: string | null
  soul_name: string | null
  soul_option: string | null
}

export interface SetEffectTier {
  set_count: number
  set_option: string
}

export interface SetEffectEntry {
  set_name: string
  total_set_count: number
  set_effect_info: SetEffectTier[]
}

export interface PetOption {
  type: string
  value: string
}

/** 寵物與牠身上的寵物裝備。寵物裝備的數值會計入遊戲的「裝備道具」 */
export interface PetInfo {
  name: string
  itemName: string
  /** 寵物本身的圖示網址 */
  icon?: string
  /** 寵物裝備的圖示網址 */
  itemIcon?: string
  options: PetOption[]
}

export interface SymbolItem {
  symbol_name: string
  symbol_level: number
  symbol_str: string
  symbol_dex: string
  symbol_int: string
  symbol_luk: string
  symbol_force: string
}

export interface HyperStatEntry {
  stat_type: string
  stat_point: number | null
  stat_level: number
  stat_increase: string | null
}

export interface HexaStatCore {
  slot_id: string
  main_stat_name: string | null
  sub_stat_name_1: string | null
  sub_stat_name_2: string | null
  main_stat_level: number
  sub_stat_level_1: number
  sub_stat_level_2: number
  stat_grade: number
}

/** 一次擷取回來的原始資料集合 */
export interface FamiliarOption {
  option_no: number
  option_name: string
  option_value: string
}

/**
 * 一隻萌獸。`option` 裡是**實際生效的數值**，不是詞條表上的滿值 ——
 * 暗黑半人馬在這裡就是魔攻 14%、終傷 20%，跟遊戲畫面一致。
 * 這正是以前要玩家自己抄數字的原因，現在不必了。
 */
export interface FamiliarEntry {
  familiar_name: string
  familiar_nickname: string | null
  familiar_state: string
  familiar_grade: string | null
  familiar_level: number
  option_level: number
  summoned_flag: string
  /** 沒登錄羈絆時是 "not link"，否則是 link slot 的 id */
  slot_id: string
  option: FamiliarOption[]
}

export interface FamiliarLinkSlot {
  slot_id: string
  familiar_name: string | null
  active_flag: string
}

export interface FamiliarData {
  linkSlots: FamiliarLinkSlot[]
  entries: FamiliarEntry[]
}

export interface RawCharacterData {
  ocid: string
  basic: CharacterBasic
  stat: CharacterStat
  equipment: EquipmentItem[]
  setEffects: SetEffectEntry[]
  pets: PetInfo[]
  symbols: SymbolItem[]
  hyperStat: HyperStatEntry[]
  hexaStat: HexaStatCore[]
  familiars: FamiliarData
}

export interface FetchProgress {
  step: number
  total: number
  label: string
}

// ── 端點 ───────────────────────────────────────────────

export async function fetchOcid(characterName: string): Promise<string> {
  const data = await request<{ ocid: string }>('/id', { character_name: characterName })
  return data.ocid
}

/**
 * 依序擷取一隻角色的全部資料。
 * 請求之間有節流，避免撞上開發階段 5 次/秒的限制。
 */
export async function fetchCharacter(
  characterName: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<RawCharacterData> {
  const steps = [
    '查詢角色識別碼',
    '基本資訊',
    '綜合能力值',
    '裝備',
    '套裝效果',
    '寵物',
    '符文',
    '極限屬性',
    'HEXA 屬性',
    '萌獸',
  ]
  const total = steps.length
  let step = 0
  const advance = () => onProgress?.({ step: ++step, total, label: steps[step - 1] })

  advance()
  const ocid = await fetchOcid(characterName)
  const q = { ocid }

  advance()
  const basic = await request<CharacterBasic>('/character/basic', q)
  await sleep(THROTTLE_MS)

  advance()
  const stat = await request<CharacterStat>('/character/stat', q)
  await sleep(THROTTLE_MS)

  advance()
  const equipmentRes = await request<{ item_equipment: EquipmentItem[] }>(
    '/character/item-equipment',
    q,
  )
  await sleep(THROTTLE_MS)

  advance()
  const setRes = await request<{ set_effect: SetEffectEntry[] }>('/character/set-effect', q)
  await sleep(THROTTLE_MS)

  advance()
  const petRes = await request<Record<string, unknown>>('/character/pet-equipment', q)
  await sleep(THROTTLE_MS)

  advance()
  const symbolRes = await request<{ symbol: SymbolItem[] }>('/character/symbol-equipment', q)
  await sleep(THROTTLE_MS)

  advance()
  const hyperRes = await request<Record<string, unknown>>('/character/hyper-stat', q)
  await sleep(THROTTLE_MS)

  advance()
  const hexaRes = await request<Record<string, unknown>>('/character/hexamatrix-stat', q)

  advance()
  const familiarRes = await request<{
    familiar_link_slot?: FamiliarLinkSlot[]
    familiar_info?: FamiliarEntry[]
  }>('/character/familiar', q)

  return {
    ocid,
    basic,
    stat,
    equipment: equipmentRes.item_equipment ?? [],
    setEffects: setRes.set_effect ?? [],
    pets: normalizePets(petRes),
    symbols: symbolRes.symbol ?? [],
    hyperStat: pickActiveHyperStat(hyperRes),
    hexaStat: collectHexaCores(hexaRes),
    familiars: {
      linkSlots: familiarRes.familiar_link_slot ?? [],
      entries: familiarRes.familiar_info ?? [],
    },
  }
}

/**
 * 三隻寵物散在 pet_1_*、pet_2_*、pet_3_* 三組欄位，攤平成陣列。
 * 只留名稱與寵物裝備的數值 —— 寵物裝備計入「裝備道具」，是實測確認過的。
 */
function normalizePets(res: Record<string, unknown>): PetInfo[] {
  const pets: PetInfo[] = []
  for (const index of [1, 2, 3]) {
    const name = res[`pet_${index}_name`]
    if (typeof name !== 'string' || !name) continue
    const equipment = res[`pet_${index}_equipment`] as {
      item_name?: string
      item_icon?: string
      item_option?: { option_type?: string; option_value?: string }[]
    } | null
    pets.push({
      name,
      itemName: equipment?.item_name ?? '',
      // 寵物與寵物裝備各有各的圖，都是 CDN 網址（65 字元），存下來格子才不會只有文字
      icon:
        typeof res[`pet_${index}_icon`] === 'string'
          ? (res[`pet_${index}_icon`] as string)
          : undefined,
      itemIcon: equipment?.item_icon,
      options: (equipment?.item_option ?? []).map((option) => ({
        type: String(option.option_type ?? ''),
        value: String(option.option_value ?? ''),
      })),
    })
  }
  return pets
}

/** hyper-stat 回傳三組 preset，取目前套用的那一組 */
function pickActiveHyperStat(res: Record<string, unknown>): HyperStatEntry[] {
  const active = String(res.use_preset_no ?? '1')
  const preset = res[`hyper_stat_preset_${active}`] ?? res.hyper_stat_preset_1
  return Array.isArray(preset) ? (preset as HyperStatEntry[]) : []
}

/** HEXA 屬性核心分散在 character_hexa_stat_core、_2、_3 三個欄位 */
function collectHexaCores(res: Record<string, unknown>): HexaStatCore[] {
  const keys = [
    'character_hexa_stat_core',
    'character_hexa_stat_core_2',
    'character_hexa_stat_core_3',
  ]
  return keys.flatMap((key) => (Array.isArray(res[key]) ? (res[key] as HexaStatCore[]) : []))
}
