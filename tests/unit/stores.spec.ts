// Store 整合測試：黃金值情境經由 applySaveData 餵入 store，
// 驗證「持久化 → 衍生欄位（武器校正）→ 計算」整條管線與舊版一致。
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { useCharacterStore } from '@/stores/character'
import { useBuffsStore } from '@/stores/buffs'
import { useUiStore } from '@/stores/ui'
import { useStateSlotsStore } from '@/stores/stateSlots'
import { fieldDefs } from '@/constants/fields'
import { calculateWeightedSummary, weightedPercentGain } from '@/core/weightedStates'
import type { CombatCorrectionState } from '@/core/combatCorrections'
import { parseImportedData, normalizeSavedData } from '@/services/saveData'
import golden from './fixtures/golden.json'
import percentFloor034 from './fixtures/034-percent-floor.json'

interface GoldenScenario {
  name: string
  selectedJob: string
  selectedJobName: string
  effSelectedJob: string
  inputs: Record<string, string | boolean>
  buffState: {
    master: boolean
    levels: Record<string, number>
    soulOrb: { value: number; stat: string; fullSoul?: boolean }
    combatCorrections?: CombatCorrectionState
  }
  outputs: Record<string, unknown>
}

const scenarios = golden.scenarios as unknown as GoldenScenario[]

function toSaveData(s: GoldenScenario) {
  return {
    app: 'maplecombat',
    version: 1,
    selectedJob: s.selectedJob,
    selectedJobName: s.selectedJobName,
    effSelectedJob: s.effSelectedJob,
    values: s.inputs,
    buffState: s.buffState,
  }
}

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('character store 黃金值整合', () => {
  it.each(scenarios)('$name：store 計算結果與舊版一致', (s) => {
    const store = useCharacterStore()
    store.applySaveData(toSaveData(s))

    expect(store.powerNoBuff).toEqual(s.outputs.powerNoBuff)
    expect(store.powerWithBuff).toEqual(s.outputs.powerWithBuff)
    expect(store.effOutputWithBuff).toBe(s.outputs.effOutputWithBuff)
    expect(store.equipmentChangedPower).toEqual(s.outputs.powerWithEquipDelta)
    expect(store.weaponCorrection.correction).toBe(Number(s.outputs.adjWeaponAtk))
    expect(store.weaponCorrection.baseAtk).toBe(Number(s.outputs.baseAtk))
    expect(store.statLabels).toEqual(s.outputs.statLabels)
  })

  it('034 百分比取整 fixture 經正式匯入得到遊戲戰鬥力', () => {
    const store = useCharacterStore()
    store.applySaveData(percentFloor034)

    expect(store.weaponCorrection.correction).toBe(84)
    expect(store.combatPreviewNoBuff.main.total).toBe(1331)
    expect(store.combatPreviewNoBuff.sub.total).toBe(1283)
    expect(store.combatPreviewNoBuff.subtwo?.total).toBe(1648)
    expect(store.combatPreviewNoBuff.attack.total).toBe(870)
    expect(store.powerNoBuff).toEqual({ type: 'range', high: 375551, low: 425624 })
  })
})

describe('匯出/匯入 round-trip', () => {
  it('applySaveData → collectSaveData 保留全部欄位與 buff 狀態', () => {
    const s = scenarios.find((x) => x.name === 'buffs-custom-hero')!
    const store = useCharacterStore()
    store.applySaveData(toSaveData(s))

    const exported = store.collectSaveData()
    expect(exported.app).toBe('maplebuilding')
    expect(exported.version).toBe(2)
    expect(exported.selectedJob).toBe(s.selectedJob)
    expect(exported.selectedJobName).toBe(s.selectedJobName)
    expect(exported.effSelectedJob).toBe(s.effSelectedJob)
    expect(exported.workspace).toBeTruthy()

    // 再匯入一次，計算結果不變
    localStorage.clear()
    setActivePinia(createPinia())
    const store2 = useCharacterStore()
    store2.applySaveData(exported)
    expect(store2.powerNoBuff).toEqual(s.outputs.powerNoBuff)
    expect(store2.powerWithBuff).toEqual(s.outputs.powerWithBuff)
    const restoredBuffs = useBuffsStore().collectState()
    expect(restoredBuffs.levels).toEqual(exported.buffState!.levels)
    expect(restoredBuffs.soulOrb).toEqual(exported.buffState!.soulOrb)
    expect(restoredBuffs.combatCorrections).toEqual(exported.buffState!.combatCorrections)
  })

  it('活動爆傷與結界欄位可保存，且新舊版 JSON 可安全互匯', () => {
    const newValues = {
      adjEventCritDmg: '40',
      adjBarrierMainStat: '49',
      adjBarrierSubStat: '40',
      adjBarrierAtk: '20',
      adjBarrierMainStatPercent: '13',
    }
    const store = useCharacterStore()
    store.setField('baseMain', '12345')
    Object.entries(newValues).forEach(([id, value]) => store.setField(id, value))

    const exported = store.collectSaveData()
    expect(exported.version).toBe(2)
    Object.entries(newValues).forEach(([id, value]) => {
      expect(exported.values[id]).toBe(value)
    })

    localStorage.clear()
    setActivePinia(createPinia())
    const restored = useCharacterStore()
    restored.applySaveData(exported)
    Object.entries(newValues).forEach(([id, value]) => {
      expect(restored.fields[id]).toBe(value)
    })

    // 舊版匯入器只遍歷當時的 145 個 fieldDefs；新版額外 key 不會覆蓋或阻擋既有欄位。
    const newFieldIds = new Set(Object.keys(newValues))
    const legacyFieldDefs = fieldDefs.filter((def) => !newFieldIds.has(def.id))
    const legacyWorkspaceSnapshot = {
      ...exported.workspace!.shared.values,
      ...exported.workspace!.states[0].values,
      ...exported.workspace!.weighted.values,
    }
    const legacyImportedValues: Record<string, unknown> = {}
    legacyFieldDefs.forEach((def) => {
      if (Object.prototype.hasOwnProperty.call(legacyWorkspaceSnapshot, def.id)) {
        legacyImportedValues[def.id] = legacyWorkspaceSnapshot[def.id]
      }
    })
    expect(fieldDefs).toHaveLength(150)
    expect(new Set(fieldDefs.map((def) => def.id)).size).toBe(150)
    expect(legacyFieldDefs).toHaveLength(145)
    expect(legacyImportedValues.baseMain).toBe('12345')
    Object.keys(newValues).forEach((id) => {
      expect(legacyImportedValues).not.toHaveProperty(id)
    })

    const legacyExport = JSON.parse(JSON.stringify(exported))
    Object.keys(newValues).forEach((id) => {
      delete legacyExport.values[id]
      delete legacyExport.workspace.shared.values[id]
    })
    localStorage.clear()
    setActivePinia(createPinia())
    const legacy = useCharacterStore()
    legacy.applySaveData(legacyExport)
    Object.keys(newValues).forEach((id) => {
      expect(legacy.fields[id]).toBe('')
    })
  })

  it('無 workspace 的舊 JSON 匯入時會清空新版活動與結界欄位', () => {
    const newFieldIds = [
      'adjEventCritDmg',
      'adjBarrierMainStat',
      'adjBarrierSubStat',
      'adjBarrierAtk',
      'adjBarrierMainStatPercent',
    ]
    const store = useCharacterStore()
    newFieldIds.forEach((id) => store.setField(id, '99'))

    store.applySaveData({
      app: 'maplecombat',
      version: 1,
      selectedJob: 'normal',
      selectedJobName: '英雄',
      effSelectedJob: 'normal',
      values: { baseMain: '321' },
    })

    expect(store.fields.baseMain).toBe('321')
    newFieldIds.forEach((id) => {
      expect(store.fields[id]).toBe('')
    })
  })

  it('舊 buffState 缺少新欄位時，滿魂與三項校正預設啟用', () => {
    const buffs = useBuffsStore()
    buffs.setSoulOrbFullSoul(false)
    buffs.setCombatCorrection('mentor', false)
    buffs.setCombatCorrection('empress', false)
    buffs.setCombatCorrection('genesis', false)

    buffs.applyState({
      levels: {},
      soulOrb: { value: 6, stat: 'percentAtk' },
    })

    expect(buffs.soulOrb).toMatchObject({ value: 6, stat: 'percentAtk', fullSoul: true })
    expect(buffs.combatCorrections).toEqual({ mentor: true, empress: true, genesis: true })
  })

  it('滿魂與校正分別保存於 localStorage', async () => {
    const buffs = useBuffsStore()
    buffs.setSoulOrbFullSoul(false)
    buffs.setCombatCorrection('mentor', false)
    buffs.setCombatCorrection('empress', true)
    buffs.setCombatCorrection('genesis', false)
    await nextTick()

    expect(JSON.parse(localStorage.getItem('buffSoulOrb') || '{}').fullSoul).toBe(false)
    expect(JSON.parse(localStorage.getItem('buffCombatCorrections') || '{}')).toEqual({
      mentor: false,
      empress: true,
      genesis: false,
    })

    setActivePinia(createPinia())
    const restored = useBuffsStore()
    expect(restored.soulOrb.fullSoul).toBe(false)
    expect(restored.combatCorrections).toEqual({ mentor: false, empress: true, genesis: false })
  })

  it('戰鬥力全部清除後含 Buff 等於原始，且保留寶珠輸入內容', () => {
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    store.applySaveData(toSaveData(scenarios[0]))
    buffs.setSoulOrbValue(12)
    buffs.setSoulOrbStat('bossDmg')

    buffs.clearAllForMode('combat')

    expect(buffs.soulOrb).toMatchObject({ value: 12, stat: 'bossDmg', fullSoul: false })
    expect(buffs.combatCorrections).toEqual({ mentor: false, empress: false, genesis: false })
    expect(store.powerWithBuff).toEqual(store.powerNoBuff)
    expect(store.effOutputWithBuff).toBe(store.effOutputNoBuff)
  })

  it('實戰頁預設與清除不修改戰鬥力校正', () => {
    const buffs = useBuffsStore()
    buffs.setCombatCorrection('mentor', false)
    buffs.setCombatCorrection('empress', true)
    buffs.setCombatCorrection('genesis', false)

    buffs.clearAllForMode('eff')
    expect(buffs.soulOrb.fullSoul).toBe(false)
    expect(buffs.combatCorrections).toEqual({ mentor: false, empress: true, genesis: false })

    buffs.resetDefaultsForMode('eff')
    expect(buffs.soulOrb.fullSoul).toBe(true)
    expect(buffs.combatCorrections).toEqual({ mentor: false, empress: true, genesis: false })
  })

  it('戰鬥力頁套用預設只勾選目前可見校正並啟用滿魂', () => {
    const buffs = useBuffsStore()
    buffs.clearAllForMode('combat')

    buffs.resetDefaultsForMode('combat', ['mentor', 'empress'])

    expect(buffs.soulOrb.fullSoul).toBe(true)
    expect(buffs.combatCorrections).toEqual({ mentor: true, empress: true, genesis: false })
  })

  it('裝備萌獸原／新逐條來源可持久化並在匯出匯入後保持計算結果', () => {
    const store = useCharacterStore()
    store.applySaveData(toSaveData(scenarios[0]))
    store.setField('famFinal', '20')
    store.setField('famFinalSources', '20')
    store.setField('effFamFinal', '20')
    store.setField('effFamFinalSources', '20')
    store.setField('eqOldFamFinal', '20')
    store.setField('eqOldFamFinalSources', '20')
    store.setField('eqNewFamFinal', '20')
    store.setField('eqNewFamFinalSources', '17,3')

    const changedPower = store.equipmentChangedPower
    const actualGain = store.equipmentActualGain
    expect(changedPower).not.toEqual(store.powerNoBuff)
    expect(actualGain).not.toBe(0)

    const exported = store.collectSaveData()
    expect(exported.values.eqOldFamFinalSources).toBe('20')
    expect(exported.values.eqNewFamFinalSources).toBe('17,3')

    localStorage.clear()
    setActivePinia(createPinia())
    const restored = useCharacterStore()
    restored.applySaveData(exported)
    expect(restored.fields.eqOldFamFinalSources).toBe('20')
    expect(restored.fields.eqNewFamFinalSources).toBe('17,3')
    expect(restored.equipmentChangedPower).toEqual(changedPower)
    expect(restored.equipmentActualGain).toBe(actualGain)
  })

  it('裝備純總值 20% 會先推測為一條來源，等同逐條輸入及直接加入目前來源', () => {
    const store = useCharacterStore()
    store.applySaveData(toSaveData(scenarios[0]))
    store.setField('famFinal', '25')
    store.setField('famFinalSources', '')
    store.setField('effFamFinal', '25')
    store.setField('effFamFinalSources', '')
    store.setField('eqOldFamFinal', '')
    store.setField('eqOldFamFinalSources', '')
    store.setField('eqNewFamFinal', '20')
    store.setField('eqNewFamFinalSources', '')

    const scalarChangedPower = store.equipmentChangedPower
    const baseActualOutput = store.effOutputWithBuff
    const scalarActualGain = store.equipmentActualGain
    expect(scalarActualGain).not.toBeNull()
    const scalarChangedActualOutput = baseActualOutput * (1 + scalarActualGain! / 100)

    store.setField('eqNewFamFinalSources', '20')

    const changedPower = store.equipmentChangedPower
    const actualGain = store.equipmentActualGain
    expect(actualGain).not.toBeNull()
    const changedActualOutput = baseActualOutput * (1 + actualGain! / 100)
    expect(changedPower).toEqual(scalarChangedPower)
    expect(changedActualOutput / scalarChangedActualOutput).toBeCloseTo(1, 12)

    store.setField('eqNewFamFinal', '')
    store.setField('eqNewFamFinalSources', '')
    store.setField('famFinal', '45')
    store.setField('famFinalSources', '25,20')
    store.setField('effFamFinal', '45')
    store.setField('effFamFinalSources', '25,20')

    expect(store.powerNoBuff).toEqual(changedPower)
    expect(store.effOutputWithBuff / changedActualOutput).toBeCloseTo(1, 12)
  })

  it('v0 扁平格式可匯入', () => {
    const s = scenarios[0]
    const flat: Record<string, unknown> = {
      selectedJob: s.selectedJob,
      selectedJobName: s.selectedJobName,
      ...s.inputs,
    }
    const store = useCharacterStore()
    store.applySaveData(flat)
    expect(store.selectedJobName).toBe(s.selectedJobName)
    // v0 無 buffState：buff 維持預設，與黃金值 powerNoBuff（不含 buff）一致
    expect(store.powerNoBuff).toEqual(s.outputs.powerNoBuff)
  })
  it('stale buff ids are ignored and missing new buffs keep current defaults', () => {
    const s = scenarios[0]
    const oldLevels: Record<string, number> = {
      ...s.buffState.levels,
      'skill:八方美人': 1,
      'skill:公會的厲害': 1,
      'pot:公會更大的祝福': 1,
    }
    delete oldLevels['skill:公會的訣竅']
    delete oldLevels['pot:榮譽靈藥']

    const store = useCharacterStore()
    expect(() =>
      store.applySaveData({
        ...toSaveData(s),
        buffState: { ...s.buffState, levels: oldLevels },
      }),
    ).not.toThrow()

    const importedLevels = useBuffsStore().collectState().levels
    expect(importedLevels['skill:八方美人']).toBeUndefined()
    expect(importedLevels['skill:公會的厲害']).toBeUndefined()
    expect(importedLevels['pot:公會更大的祝福']).toBeUndefined()
    expect(importedLevels['skill:公會的訣竅']).toBe(1)
    expect(importedLevels['pot:榮譽靈藥']).toBe(1)
  })
})

describe('parseImportedData / normalizeSavedData', () => {
  it('剝除 BOM 與 ```json 圍欄', () => {
    const json = '{"selectedJob":"normal","values":{"baseMain":"100"}}'
    expect(parseImportedData('﻿' + json)).toEqual(JSON.parse(json))
    expect(parseImportedData('```json\n' + json + '\n```')).toEqual(JSON.parse(json))
    expect(parseImportedData('前置雜訊 ' + json + ' 後置')).toEqual(JSON.parse(json))
  })

  it('無法解析時擲出錯誤', () => {
    expect(() => normalizeSavedData(null)).toThrow()
    expect(() => normalizeSavedData({ unknownKey: 1 })).toThrow()
  })

  it('select 匯入非法值會被忽略', () => {
    const store = useCharacterStore()
    const before = store.fields.weaponSet
    store.applySaveData({ selectedJob: 'normal', values: { weaponSet: 'bogus', baseMain: '5' } })
    expect(store.fields.weaponSet).toBe(before)
    expect(store.fields.baseMain).toBe('5')
  })
})

describe('per-key localStorage 持久化', () => {
  it('setField 寫入舊鍵名；重建 store 後還原', () => {
    const store = useCharacterStore()
    store.setField('baseMain', '12345')
    expect(localStorage.getItem('baseMain')).toBe('12345')

    setActivePinia(createPinia())
    const store2 = useCharacterStore()
    expect(store2.fields.baseMain).toBe('12345')
  })

  it('weaponSet 變更回填卷軸/星力預設並同步創世終傷', () => {
    const store = useCharacterStore()
    store.setField('weaponSet', 'arcane')
    expect(store.fields.scrollAtk).toBe('0')
    expect(store.fields.genesisFinalCheck).toBe(false)

    store.setField('weaponSet', 'genesis')
    expect(store.fields.scrollAtk).toBe('72')
    expect(store.fields.starCount).toBe('22')
    expect(store.fields.genesisFinalCheck).toBe(true)
  })

  it('migrateCorrectedDefaults：傑諾係數錯字修正與預設回填', () => {
    localStorage.setItem('adjXenonPowerCoefficient', '0.74735')
    localStorage.setItem('currentWeaponAtk', '0')
    localStorage.setItem('effMonsterDefense', '300')
    const store = useCharacterStore()
    expect(store.fields.adjXenonPowerCoefficient).toBe('0.74375')
    expect(store.fields.currentWeaponAtk).toBe('')
    expect(store.fields.effMonsterDefense).toBe('380')
    expect(store.fields.adjEmpressBless).toBe('30')
  })
})

describe('compact 五狀態 workspace', () => {
  it('切換狀態時保留共用戰鬥力資料，切換實戰資料與靈魂寶珠', () => {
    const store = useCharacterStore()
    const buffs = useBuffsStore()

    store.setField('baseMain', '11111')
    store.setField('effBaseMain', '22222')
    buffs.setSoulOrbValue(77)
    buffs.setSoulOrbFullSoul(false)
    buffs.setCombatCorrection('mentor', false)

    store.activateWorkspaceSlot('state2')
    expect(store.fields.baseMain).toBe('11111')
    expect(store.fields.effBaseMain).not.toBe('22222')
    expect(buffs.soulOrb.value).toBe(0)
    expect(buffs.soulOrb.fullSoul).toBe(true)
    expect(buffs.combatCorrections.mentor).toBe(true)

    store.setField('effBaseMain', '33333')
    buffs.setSoulOrbValue(88)
    buffs.setCombatCorrection('empress', false)

    store.activateWorkspaceSlot('state1')
    expect(store.fields.baseMain).toBe('11111')
    expect(store.fields.effBaseMain).toBe('22222')
    expect(buffs.soulOrb.value).toBe(77)
    expect(buffs.soulOrb.fullSoul).toBe(false)
    expect(buffs.combatCorrections.mentor).toBe(false)
    expect(buffs.combatCorrections.empress).toBe(true)

    store.activateWorkspaceSlot('state2')
    expect(store.fields.baseMain).toBe('11111')
    expect(store.fields.effBaseMain).toBe('33333')
    expect(buffs.soulOrb.value).toBe(88)
    expect(buffs.soulOrb.fullSoul).toBe(true)
    expect(buffs.combatCorrections.mentor).toBe(true)
    expect(buffs.combatCorrections.empress).toBe(false)
  })

  it('切換狀態時不清空裝備變更與數值換算的加權頁共用欄位', () => {
    const store = useCharacterStore()

    store.setField('eqOldAtk', '123')
    store.setField('eqNewAtk', '456')
    store.setField('effUnitAtk', '7')
    store.setField('effSelectedMetric1', 'atk')
    store.setField('effShowCombatGain', true)

    store.activateWorkspaceSlot('state2')
    expect(store.fields.eqOldAtk).toBe('123')
    expect(store.fields.eqNewAtk).toBe('456')
    expect(store.fields.effUnitAtk).toBe('7')
    expect(store.fields.effSelectedMetric1).toBe('atk')
    expect(store.fields.effShowCombatGain).toBe(true)

    store.activateWorkspaceSlot('state1')
    expect(store.fields.eqOldAtk).toBe('123')
    expect(store.fields.eqNewAtk).toBe('456')
    expect(store.fields.effUnitAtk).toBe('7')
    expect(store.fields.effSelectedMetric1).toBe('atk')
    expect(store.fields.effShowCombatGain).toBe(true)
  })

  it('套用其他狀態與重設目前狀態後可直接 reload 畫面資料', () => {
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.setField('effBaseMain', '11111')
    buffs.setSoulOrbValue(77)
    buffs.setSoulOrbFullSoul(false)
    buffs.setCombatCorrection('genesis', false)

    store.activateWorkspaceSlot('state2')
    store.setField('effBaseMain', '22222')
    buffs.setSoulOrbValue(88)

    slots.copyState('state1', 'state2')
    store.reloadWorkspaceSlot('state2')
    expect(store.fields.effBaseMain).toBe('11111')
    expect(buffs.soulOrb.value).toBe(77)
    expect(buffs.soulOrb.fullSoul).toBe(false)
    expect(buffs.combatCorrections.genesis).toBe(false)

    slots.resetState('state2')
    store.reloadWorkspaceSlot('state2')
    expect(store.fields.effBaseMain).toBe(slots.fieldDefault('effBaseMain'))
    expect(buffs.soulOrb.value).toBe(0)
    expect(buffs.soulOrb.fullSoul).toBe(true)
    expect(buffs.combatCorrections).toEqual({ mentor: true, empress: true, genesis: true })
  })

  it('狀態名稱限制與權重 fallback 資料可保存', () => {
    const store = useCharacterStore()
    const slots = useStateSlotsStore()

    slots.renameState('state1', '很長很長很長很長的狀態名稱')
    expect(slots.workspace.states[0].name.length).toBeLessThanOrEqual(12)

    slots.setWeight('state1', 0)
    slots.setWeight('state2', 0)
    slots.setWeight('state3', 0)
    slots.setWeight('state4', 0)
    slots.setWeight('state5', 0)

    const exported = store.collectSaveData()
    expect(exported.workspace?.weighted.weights.state1).toBe(0)
  })

  it('加權裝備變更實際增幅使用裝備變更基準，不誤用含 Buff 實際增幅', () => {
    const s = scenarios.find((x) => x.name === 'buffs-custom-hero')!
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.applySaveData(toSaveData(s))
    fieldDefs
      .filter((def) => def.id.startsWith('eqOld') || def.id.startsWith('eqNew'))
      .forEach((def) => store.setField(def.id, ''))

    const summary = calculateWeightedSummary(slots.workspace, buffs.table)
    expect(summary.actualBuffGain).not.toBe(0)
    expect(summary.equipmentBattleGain).toBe(0)
    expect(summary.equipmentActualGain).toBe(0)
  })

  it('加權裝備變更沿用原／新萌獸逐條來源', () => {
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()
    store.applySaveData(toSaveData(scenarios[0]))
    store.setField('famFinal', '20')
    store.setField('famFinalSources', '20')
    store.setField('effFamFinal', '20')
    store.setField('effFamFinalSources', '20')
    store.setField('eqOldFamFinal', '20')
    store.setField('eqOldFamFinalSources', '20')
    store.setField('eqNewFamFinal', '20')
    store.setField('eqNewFamFinalSources', '17,3')

    const summary = calculateWeightedSummary(slots.workspace, buffs.table)
    const state1 = summary.slots.find((slot) => slot.id === 'state1')!
    expect(state1.equipmentChangedPower).toEqual(store.equipmentChangedPower)
    expect(store.equipmentActualGain).not.toBeNull()
    expect(state1.equipmentChangedActualOutput).toBeCloseTo(
      store.effOutputWithBuff * (1 + store.equipmentActualGain! / 100),
      10,
    )
    expect(summary.equipmentBattleGain).not.toBe(0)
    expect(summary.equipmentActualGain).not.toBe(0)
  })

  it('原輸出占比加權會先算各狀態增幅，不會先合併輸出再算總增幅', () => {
    const s = scenarios.find((x) => x.name === 'buffs-custom-hero')!
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.applySaveData(toSaveData(s))
    slots.copyState('state1', 'state2')
    slots.setWeight('state1', 40)
    slots.setWeight('state2', 60)

    store.activateWorkspaceSlot('state2')
    store.setField('effAtk', '18000000')
    buffs.setSoulOrbValue(0)

    const summary = calculateWeightedSummary(slots.workspace, buffs.table)
    const activeSlots = summary.slots.filter((slot) => slot.weight > 0)
    const manual = activeSlots.reduce(
      (sum, slot) =>
        sum +
        (slot.weight / 100) *
          ((slot.effOutputWithBuff - slot.effOutputNoBuff) / slot.effOutputNoBuff) *
          100,
      0,
    )
    const aggregateBefore = activeSlots.reduce(
      (sum, slot) => sum + (slot.weight / 100) * slot.effOutputNoBuff,
      0,
    )
    const aggregateAfter = activeSlots.reduce(
      (sum, slot) => sum + (slot.weight / 100) * slot.effOutputWithBuff,
      0,
    )
    const oldAggregateGain = ((aggregateAfter - aggregateBefore) / aggregateBefore) * 100

    expect(summary.effectiveWeights.state1).toBe(40)
    expect(summary.effectiveWeights.state2).toBe(60)
    expect(summary.actualBuffGain).toBeCloseTo(manual, 8)
    expect(summary.actualBuffGain).not.toBeCloseTo(oldAggregateGain, 6)
  })

  it('原輸出占比總和不是 100 時會正規化，全部為 0 時 fallback 到狀態1', () => {
    const s = scenarios.find((x) => x.name === 'buffs-custom-hero')!
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.applySaveData(toSaveData(s))
    slots.setWeight('state1', 40)
    slots.setWeight('state2', 40)

    let summary = calculateWeightedSummary(slots.workspace, buffs.table)
    expect(summary.usedFallbackWeights).toBe(false)
    expect(summary.effectiveWeights.state1).toBe(50)
    expect(summary.effectiveWeights.state2).toBe(50)

    slots.setWeight('state1', 0)
    slots.setWeight('state2', 0)
    slots.setWeight('state3', 0)
    slots.setWeight('state4', 0)
    slots.setWeight('state5', 0)

    summary = calculateWeightedSummary(slots.workspace, buffs.table)
    expect(summary.usedFallbackWeights).toBe(true)
    expect(summary.effectiveWeights.state1).toBe(100)
    expect(summary.effectiveWeights.state2).toBe(0)
  })

  it('數值換算使用各狀態增幅的占比平均', () => {
    expect(
      weightedPercentGain([
        { share: 50, before: 100, after: 150 },
        { share: 50, before: 100, after: 133.33333333333331 },
      ]),
    ).toBeCloseTo(41.66666666666666, 10)
  })

  it('加權含 Buff 戰力副標使用正規化占比後的含 Buff 戰力', () => {
    const s = scenarios.find((x) => x.name === 'buffs-custom-hero')!
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.applySaveData(toSaveData(s))
    slots.copyState('state1', 'state2')
    slots.setWeight('state1', 40)
    slots.setWeight('state2', 40)

    const summary = calculateWeightedSummary(slots.workspace, buffs.table)
    const expected = summary.slots.reduce(
      (sum, slot) => sum + (slot.weight / 100) * store.powerValue(slot.powerWithBuff),
      0,
    )
    expect(summary.effectiveWeights.state1).toBe(50)
    expect(summary.effectiveWeights.state2).toBe(50)
    expect(summary.combatBuffPower).toBeCloseTo(expected, 3)
  })

  it('加權狀態的滿魂基準逐狀態跟隨海外創世武器校正，實戰仍用實際武器', () => {
    const s = scenarios.find((x) => x.name === 'overseas-genesis-fam47')!
    const store = useCharacterStore()
    const buffs = useBuffsStore()
    const slots = useStateSlotsStore()

    store.applySaveData(toSaveData(s))
    buffs.clearAllForMode('combat')
    buffs.setSoulOrbFullSoul(true)
    buffs.setCombatCorrection('genesis', true)
    slots.saveRuntimeSnapshot(
      store.fields,
      {
        selectedJob: store.selectedJob,
        selectedJobName: store.selectedJobName,
        effSelectedJob: store.effSelectedJob,
      },
      buffs.collectState(),
    )
    slots.copyState('state1', 'state2')

    store.activateWorkspaceSlot('state2')
    buffs.setCombatCorrection('genesis', false)
    store.activateWorkspaceSlot('state1')
    slots.setWeight('state1', 50)
    slots.setWeight('state2', 50)

    const summary = calculateWeightedSummary(slots.workspace, buffs.table)
    const state1 = summary.slots.find((slot) => slot.id === 'state1')!
    const state2 = summary.slots.find((slot) => slot.id === 'state2')!

    expect(store.combatSoulOrbWeaponAtk).toBe(752)
    expect(state1.powerWithBuff).toEqual(store.powerWithBuff)

    store.activateWorkspaceSlot('state2')
    expect(store.combatSoulOrbWeaponAtk).toBe(680)
    expect(state2.powerWithBuff).toEqual(store.powerWithBuff)
    expect(state1.effOutputWithBuff).toBe(state2.effOutputWithBuff)
  })
})

describe('ui store', () => {
  it('視圖/模式持久化與舊 id 遷移', () => {
    localStorage.setItem('activeView', 'equipment')
    let ui = useUiStore()
    expect(ui.activeView).toBe('valueConversion')

    // 認不得的 id 退回預設分頁。預設是「同步裝備」而不是上游的手動輸入 ——
    // MapleBuilding 每一頁都要有同步過的資料才有東西看。
    localStorage.setItem('activeView', 'apiImport')
    setActivePinia(createPinia())
    ui = useUiStore()
    expect(ui.activeView).toBe('equipmentSets')

    ui.activeView = 'equipmentChange'
    expect(localStorage.getItem('activeView')).toBe('equipmentChange')
  })
})

describe('跨模式複製', () => {
  it('copyCombatDataToEff 對應欄位複製', () => {
    const store = useCharacterStore()
    store.setField('baseMain', '777')
    store.setField('adjDAHP', '999')
    store.copyCombatDataToEff()
    expect(store.fields.effBaseMain).toBe('777')
    expect(store.fields.effBaseHP).toBe('999')
  })
})
