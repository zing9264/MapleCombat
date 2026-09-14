// 戰鬥力基準：把「API 推導得到的」與「玩家手填的」組裝成公式欄位，並對帳。
//
// 做成 composable 而不是各自算：角色資料頁要顯示對帳結果、裝備變更頁要拿欄位去算
// 換裝差值，兩邊必須是同一份基準。各算一次遲早會分岔。

import { computed } from 'vue'
import { getJobStatLabelsByName } from '@/data/jobs'
import { calculatePower, powerValue } from '@/core/combatPower'
import {
  MANUAL_TO_FIELD,
  NO_PERCENT_PARTS,
  apBaseline,
  assembleFields,
  combineBaselines,
  equipmentBaseline,
  familiarBaseline,
  flatOnlyEquipmentBaseline,
  hyperBaseline,
  panelChecks,
  petBaseline,
  symbolBaseline,
} from '../core/baseline'
import { aggregateEquipment } from '../core/equipmentDelta'
import { fromApiItem } from '../core/gearAdapters'
import { statSlotsFor } from '../core/powerDelta'
import { useBaselineStore } from '../stores/baseline'
import { useFamiliarStore } from '../stores/familiar'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { usePowerContext } from './usePowerContext'
import { useWeapon } from './useWeapon'

/** P寵攻擊：0/1/2/3 套 */
const PET_SET_ATK = [0, 8, 18, 36]

export function useBaseline() {
  const sets = useEquipmentSetsStore()
  const store = useBaselineStore()
  const familiar = useFamiliarStore()
  const powerContext = usePowerContext()
  const weapon = useWeapon()

  const data = computed(() => sets.active?.data ?? null)

  /** 主副屬性依**同步下來的角色**職業決定 */
  const labels = computed(() => getJobStatLabelsByName(data.value?.job ?? ''))
  const slots = computed(() => statSlotsFor(labels.value.main, labels.value.sub))

  /**
   * 能從 API 推導出來的部分。
   * 每次同步都會變，所以是算出來的、不存起來 —— 存了只會變成過期資料。
   */
  const derived = computed(() => {
    const current = data.value
    if (!current) return combineBaselines([])

    // 寶石／圖騰的固定值不吃 ％，必須跟其他裝備分開加總（見 NO_PERCENT_PARTS）。
    // 它們也不是任何套裝的部件，所以拆出去不影響套裝件數。
    const items = (current.equipment ?? []).map(fromApiItem)
    const percentAffected = items.filter((item) => !NO_PERCENT_PARTS.has(item.part))
    const flatOnly = items.filter((item) => NO_PERCENT_PARTS.has(item.part))

    return combineBaselines([
      apBaseline(current.stat ?? []),
      equipmentBaseline(
        aggregateEquipment({
          items: percentAffected,
          setEffects: current.setEffects ?? [],
          characterLevel: current.level,
        }),
      ),
      flatOnlyEquipmentBaseline(
        aggregateEquipment({ items: flatOnly, setEffects: [], characterLevel: current.level }),
      ),
      symbolBaseline(current.symbols ?? []),
      hyperBaseline(current.hyperStat ?? []),
      // 舊快照沒有 pets 這個鍵，要能撐住
      petBaseline(current.pets ?? []),
      familiarBaseline(
        familiar.current.magicPowerPercent,
        familiar.current.attackPowerPercent,
        familiar.current.finalDamageTotal,
      ),
    ])
  })

  /** API 面板值：既是對帳的答案，也是傷害類的預設值 */
  const panel = computed(
    () =>
      new Map(
        (data.value?.stat ?? []).map((entry) => [entry.stat_name, Number(entry.stat_value) || 0]),
      ),
  )

  /**
   * 組成上游公式吃的欄位。
   * 傳 store.input（原始字串）而不是 store.manual —— 要分得出「留空」與「填 0」。
   */
  /**
   * 推導得到、但不在「面板三欄」裡的項目。
   *
   * P寵攻擊是套組效果（1set 8／2set 18／3set 36），不是寵物裝備本身的詞條
   * （那些已經算在面板的攻擊力裡了），所以照**寵物件數**推，不是照數值加總。
   */
  const specials = computed(() => ({
    adjWeaponAtk: weapon.correction.value,
    petAtk: PET_SET_ATK[Math.min(data.value?.pets?.length ?? 0, 3)],
  }))

  const fields = computed(() =>
    slots.value
      ? assembleFields(derived.value, store.input, slots.value, panel.value, specials.value)
      : null,
  )

  /**
   * 每個輸入框留空時實際會用到的值，給 placeholder 用。
   *
   * 直接拿「manual 全空」跑一次 assembleFields，而不是另外寫一份推導 ——
   * 兩份遲早會分岔，那時 placeholder 顯示的就不是真正會用的值了。
   */
  const placeholders = computed<Partial<Record<string, number>>>(() => {
    if (!slots.value) return {}
    const blank = assembleFields(derived.value, {}, slots.value, panel.value, specials.value)
    const result: Record<string, number> = {}
    for (const [manualKey, fieldKey] of Object.entries(MANUAL_TO_FIELD)) {
      const value = blank[fieldKey as string]
      if (typeof value === 'number') result[manualKey] = value
    }
    // 武器四項的預設來自裝備推導，不經過 assembleFields
    const w = weapon.derived.value
    if (w.found) {
      result.weaponStar = w.starCount
      result.weaponScrollAtk = w.scrollAtk
      result.weaponFlameLevel = w.flameLevel
      result.weaponTotalAtk = w.currentWeaponAtk
    }
    return result
  })

  const checks = computed(() =>
    fields.value && slots.value ? panelChecks(fields.value, slots.value, panel.value) : [],
  )

  /**
   * 用這份基準把戰鬥力重算一次，跟遊戲面板並排。
   *
   * 這是對帳表抓不到的那一半：對帳只驗證前三欄（基本數值／％／％未套用）能不能
   * 重建出面板值，技能欄完全不參與，傷害類也只是照抄面板 —— 所以對帳可以全綠
   * 而戰鬥力差很遠。玩家看到全綠就不會再懷疑基準，唯一能戳破的就是重算值本身。
   */
  const power = computed(() => {
    const base = fields.value
    if (!base) return null
    const value = powerValue(calculatePower(base, powerContext.value))
    if (!value) return null

    const actual = panel.value.get('戰鬥力') ?? 0
    // 沒有面板戰鬥力就沒得比，不要硬算出一個沒意義的百分比
    const diff = actual ? (value - actual) / actual : null

    // 零容差：差一點就算對不上。
    // 曾經留 5% 容差，理由是公式與遊戲有殘差（實測 1.3%），但那等於預設
    // 「差一點是正常的」—— 殘差本身就是還沒查清楚的東西，容差只會把它蓋住。
    return { value, actual, diff, off: actual !== 0 && value !== actual }
  })

  /**
   * 面板全部對得上、**而且**重算的戰鬥力也對得上，才算基準可信。
   *
   * 只看面板不夠：技能欄沒填時面板照樣全綠，戰鬥力卻可能差兩成，
   * 換裝差值就會整片偏掉。
   */
  const reconciled = computed(
    () =>
      checks.value.length > 0 &&
      checks.value.every((check) => check.ok) &&
      power.value !== null &&
      !power.value.off,
  )

  return {
    data,
    labels,
    slots,
    derived,
    fields,
    checks,
    placeholders,
    power,
    reconciled,
    weapon,
    store,
  }
}
