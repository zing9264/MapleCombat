// 計算核心黃金值測試：以 fixtures/golden.json 為基準，計算核心輸出必須逐位一致。
import { describe, expect, it } from 'vitest'
import { toFloat32 } from '@/core/float32'
import { floorPercentApplied, floorPercentOf } from '@/core/percentFloor'
import {
  overseasFamMult,
  famMultFromSources,
  guessFamSources,
  resolveFamMult,
  parseFamSources,
} from '@/core/familiar'
import {
  calculatePower,
  powerValue,
  resolveCombatFormulaInputs,
  type CombatPowerContext,
} from '@/core/combatPower'
import { calculateEquipmentOutput, resolveActualFormulaInputs } from '@/core/actualDamage'
import { getEquipmentActualDelta, getEquipmentDelta } from '@/core/equipmentDelta'
import {
  calculateCombatWeaponAttackBasis,
  calculateWeaponCorrectionValue,
  resolveWeaponDataKey,
  type WeaponCorrectionInput,
} from '@/core/weaponCorrection'
import { parseBuffTable } from '@/core/buffs/parse'
import {
  defaultBuffState,
  getCombatBuffDelta,
  getEffBuffDelta,
  getEffBuffIgnoreFactor,
  getSoulOrbAttackBonus,
  type BuffComputeContext,
  type SoulOrbState,
} from '@/core/buffs/delta'
import {
  applicableCombatCorrectionKeys,
  normalizeCombatCorrections,
  type CombatCorrectionState,
} from '@/core/combatCorrections'
import {
  buildTowerRingScenarioState,
  calculateTowerRingCycleShares,
  calculateTowerRingWholeBattleGain,
  getTowerRingAtkPercent,
  getTowerRingGains,
  resolveTowerRingBaseAtkPercent,
} from '@/core/buffs/towerRing'
import type { FieldValues, JobCategory, PowerResult } from '@/core/types'
import { buffImageFor } from '@/data/buffSource'
import buffTableText from '@/assets/buff/增益表.txt?raw'
import golden from './fixtures/golden.json'

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
  outputs: {
    powerNoBuff: PowerResult
    powerWithBuff: PowerResult
    effOutputNoBuff: number
    effOutputWithBuff: number
    equipmentDelta: Record<string, number>
    equipmentActualDelta: Record<string, number>
    powerWithEquipDelta: PowerResult
    combatBuffDelta: Record<string, number>
    effBuffDelta: Record<string, number>
    effIgnoreFactor: number
    resolvedWeaponKey: string
    weaponCorrectionResolved: number
    weaponCorrectionGenesis: number
    adjWeaponAtk: string
    statLabels: { main: string; sub: string; secondSub: string }
  }
}

const buffTable = parseBuffTable(buffTableText)

describe('百分比套用取整', () => {
  it.each([
    { base: 725, percent: 16, expected: 841 },
    { base: 100, percent: 13, expected: 113 },
    { base: 25, percent: 16, expected: 29 },
    { base: 3450, percent: 82, expected: 6279 },
  ])('floorPercentApplied($base, $percent) === $expected', ({ base, percent, expected }) => {
    expect(floorPercentApplied(base, percent)).toBe(expected)
  })

  it('非整數結果向下取整，未套用數值在取整後加入', () => {
    expect(floorPercentOf(725, 16)).toBe(116)
    expect(floorPercentApplied(101, 13)).toBe(114)
    expect(floorPercentApplied(725, 16) + 9).toBe(850)
  })
})

function buildFields(inputs: Record<string, string | boolean>): FieldValues {
  const fields: FieldValues = {}
  for (const [id, value] of Object.entries(inputs)) {
    if (typeof value === 'boolean') continue
    fields[id] = +value || 0
  }
  return fields
}

function weaponInput(s: GoldenScenario): WeaponCorrectionInput {
  const inputs = s.inputs
  return {
    weaponSet: String(inputs.weaponSet),
    flameLevel: parseInt(String(inputs.flameLevel)) || 0,
    scrollAtk: parseInt(String(inputs.scrollAtk)) || 0,
    starCount: parseInt(String(inputs.starCount)) || 0,
    currentWeaponAtk: parseInt(String(inputs.currentWeaponAtk)) || 0,
    jobCategory: s.selectedJob as JobCategory,
    isZeroJob: s.selectedJobName === '神之子',
  }
}

function combatCtx(s: GoldenScenario, useBuff: boolean): CombatPowerContext {
  const wIn = weaponInput(s)
  const resolvedKey = resolveWeaponDataKey(wIn)
  return {
    jobCategory: s.selectedJob as JobCategory,
    jobName: s.selectedJobName,
    weaponSet: String(s.inputs.weaponSet),
    genesisFinalChecked: s.inputs.genesisFinalCheck === true,
    useBuff,
    combatCorrections: normalizeCombatCorrections(s.buffState.combatCorrections),
    overseasGenesisAtkDelta:
      calculateWeaponCorrectionValue('genesis', wIn) -
      calculateWeaponCorrectionValue(resolvedKey, wIn),
    xenonPowerCoefficientRaw: String(s.inputs.adjXenonPowerCoefficient ?? ''),
    daPowerCoefficientRaw: String(s.inputs.adjDAPowerCoefficient ?? ''),
  }
}

function soulOrbState(s: GoldenScenario): SoulOrbState {
  return {
    ...s.buffState.soulOrb,
    fullSoul: s.buffState.soulOrb.fullSoul !== false,
  }
}

function buffCtx(s: GoldenScenario, mode: 'combat' | 'eff'): BuffComputeContext {
  const wIn = weaponInput(s)
  return {
    job: (mode === 'combat' ? s.selectedJob : s.effSelectedJob) as JobCategory,
    statLabels: s.outputs.statLabels,
    currentWeaponAtk: Number(s.inputs.currentWeaponAtk) || 0,
    combatWeaponAtk: calculateCombatWeaponAttackBasis(
      wIn,
      normalizeCombatCorrections(s.buffState.combatCorrections),
    ),
    soulOrb: soulOrbState(s),
  }
}

describe('float32（Excel 式單精度模擬）', () => {
  it.each(golden.float32)('toFloat32($input) === $output', ({ input, output }) => {
    expect(toFloat32(input)).toBe(output)
  })
})

describe('萌獸終傷 float32 累加求解', () => {
  it.each(golden.familiar)('overseasFamMult($input) === $output', ({ input, output }) => {
    expect(overseasFamMult(input)).toBe(output)
  })
})

describe('萌獸終傷逐條來源（famMultFromSources / resolveFamMult）', () => {
  // 標準組成下，逐條來源結果必須與「從總值猜測組成」的 overseasFamMult 逐位一致。
  it.each([
    { sources: [20], total: 20 },
    { sources: [20, 20], total: 40 },
    { sources: [20, 20, 2], total: 42 },
    { sources: [2, 2, 2, 2], total: 8 },
    { sources: [25], total: 25 },
    { sources: [25, 25, 2, 2], total: 54 },
  ])('famMultFromSources($sources) === overseasFamMult($total)', ({ sources, total }) => {
    expect(famMultFromSources(sources)).toBe(overseasFamMult(total))
  })

  it('排序不影響結果（降冪累加）', () => {
    expect(famMultFromSources([2, 20, 20])).toBe(famMultFromSources([20, 20, 2]))
  })

  it('非標準來源也能計算（猜測器無法整除拆解）', () => {
    expect(famMultFromSources([5, 5, 5])).toBeGreaterThan(1)
    expect(Number.isFinite(famMultFromSources([5, 5, 5]))).toBe(true)
  })

  it('parseFamSources：過濾空白與非數字', () => {
    expect(parseFamSources('20,20,2')).toEqual([20, 20, 2])
    expect(parseFamSources(' 20 , , 2 ,x')).toEqual([20, 2])
    expect(parseFamSources('')).toEqual([])
    expect(parseFamSources(null)).toEqual([])
  })

  it.each([
    { total: 20, sources: [20] },
    { total: 42, sources: [20, 20, 2] },
    { total: 54, sources: [25, 25, 2, 2] },
    { total: 17, sources: [17] },
  ])('guessFamSources：總值 $total 推測為 $sources', ({ total, sources }) => {
    expect(guessFamSources(total)).toEqual(sources)
  })

  it('resolveFamMult：無來源時等同 overseasFamMult（黃金值路徑不變）', () => {
    expect(resolveFamMult(null, 42)).toBe(overseasFamMult(42))
    expect(resolveFamMult([], 42)).toBe(overseasFamMult(42))
  })

  it('resolveFamMult：有來源時直接用來源累加', () => {
    expect(resolveFamMult([20, 20, 2], 42)).toBe(famMultFromSources([20, 20, 2]))
  })

  it('resolveFamMult：buff/裝備 delta 超出逐條加總的部分併為額外一條', () => {
    // 來源加總 40，但 resolvedPct 42（多出的 2 來自 buff/delta）→ 等同 [20,20,2]
    expect(resolveFamMult([20, 20], 42)).toBe(famMultFromSources([20, 20, 2]))
  })

  it('裝備新增一條 20% 等同直接在目前戰鬥力／實戰來源新增一條 20%', () => {
    const baseSources = [20, 20]
    const newSources = [20]
    const fields: FieldValues = {
      famFinal: 40,
      effFamFinal: 40,
      eqNewFamFinal: 20,
    }
    const sourceInputs = { base: baseSources, old: [], new: newSources }
    const delta = getEquipmentDelta(fields, 'normal', sourceInputs)
    const actualDelta = getEquipmentActualDelta(fields, 'normal', sourceInputs)
    const scalarDelta = getEquipmentDelta(fields, 'normal', {
      base: baseSources,
      old: [],
      new: [],
    })
    const actualScalarDelta = getEquipmentActualDelta(fields, 'normal', {
      base: baseSources,
      old: [],
      new: [],
    })

    expect(delta.famFinal).toBe(0)
    expect(delta.__eqFamFinalMultiplierFactor).toBe(
      famMultFromSources([20, 20, 20]) / famMultFromSources(baseSources),
    )
    expect(scalarDelta.__eqFamFinalMultiplierFactor).toBe(delta.__eqFamFinalMultiplierFactor)
    expect(actualScalarDelta.__eqFamFinalMultiplierFactor).toBe(
      actualDelta.__eqFamFinalMultiplierFactor,
    )

    const combatResolved = resolveCombatFormulaInputs(
      fields,
      {
        jobCategory: 'normal',
        jobName: '英雄',
        weaponSet: 'arcane',
        genesisFinalChecked: false,
        useBuff: false,
        overseasGenesisAtkDelta: 0,
        xenonPowerCoefficientRaw: '',
        daPowerCoefficientRaw: '',
        famFinalSources: baseSources,
      },
      delta,
    )
    const actualResolved = resolveActualFormulaInputs(
      fields,
      { effJob: 'normal', ignoreFactor: 1, effFamFinalSources: baseSources },
      actualDelta,
    )
    expect(combatResolved.finalMult).toBe(famMultFromSources([20, 20, 20]))
    expect(actualResolved.finalMultiplier).toBe(famMultFromSources([20, 20, 20]))
  })

  it('裝備逐條從目前來源移除一個重複值，再加入變更後來源', () => {
    const baseSources = [20, 20, 2]
    const fields: FieldValues = {
      famFinal: 42,
      eqOldFamFinal: 20,
      eqNewFamFinal: 25,
    }
    const delta = getEquipmentDelta(fields, 'normal', {
      base: baseSources,
      old: [20],
      new: [25],
    })

    expect(delta.__eqFamFinalMultiplierFactor).toBe(
      famMultFromSources([25, 20, 2]) / famMultFromSources(baseSources),
    )
  })

  it('找不到原裝備來源時仍按總值扣除，透過殘差反映', () => {
    const baseSources = [25, 20, 2]
    const delta = getEquipmentDelta(
      { famFinal: 47, eqOldFamFinal: 17 },
      'normal',
      { base: baseSources, old: [17], new: [] },
    )

    expect(delta.__eqFamFinalMultiplierFactor).toBe(
      resolveFamMult(baseSources, 30) / famMultFromSources(baseSources),
    )
  })

  it('戰鬥力與實戰各自先推測目前／原／新總值來源，空白不產生差分', () => {
    const fields = {
      famFinal: 40,
      effFamFinal: 20,
      eqOldFamFinal: 20,
      eqNewFamFinal: 25,
    }
    const scalarDelta = getEquipmentDelta(
      fields,
      'normal',
    )
    expect(scalarDelta.__eqFamFinalMultiplierFactor).toBe(
      famMultFromSources([25, 20]) / overseasFamMult(40),
    )
    const actualScalarDelta = getEquipmentActualDelta(fields, 'normal')
    expect(actualScalarDelta.__eqFamFinalMultiplierFactor).toBe(
      overseasFamMult(25) / overseasFamMult(20),
    )

    const emptyDelta = getEquipmentDelta({}, 'normal')
    expect(emptyDelta.famFinal).toBe(0)
    expect(emptyDelta).not.toHaveProperty('__eqFamFinalMultiplierFactor')
  })
})

describe('集中狂攻主動傳授技能', () => {
  const ctx: BuffComputeContext = {
    job: 'normal',
    statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
    currentWeaponAtk: 0,
    combatWeaponAtk: 0,
    soulOrb: { value: 0, stat: 'percentStr', fullSoul: false },
  }

  it.each([
    { level: 2, damage: 12 },
    { level: 3, damage: 18 },
  ])('Lv.$level 在實戰 Buff 套用 $damage% 傷害', ({ level, damage }) => {
    const buff = buffTable.buffIndex['pass:集中狂攻']
    expect(buff.hasActive).toBe(true)
    expect(getEffBuffDelta(buffTable, { [buff.id]: level }, ctx)).toEqual({ effDmg: damage })
    expect(getCombatBuffDelta(buffTable, { [buff.id]: level }, ctx)).toEqual({ dmg: damage })
  })
})

describe('靈魂寶珠滿魂', () => {
  const context = (
    soulOrb: SoulOrbState,
    currentWeaponAtk = 199,
    combatWeaponAtk = currentWeaponAtk,
  ): BuffComputeContext => ({
    job: 'normal',
    statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
    currentWeaponAtk,
    combatWeaponAtk,
    soulOrb,
  })

  it('顯示用攻擊力採武器攻擊力 10% 無條件捨去', () => {
    expect(getSoulOrbAttackBonus(199)).toBe(19)
    expect(getSoulOrbAttackBonus(200)).toBe(20)
    expect(getSoulOrbAttackBonus(0)).toBe(0)
    expect(getSoulOrbAttackBonus(-10)).toBe(0)
  })

  it('潛能空白時仍分別加入戰鬥力與實戰攻擊力', () => {
    const ctx = context({ value: 0, stat: 'percentAtk', fullSoul: true }, 199, 846)
    expect(getCombatBuffDelta(buffTable, {}, ctx)).toEqual({ atk: 84 })
    expect(getEffBuffDelta(buffTable, {}, ctx)).toEqual({ effAtk: 19 })
  })

  it('取消滿魂後潛能、無視與攻擊力都不生效', () => {
    const disabled = context({ value: 20, stat: 'percentAtk', fullSoul: false })
    expect(getCombatBuffDelta(buffTable, {}, disabled)).toEqual({})
    expect(getEffBuffDelta(buffTable, {}, disabled)).toEqual({})

    const ignoreDisabled = { value: 20, stat: 'ignoreDefense', fullSoul: false }
    expect(getEffBuffIgnoreFactor(buffTable, {}, ignoreDisabled)).toBe(1)
    expect(
      getEffBuffIgnoreFactor(buffTable, {}, { ...ignoreDisabled, fullSoul: true }),
    ).toBeCloseTo(0.8, 10)
  })

  it('勾選滿魂且潛能有值時同時套用兩種效果', () => {
    const ctx = context({ value: 6, stat: 'percentAtk', fullSoul: true }, 200)
    expect(getCombatBuffDelta(buffTable, {}, ctx)).toEqual({ percentAtk: 6, atk: 20 })
    expect(getEffBuffDelta(buffTable, {}, ctx)).toEqual({ effPercentAtk: 6, effAtk: 20 })
  })
})

describe('滿魂戰鬥力基準武器', () => {
  const baseInput: WeaponCorrectionInput = {
    weaponSet: 'genesis',
    flameLevel: 0,
    scrollAtk: 0,
    starCount: 0,
    currentWeaponAtk: 500,
    jobCategory: 'normal',
    isZeroJob: false,
  }

  it('使用武器校正後完整總攻，武器總攻空白時維持 0', () => {
    expect(calculateCombatWeaponAttackBasis(baseInput, { genesis: true })).toBe(318)
    expect(
      calculateCombatWeaponAttackBasis({ ...baseInput, currentWeaponAtk: 0 }, { genesis: true }),
    ).toBe(0)
  })

  it('神之子使用專用武器資料', () => {
    expect(
      calculateCombatWeaponAttackBasis(
        {
          ...baseInput,
          weaponSet: 'fafnir',
          flameLevel: 6,
          isZeroJob: true,
        },
        { genesis: true },
      ),
    ).toBe(217)
  })

  it('海外創世武器跟隨創世武器校正切換基準', () => {
    const overseasInput: WeaponCorrectionInput = { ...baseInput, jobCategory: 'overseas' }
    expect(calculateCombatWeaponAttackBasis(overseasInput, { genesis: false })).toBe(276)
    expect(calculateCombatWeaponAttackBasis(overseasInput, { genesis: true })).toBe(318)
  })
})

describe('含 Buff 戰鬥力校正', () => {
  const context = (
    jobCategory: JobCategory,
    combatCorrections: CombatCorrectionState,
    overrides: Partial<CombatPowerContext> = {},
  ): CombatPowerContext => ({
    jobCategory,
    jobName: jobCategory === 'overseas' ? '墨玄' : '英雄',
    weaponSet: 'fortune',
    genesisFinalChecked: false,
    useBuff: true,
    combatCorrections,
    overseasGenesisAtkDelta: 0,
    xenonPowerCoefficientRaw: '',
    daPowerCoefficientRaw: '',
    ...overrides,
  })

  it('依職業與武器只顯示適用項目', () => {
    expect(applicableCombatCorrectionKeys('normal', 'genesis')).toEqual(['mentor'])
    expect(applicableCombatCorrectionKeys('overseas', 'fortune')).toEqual(['mentor', 'empress'])
    expect(applicableCombatCorrectionKeys('overseas', 'genesis')).toEqual([
      'mentor',
      'empress',
      'genesis',
    ])
  })

  it('師徒校正不再扣除師徒攻擊力與 Boss 傷害', () => {
    const fields = { atk: 200, bossDmg: 40, adjMentorAtk: 3, adjMentorBossDmg: 10 }
    const off = resolveCombatFormulaInputs(
      fields,
      context('normal', { mentor: false, empress: true, genesis: true }),
    )
    const on = resolveCombatFormulaInputs(
      fields,
      context('normal', { mentor: true, empress: true, genesis: true }),
    )
    expect(off.attack.base).toBe(197)
    expect(off.bossDamage).toBe(30)
    expect(on.attack.base).toBe(200)
    expect(on.bossDamage).toBe(40)
  })

  it('海外職業只有勾選女皇時才計入女皇祝福', () => {
    const fields = { atk: 200, adjEmpressBless: 30 }
    const off = resolveCombatFormulaInputs(
      fields,
      context('overseas', { mentor: false, empress: false, genesis: false }),
    )
    const on = resolveCombatFormulaInputs(
      fields,
      context('overseas', { mentor: false, empress: true, genesis: false }),
    )
    expect(off.attack.base).toBe(200)
    expect(on.attack.base).toBe(230)
  })

  it('海外創世武器只有勾選創世時才加入既有攻擊校正差值', () => {
    const fields = { atk: 200, adjWeaponAtk: 100 }
    const off = resolveCombatFormulaInputs(
      fields,
      context(
        'overseas',
        { mentor: false, empress: false, genesis: false },
        { weaponSet: 'genesis', overseasGenesisAtkDelta: 25 },
      ),
    )
    const on = resolveCombatFormulaInputs(
      fields,
      context(
        'overseas',
        { mentor: false, empress: false, genesis: true },
        { weaponSet: 'genesis', overseasGenesisAtkDelta: 25 },
      ),
    )
    expect(off.attack.base).toBe(300)
    expect(on.attack.base).toBe(325)
  })

  it('無 Buff 模式忽略全部校正', () => {
    const fields = {
      atk: 200,
      adjWeaponAtk: 100,
      adjMentorAtk: 3,
      adjMentorBossDmg: 10,
      adjEmpressBless: 30,
    }
    const off = resolveCombatFormulaInputs(
      fields,
      context(
        'overseas',
        { mentor: false, empress: false, genesis: false },
        { useBuff: false, weaponSet: 'genesis', overseasGenesisAtkDelta: 25 },
      ),
    )
    const on = resolveCombatFormulaInputs(
      fields,
      context(
        'overseas',
        { mentor: true, empress: true, genesis: true },
        { useBuff: false, weaponSet: 'genesis', overseasGenesisAtkDelta: 25 },
      ),
    )
    expect(on).toEqual(off)
  })
})

describe('數值預覽公式前解析', () => {
  it('戰鬥力資料套用技能消耗與特殊校正', () => {
    const fields: FieldValues = {
      baseMain: 100,
      percentMain: 20,
      noApplyMain: 10,
      skillBaseMain: 10,
      skillPercentMain: 5,
      baseSub: 50,
      atk: 200,
      percentAtk: 30,
      noApplyAtk: 5,
      skillAtk: 20,
      skillPercentAtk: 10,
      adjEventAllStat: 5,
      adjEventAtk: 10,
      adjMentorAtk: 3,
      bossDmg: 40,
      skillBossDmg: 5,
      adjMentorBossDmg: 10,
    }
    const resolved = resolveCombatFormulaInputs(fields, {
      jobCategory: 'normal',
      jobName: '英雄',
      weaponSet: 'fortune',
      genesisFinalChecked: false,
      useBuff: false,
      overseasGenesisAtkDelta: 0,
      xenonPowerCoefficientRaw: '',
      daPowerCoefficientRaw: '',
    })

    expect(resolved.main).toEqual({
      base: 95,
      percent: 15,
      noApply: 10,
      total: 119,
      panel: 130, // floor(100*1.2)+10，未扣技能.消耗、未套校正
      skillBase: 10,
      skillPercent: 5,
    })
    expect(resolved.attack).toEqual({
      base: 187,
      percent: 20,
      noApply: 5,
      total: 229,
      panel: 265, // floor(200*1.3)+5
      skillBase: 20,
      skillPercent: 10,
    })
    expect(resolved.bossDamage).toBe(25)
    // 顯示用扣除明細：value = 校正後代入值；panel = 扣前；skill = 技能.消耗
    expect(resolved.bossDamageDetail).toEqual({ value: 25, panel: 40, skill: 5 })
    expect(resolved.damageDetail).toEqual({ value: 0, panel: 0, skill: 0 })
  })

  it('實戰資料直接解析輸入與 Buff delta', () => {
    const resolved = resolveActualFormulaInputs(
      {
        effBaseMain: 100,
        effPercentMain: 20,
        effNoApplyMain: 5,
        effBaseSub: 40,
        effAtk: 200,
        effPercentAtk: 10,
        effDmg: 30,
      },
      { effJob: 'normal', ignoreFactor: 1 },
      {},
      { effBaseMain: 10, effPercentAtk: 5, effBossDmg: 20 },
    )

    expect(resolved.main).toEqual({ base: 110, percent: 20, noApply: 5, total: 137 })
    expect(resolved.attack.base).toBe(200)
    expect(resolved.attack.percent).toBe(15)
    expect(resolved.attack.noApply).toBe(0)
    expect(resolved.attack.total).toBeCloseTo(230, 10)
    expect(resolved.damage).toBe(30)
    expect(resolved.bossDamage).toBe(20)
  })
})

describe('黃金值情境比對（舊版 dist 實際輸出）', () => {
  const scenarios = golden.scenarios as unknown as GoldenScenario[]

  it.each(scenarios)('$name：武器攻擊校正', (s) => {
    const wIn = weaponInput(s)
    const resolvedKey = resolveWeaponDataKey(wIn)
    expect(resolvedKey).toBe(s.outputs.resolvedWeaponKey)
    expect(calculateWeaponCorrectionValue(resolvedKey, wIn)).toBe(
      s.outputs.weaponCorrectionResolved,
    )
    expect(calculateWeaponCorrectionValue('genesis', wIn)).toBe(s.outputs.weaponCorrectionGenesis)
  })

  it.each(scenarios)('$name：Buff delta', (s) => {
    const combatDelta = getCombatBuffDelta(buffTable, s.buffState.levels, buffCtx(s, 'combat'))
    expect(combatDelta).toEqual(s.outputs.combatBuffDelta)

    const effDelta = getEffBuffDelta(buffTable, s.buffState.levels, buffCtx(s, 'eff'))
    expect(effDelta).toEqual(s.outputs.effBuffDelta)

    const ignoreFactor = getEffBuffIgnoreFactor(buffTable, s.buffState.levels, soulOrbState(s))
    expect(ignoreFactor).toBe(s.outputs.effIgnoreFactor)
  })

  it.each(scenarios)('$name：戰鬥力（無 Buff / 含 Buff）', (s) => {
    const fields = buildFields(s.inputs)

    const noBuff = calculatePower(fields, combatCtx(s, false), {}, {})
    expect(noBuff).toEqual(s.outputs.powerNoBuff)

    const combatDelta = getCombatBuffDelta(buffTable, s.buffState.levels, buffCtx(s, 'combat'))
    const withBuff = calculatePower(fields, combatCtx(s, true), {}, combatDelta)
    expect(withBuff).toEqual(s.outputs.powerWithBuff)
  })

  it.each(scenarios)('$name：實戰輸出（無 Buff / 含 Buff）', (s) => {
    const fields = buildFields(s.inputs)
    const effJob = s.effSelectedJob as JobCategory

    const noBuff = calculateEquipmentOutput(fields, { effJob, ignoreFactor: 1 }, {}, {})
    expect(noBuff).toBe(s.outputs.effOutputNoBuff)

    const effDelta = getEffBuffDelta(buffTable, s.buffState.levels, buffCtx(s, 'eff'))
    const ignoreFactor = getEffBuffIgnoreFactor(buffTable, s.buffState.levels, soulOrbState(s))
    const withBuff = calculateEquipmentOutput(fields, { effJob, ignoreFactor }, {}, effDelta)
    expect(withBuff).toBe(s.outputs.effOutputWithBuff)
  })

  it.each(scenarios)('$name：裝備變更 delta 與變更後戰鬥力', (s) => {
    const fields = buildFields(s.inputs)
    const job = s.selectedJob as JobCategory

    expect(getEquipmentDelta(fields, job)).toEqual(s.outputs.equipmentDelta)
    expect(getEquipmentActualDelta(fields, job)).toEqual(s.outputs.equipmentActualDelta)

    const changed = calculatePower(fields, combatCtx(s, false), getEquipmentDelta(fields, job), {})
    expect(changed).toEqual(s.outputs.powerWithEquipDelta)
  })

  it('powerValue 取代表值（range 取低）', () => {
    expect(powerValue({ type: 'single', value: 42 })).toBe(42)
    expect(powerValue({ type: 'range', high: 100, low: 90 })).toBe(90)
    expect(powerValue(null)).toBe(0)
  })
})

describe('塔戒整場輸出增幅', () => {
  it('塔戒試算會排除所有非常駐 Buff、套用卡片選項並保留常駐狀態', () => {
    const scenario = buildTowerRingScenarioState(
      buffTable,
      {
        'skill:無雙之力': 1,
        'skill:妖精密語': 1,
        'skill:規範戒指': 6,
        'skill:永續戒指': 4,
      },
      { 'skill:無雙之力': 1 },
    )

    expect(scenario['skill:無雙之力']).toBe(1)
    expect(scenario['skill:妖精密語']).toBe(0)
    expect(scenario['skill:規範戒指']).toBe(0)
    expect(scenario['skill:永續戒指']).toBe(4)
  })

  it('非常駐 Buff 解析為完整值並保留持續／冷卻資訊', () => {
    const mugong = buffTable.buffIndex['skill:無雙之力']
    const fairy = buffTable.buffIndex['skill:妖精密語']
    const gauge = buffTable.buffIndex['skill:規範戒指']

    expect(mugong.nonPermanent).toBe(true)
    expect(mugong.shortName).toBe('武公寶珠')
    expect(mugong.levels[1]).toContainEqual({
      cat: 'percentAtk',
      value: 100,
      active: true,
      equivalent: false,
    })
    expect(mugong.levelNotes[1]).toBe('持續60秒、冷卻150秒')
    expect(fairy.shortName).toBe('艾畢寶珠')
    expect(gauge.nonPermanent).toBe(true)
    expect(gauge.shortName).toBe('規範')
    expect(gauge.levelNotes[6]).toBe('持續20秒、冷卻120秒')
  })

  it('新增技能／裝備 Buff 的數值與圖示可正常載入', () => {
    const oracle = buffTable.buffIndex['skill:神諭者的戒指']
    const midnight = buffTable.buffIndex['skill:午夜的現身']
    const innerStorm = buffTable.buffIndex['skill:內面暴風']

    expect(oracle.defaultLevel).toBe(0)
    expect(oracle.maxLevel).toBe(10)
    expect(oracle.levels[10]).toContainEqual({
      cat: 'critDmg',
      value: 10,
      active: true,
      equivalent: false,
    })
    expect(midnight.defaultLevel).toBe(0)
    expect(midnight.levels[1]).toContainEqual({
      cat: 'ignoreDefense',
      value: 10,
      active: true,
      equivalent: false,
    })
    expect(innerStorm.defaultLevel).toBe(0)
    expect(innerStorm.levels[1]).toContainEqual({
      cat: 'atkFlat',
      value: 20,
      active: true,
      equivalent: false,
    })
    expect(buffImageFor('skill', '神諭者的戒指')).toBeTruthy()
    expect(buffImageFor('skill', '午夜的現身')).toBeTruthy()
    expect(buffImageFor('skill', '內面暴風')).toBeTruthy()
  })

  it('快速列計數只包含目前會套入實戰計算的 Buff', () => {
    const state = defaultBuffState(buffTable)
    const selectedActiveCount = buffTable.categories.reduce(
      (total, category) =>
        total +
        category.buffs.filter((buff) => {
          const level = state[buff.id] || 0
          const abilities = buff.levels[buff.type === 'check' ? 1 : level] || []
          return level > 0 && abilities.some((ability) => ability.active)
        }).length,
      0,
    )

    expect(state['skill:一擊必殺']).toBe(1)
    expect(buffTable.buffIndex['skill:一擊必殺'].displayName).toBe(
      '一擊必殺(依占比15%套用)',
    )
    expect(buffTable.buffIndex['skill:一擊必殺'].nonPermanent).toBe(true)
    expect(selectedActiveCount).toBe(35)
  })

  it('賽伊蘭與收藏家靈藥使用完整數值', () => {
    const sailan = buffTable.buffIndex['pot:賽伊蘭的靈藥'].levels[1]
    const collector = buffTable.buffIndex['pot:收藏家的靈藥'].levels[1]

    expect(sailan).toEqual([
      { cat: 'atkFlat', value: 50, active: true, equivalent: false },
      { cat: 'percentAtk', value: 10, active: true, equivalent: false },
      { cat: 'bossDmg', value: 10, active: true, equivalent: false },
      { cat: 'critDmg', value: 8, active: true, equivalent: false },
    ])
    expect(collector).toEqual([
      { cat: 'allStatFlat', value: 30, active: true, equivalent: false },
      { cat: 'atkFlat', value: 100, active: true, equivalent: false },
    ])
  })

  it('規範戒指各等級攻擊力%直接讀取 Buff 原始資料', () => {
    expect([1, 2, 3, 4, 5, 6].map((level) => getTowerRingAtkPercent(buffTable, level))).toEqual([
      17, 34, 51, 68, 68, 85,
    ])
  })

  it('依 36% 總占比與第一、第三週期武公推算 Lv.5 約 7.73%', () => {
    const input = {
      totalSharePercent: 36,
      baseAtkPercent: 150,
      mugongAtkPercent: 100,
      mugongCycles: [true, false, true] as const,
    }
    const shares = calculateTowerRingCycleShares(input)

    expect(shares?.[0]).toBeCloseTo(13.2631578947, 9)
    expect(shares?.[1]).toBeCloseTo(9.4736842105, 9)
    expect(shares?.[2]).toBeCloseTo(13.2631578947, 9)
    expect(
      calculateTowerRingWholeBattleGain({
        ...input,
        ringAtkPercent: 68,
        coverage: 1,
      }),
    ).toBeCloseTo(7.7305263158, 9)
  })

  it('三週期全無或全有武公時占比平均分配', () => {
    const base = {
      totalSharePercent: 36,
      baseAtkPercent: 150,
      mugongAtkPercent: 100,
    }
    expect(calculateTowerRingCycleShares({ ...base, mugongCycles: [false, false, false] })).toEqual(
      [12, 12, 12],
    )
    const allMugong = calculateTowerRingCycleShares({
      ...base,
      mugongCycles: [true, true, true],
    })
    expect(allMugong?.[0]).toBeCloseTo(12, 10)
    expect(allMugong?.[1]).toBeCloseTo(12, 10)
    expect(allMugong?.[2]).toBeCloseTo(12, 10)
  })

  it('總占比或基準攻擊%無效時不計算', () => {
    const common = {
      baseAtkPercent: 150,
      mugongAtkPercent: 100,
      mugongCycles: [true, false, true] as const,
      ringAtkPercent: 68,
      coverage: 1,
    }
    expect(calculateTowerRingWholeBattleGain({ ...common, totalSharePercent: null })).toBeNull()
    expect(calculateTowerRingWholeBattleGain({ ...common, totalSharePercent: -1 })).toBeNull()
    expect(calculateTowerRingWholeBattleGain({ ...common, totalSharePercent: 101 })).toBeNull()
    expect(
      calculateTowerRingWholeBattleGain({
        ...common,
        totalSharePercent: 36,
        baseAtkPercent: null,
      }),
    ).toBeNull()
  })

  it('前方 Buff 區的武公與塔戒狀態不影響基準攻擊%', () => {
    const ctx: BuffComputeContext = {
      job: 'normal',
      statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
      currentWeaponAtk: 0,
      combatWeaponAtk: 0,
      soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
    }
    const common = {
      table: buffTable,
      ctx,
      fields: {},
      effJob: 'normal' as const,
      baseAtkPercentRaw: '150',
      totalSharePercent: 36,
      mugongCycles: [true, false, true] as const,
    }
    const off = resolveTowerRingBaseAtkPercent({
      ...common,
      state: { 'skill:無雙之力': 0, 'skill:規範戒指': 0, 'skill:永續戒指': 0 },
    })
    const on = resolveTowerRingBaseAtkPercent({
      ...common,
      state: { 'skill:無雙之力': 1, 'skill:規範戒指': 6, 'skill:永續戒指': 6 },
    })

    expect(on).toBe(off)
    expect(on).toBe(150)
  })

  it('永續戒指為常駐效果，不計算等效增幅', () => {
    const gains = getTowerRingGains(
      {
        table: buffTable,
        state: {},
        ctx: {
          job: 'normal',
          statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
          currentWeaponAtk: 0,
          combatWeaponAtk: 0,
          soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
        },
        fields: {},
        effJob: 'normal',
        baseAtkPercentRaw: '150',
        totalSharePercent: 36,
        mugongCycles: [true, false, true],
      },
      'skill:永續戒指',
    )

    expect(gains.length).toBeGreaterThan(0)
    expect(gains.every((gain) => gain.equivalent === null)).toBe(true)
  })

  it('規範戒指 Lv.1 等效增幅會使用自訂的 20 秒傷害覆蓋率', () => {
    const common = {
      table: buffTable,
      state: {},
      ctx: {
        job: 'normal' as const,
        statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
        currentWeaponAtk: 0,
        combatWeaponAtk: 0,
        soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
      },
      fields: {},
      effJob: 'normal' as const,
      baseAtkPercentRaw: '150',
      totalSharePercent: 36,
      mugongCycles: [true, false, true] as const,
    }
    const defaultGain = getTowerRingGains(
      { ...common, coveragePercentages: [45, 55, 65, 75] },
      'skill:規範戒指',
    ).find((gain) => gain.level === 1)?.equivalent
    const doubledGain = getTowerRingGains(
      { ...common, coveragePercentages: [90, 55, 65, 75] },
      'skill:規範戒指',
    ).find((gain) => gain.level === 1)?.equivalent
    const invalidGain = getTowerRingGains(
      { ...common, coveragePercentages: [NaN, 55, 65, 75] },
      'skill:規範戒指',
    ).find((gain) => gain.level === 1)?.equivalent

    expect(defaultGain).not.toBeNull()
    expect(doubledGain).toBeCloseTo((defaultGain ?? 0) * 2, 10)
    expect(invalidGain).toBeNull()
  })

  it('規範戒指 Lv.4 與 Lv.5 攻擊力相同，但整場平均效益依覆蓋率分開', () => {
    const gains = getTowerRingGains(
      {
        table: buffTable,
        state: {},
        ctx: {
          job: 'normal',
          statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
          currentWeaponAtk: 0,
          combatWeaponAtk: 0,
          soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
        },
        fields: {},
        effJob: 'normal',
        baseAtkPercentRaw: '150',
        totalSharePercent: 36,
        mugongCycles: [true, false, true],
        coveragePercentages: [45, 55, 65, 75],
      },
      'skill:規範戒指',
    )
    const level4 = gains.find((gain) => gain.level === 4)
    const level5 = gains.find((gain) => gain.level === 5)

    expect(getTowerRingAtkPercent(buffTable, 4)).toBe(getTowerRingAtkPercent(buffTable, 5))
    expect(level4?.equivalent).toBeCloseTo(5.7978947368, 9)
    expect(level5?.equivalent).toBeCloseTo(7.7305263158, 9)
    expect(level4?.equivalent).toBeCloseTo((level5?.equivalent ?? 0) * 0.75, 9)
  })

  it('戒指效益以目前等級為錨點，未裝為負值且目前列為 ±0', () => {
    const gains = getTowerRingGains(
      {
        table: buffTable,
        state: { 'skill:永續戒指': 4 },
        ctx: {
          job: 'normal',
          statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
          currentWeaponAtk: 0,
          combatWeaponAtk: 0,
          soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
        },
        fields: {
          effBaseMain: 1000,
          effBaseSub: 300,
          effAtk: 200,
          effPercentAtk: 100,
        },
        effJob: 'normal',
        baseAtkPercentRaw: '100',
        totalSharePercent: null,
        mugongCycles: [false, false, false],
      },
      'skill:永續戒指',
      4,
    )

    expect(gains.find((gain) => gain.level === 4)).toMatchObject({
      current: true,
      vsCurrent: 0,
    })
    expect(gains.find((gain) => gain.level === 0)).toMatchObject({ vsNone: 0 })
    expect(gains.find((gain) => gain.level === 0)?.vsCurrent).toBeLessThan(0)
    expect(gains.find((gain) => gain.level === 4)?.vsNone).toBeGreaterThan(0)
    expect(gains.find((gain) => gain.level === 6)?.vsCurrent).toBeGreaterThan(0)
  })

  it('未裝備時相對未裝備與相對目前為同一基準', () => {
    const gains = getTowerRingGains(
      {
        table: buffTable,
        state: {},
        ctx: {
          job: 'normal',
          statLabels: { main: 'STR', sub: 'DEX', secondSub: '' },
          currentWeaponAtk: 0,
          combatWeaponAtk: 0,
          soulOrb: { value: 0, stat: 'percentMain', fullSoul: false },
        },
        fields: {
          effBaseMain: 1000,
          effBaseSub: 300,
          effAtk: 200,
          effPercentAtk: 100,
        },
        effJob: 'normal',
        baseAtkPercentRaw: '100',
        totalSharePercent: null,
        mugongCycles: [false, false, false],
      },
      'skill:永續戒指',
      0,
    )

    expect(gains.every((gain) => gain.vsNone === gain.vsCurrent)).toBe(true)
  })
})
