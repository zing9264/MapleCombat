// 上游 calculatePower 需要的 context。
//
// 抽成 composable 而不是各頁自己組：角色資料頁要拿它重算戰鬥力做驗證、
// 裝備變更頁要拿它算換裝差值，兩邊的 context 必須一致，
// 否則同一份基準會算出兩個戰鬥力，而且沒人會發現。
//
// 職業一律取**同步下來的角色**，不吃上游的職業選單。

import { computed, type ComputedRef } from 'vue'
import { getJobByName } from '@/data/jobs'
import type { CombatPowerContext } from '@/core/combatPower'
import { useEquipmentSetsStore } from '../stores/equipmentSets'
import { useFamiliarStore } from '../stores/familiar'
import { useWeapon } from './useWeapon'

export function usePowerContext(): ComputedRef<CombatPowerContext> {
  const sets = useEquipmentSetsStore()
  const familiar = useFamiliarStore()
  const weapon = useWeapon()

  return computed(() => {
    const job = sets.active?.data?.job ?? ''
    return {
      jobCategory: getJobByName(job)?.category ?? 'normal',
      jobName: job,
      weaponSet: weapon.resolved.value.weaponSet,
      // 創世武器的 10% 終傷是乘算，漏掉就整整少 9.1%
      genesisFinalChecked: weapon.genesisFinal.value,
      // 基準抄的是城內無 Buff 的面板，含 Buff 校正不適用
      useBuff: false,
      overseasGenesisAtkDelta: 0,
      xenonPowerCoefficientRaw: '',
      daPowerCoefficientRaw: '',
      // 萌獸終傷是乘算，逐條餵進去 —— 先加總再換算會有 float32 精度差。
      // 創世武器的 10% 終傷不在這裡，它是 genesisFinalChecked 那個獨立乘數。
      famFinalSources: familiar.current.finalDamageSources,
    }
  })
}
