// 武器校正：把 API 推導值與玩家覆寫疊起來，算出上游要的 adjWeaponAtk。
//
// 做成 composable 而不是各自算：戰鬥力基準要 adjWeaponAtk（fields），
// CombatPowerContext 要 weaponSet 與創世終傷勾選（ctx），兩邊必須同一份推導。

import { computed } from 'vue'
import { getJobStatLabelsByName } from '@/data/jobs'
import { runWeaponCorrection } from '@/core/weaponCorrection'
import type { WeaponSetKey } from '@/core/types'
import { deriveWeapon, flameLevelFor } from '../core/weaponDerive'
import { statSlotsFor } from '../core/powerDelta'
import { useBaselineStore } from '../stores/baseline'
import { useEquipmentSetsStore } from '../stores/equipmentSets'

/** 神之子的星火級距表不同，要換一張表 */
const ZERO_JOB = '神之子'

export function useWeapon() {
  const sets = useEquipmentSetsStore()
  const store = useBaselineStore()

  const job = computed(() => sets.active?.data?.job ?? '')
  const isZeroJob = computed(() => job.value === ZERO_JOB)

  /** 法系讀魔攻、其餘讀物攻；跟基準用的是同一組 slots */
  const useMagic = computed(() => {
    const labels = getJobStatLabelsByName(job.value)
    return statSlotsFor(labels.main, labels.sub)?.attack === 'magicPower'
  })

  const derived = computed(() =>
    deriveWeapon(sets.active?.data?.equipment ?? [], useMagic.value, isZeroJob.value),
  )

  /** 推導值疊上玩家覆寫。空字串 = 用推導值，填 0 = 確認是 0 */
  const resolved = computed(() => {
    const d = derived.value
    const pick = (entered: string | undefined, fallback: number): number => {
      const text = String(entered ?? '').trim()
      return text === '' ? fallback : Number(text) || 0
    }
    const weaponSet = (store.choice.weaponSet || d.weaponSet) as WeaponSetKey | ''
    const flameAtk = d.flameAtk
    return {
      weaponSet,
      starCount: pick(store.input.weaponStar, d.starCount),
      scrollAtk: pick(store.input.weaponScrollAtk, d.scrollAtk),
      currentWeaponAtk: pick(store.input.weaponTotalAtk, d.currentWeaponAtk),
      flameAtk,
      // 換了系列就要用新系列的表重推階，不能沿用舊系列推出來的數字
      flameLevel: pick(
        store.input.weaponFlameLevel,
        weaponSet ? flameLevelFor(weaponSet, flameAtk, isZeroJob.value) : 0,
      ),
    }
  })

  /**
   * 校正值 = 標準武器總攻 − 實際武器總攻，通常是負的。
   * 系列認不出來時回 0（而不是硬套某個系列），寧可少校正也不要算錯方向。
   */
  const correction = computed(() => {
    const r = resolved.value
    if (!r.weaponSet) return 0
    return runWeaponCorrection({
      weaponSet: r.weaponSet,
      flameLevel: r.flameLevel,
      scrollAtk: r.scrollAtk,
      starCount: r.starCount,
      currentWeaponAtk: r.currentWeaponAtk,
      jobCategory: 'normal',
      isZeroJob: isZeroJob.value,
    }).correction
  })

  /** 創世武器的 10% 終傷。留空時由武器系列推定，玩家可明確關掉 */
  const genesisFinal = computed(() => {
    const choice = store.choice.genesisFinal
    if (choice === 'on') return true
    if (choice === 'off') return false
    return resolved.value.weaponSet === 'genesis'
  })

  return { derived, resolved, correction, genesisFinal }
}
