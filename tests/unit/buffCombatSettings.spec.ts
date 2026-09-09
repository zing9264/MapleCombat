import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import CombatCorrectionControls from '@/components/buffs/CombatCorrectionControls.vue'
import BuffOverlay from '@/components/buffs/BuffOverlay.vue'
import SoulOrbControl from '@/components/buffs/SoulOrbControl.vue'
import BuffPanel from '@/components/buffs/BuffPanel.vue'
import { useBuffsStore } from '@/stores/buffs'
import { useCharacterStore } from '@/stores/character'
import { useUiStore } from '@/stores/ui'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function installCorrectionLayout(initialHeaderWidth: number) {
  let headerWidth = initialHeaderWidth
  let resizeCallback: ResizeObserverCallback | null = null
  const rect = (width: number) =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width,
      height: 24,
      right: width,
      bottom: 24,
      toJSON: () => ({}),
    }) as DOMRect

  class MockResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      resizeCallback = callback
    }

    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('buff-head')) return rect(headerWidth)
    if (this.classList.contains('buff-head-title')) return rect(123)
    if (this.classList.contains('buff-correction-inline')) {
      const labels = Array.from(this.querySelectorAll('.buff-correction-chip-label'))
      const width = labels.reduce(
        (total, label) => total + (label.textContent?.length ?? 0) * 11 + 18,
        0,
      )
      return rect(width + Math.max(0, labels.length - 1) * 4)
    }
    if (this.classList.contains('buff-master-actions')) return rect(136)
    if (this.classList.contains('buff-head-count')) return rect(42)
    if (this.classList.contains('buff-collapse-toggle')) return rect(60)
    return rect(0)
  })

  return {
    setHeaderWidth(value: number) {
      headerWidth = value
    },
    notifyResize() {
      resizeCallback?.([], {} as ResizeObserver)
    },
  }
}

describe('靈魂寶珠滿魂控制', () => {
  it('即時顯示武器攻擊力 10% 無條件捨去與完整說明', async () => {
    const character = useCharacterStore()
    const wrapper = mount(SoulOrbControl, { props: { mode: 'eff' } })

    const fullSoul = wrapper.get('.buff-soul-orb-full')
    expect(fullSoul.text()).toContain('滿魂 +0攻')

    character.setField('currentWeaponAtk', '199')
    await nextTick()
    expect(fullSoul.text()).toContain('滿魂 +19攻')
    expect(fullSoul.attributes('title')).toBe(
      '目前武器攻擊力 199，滿魂增加 19 攻擊力（10% 無條件捨去）',
    )
    expect(wrapper.get('input[type="checkbox"]').attributes('aria-label')).toBe(
      '滿魂，增加 19 攻擊力',
    )

    character.setField('currentWeaponAtk', '200')
    await nextTick()
    expect(fullSoul.text()).toContain('滿魂 +20攻')
    wrapper.unmount()
  })

  it('取消滿魂只改開關，不清空寶珠數值與能力', async () => {
    const buffs = useBuffsStore()
    buffs.setSoulOrbValue(12)
    buffs.setSoulOrbStat('bossDmg')
    const wrapper = mount(SoulOrbControl, { props: { mode: 'eff' } })

    await wrapper.get('input[type="checkbox"]').setValue(false)

    expect(buffs.soulOrb).toMatchObject({ value: 12, stat: 'bossDmg', fullSoul: false })
    expect(wrapper.get('.buff-soul-orb-full').classes()).not.toContain('is-active')
    wrapper.unmount()
  })

  it('戰鬥力頁顯示校正後基準武器換算文字、說明與無障礙名稱', async () => {
    const character = useCharacterStore()
    const wrapper = mount(SoulOrbControl, { props: { mode: 'combat' } })
    const fullSoul = wrapper.get('.buff-soul-orb-full')

    expect(fullSoul.text()).toContain('滿魂 +0攻 (以基準武器換算)')

    character.setField('currentWeaponAtk', '500')
    await nextTick()
    const basis = character.combatSoulOrbWeaponAtk
    const bonus = Math.floor(basis / 10)
    expect(basis).not.toBe(500)
    expect(fullSoul.text()).toContain(`滿魂 +${bonus}攻 (以基準武器換算)`)
    expect(fullSoul.attributes('title')).toBe(
      `校正後基準武器總攻擊力 ${basis}，滿魂增加 ${bonus} 攻擊力（10% 無條件捨去）`,
    )
    expect(wrapper.get('input[type="checkbox"]').attributes('aria-label')).toBe(
      `滿魂，依基準武器換算增加 ${bonus} 攻擊力`,
    )
    wrapper.unmount()
  })

  it('海外創世滿魂基準跟隨創世武器校正', async () => {
    const character = useCharacterStore()
    const buffs = useBuffsStore()
    character.selectJobByName('劍豪')
    character.setField('weaponSet', 'genesis')
    character.setField('flameLevel', '0')
    character.setField('scrollAtk', '0')
    character.setField('starCount', '0')
    character.setField('currentWeaponAtk', '500')
    const wrapper = mount(SoulOrbControl, { props: { mode: 'combat' } })

    await nextTick()
    expect(character.combatSoulOrbWeaponAtk).toBe(318)
    expect(wrapper.get('.buff-soul-orb-full').text()).toContain('滿魂 +31攻 (以基準武器換算)')

    buffs.setCombatCorrection('genesis', false)
    await nextTick()
    expect(character.combatSoulOrbWeaponAtk).toBe(276)
    expect(wrapper.get('.buff-soul-orb-full').text()).toContain('滿魂 +27攻 (以基準武器換算)')
    wrapper.unmount()
  })
})

describe('含 Buff 戰鬥力校正控制', () => {
  it('依一般、海外非創世、海外創世動態顯示 1/2/3 項', async () => {
    const character = useCharacterStore()
    const wrapper = mount(CombatCorrectionControls)

    const inlineLabels = () =>
      wrapper.findAll('.buff-correction-chip-label').map((item) => item.text())
    expect(inlineLabels()).toEqual(['師徒系統校正'])
    expect(wrapper.get('.buff-correction-chip').attributes('title')).toBeUndefined()

    character.selectJobByName('墨玄')
    character.setField('weaponSet', 'arcane')
    await nextTick()
    expect(inlineLabels()).toEqual(['師徒系統校正', '女皇祝福校正'])

    character.setField('weaponSet', 'genesis')
    await nextTick()
    expect(inlineLabels()).toEqual(['師徒系統校正', '女皇祝福校正', '創世武器校正'])
    expect(
      wrapper
        .findAll('.buff-correction-inline .buff-correction-tooltip')
        .map((item) => item.text()),
    ).toEqual([
      '師徒能力計入含Buff戰鬥力(原始戰鬥力未計入)',
      '女皇祝福計入含Buff戰鬥力(海外職業原始戰鬥力未計入)',
      '武器攻擊校正基準更正為與原廠職業相同',
    ])
    expect(wrapper.get('.buff-correction-compact-trigger').text()).toBe('校正 3/3')
    wrapper.unmount()
  })

  it('校正說明以自訂 Tooltip 支援滑鼠與鍵盤焦點', async () => {
    const wrapper = mount(CombatCorrectionControls, { attachTo: document.body })
    const chip = wrapper.get('.buff-correction-chip')
    const tooltip = wrapper.get('.buff-correction-tooltip')

    expect(tooltip.isVisible()).toBe(false)
    expect(chip.attributes('aria-describedby')).toBe(tooltip.attributes('id'))
    await chip.trigger('mouseenter')
    await flushPromises()
    expect(tooltip.isVisible()).toBe(true)
    expect(tooltip.classes()).toContain('buff-name-tooltip--above')
    expect(tooltip.text()).toBe('師徒能力計入含Buff戰鬥力(原始戰鬥力未計入)')

    await chip.trigger('mouseleave')
    expect(tooltip.isVisible()).toBe(false)
    await chip.trigger('focus')
    await flushPromises()
    expect(tooltip.isVisible()).toBe(true)
    await chip.trigger('blur')
    expect(tooltip.isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('依標題列實際寬度及一／二／三個適用項目自動收合', async () => {
    const layout = installCorrectionLayout(500)
    const character = useCharacterStore()
    const wrapper = mount(BuffPanel, { props: { mode: 'combat' } })
    await flushPromises()

    const controls = wrapper.get('.buff-correction-controls')
    expect(controls.attributes('data-option-count')).toBe('1')
    expect(controls.classes()).not.toContain('is-compact')

    character.selectJobByName('墨玄')
    character.setField('weaponSet', 'arcane')
    await flushPromises()
    expect(controls.attributes('data-option-count')).toBe('2')
    expect(controls.classes()).toContain('is-compact')

    layout.setHeaderWidth(590)
    layout.notifyResize()
    await nextTick()
    expect(controls.classes()).not.toContain('is-compact')

    character.setField('weaponSet', 'genesis')
    await flushPromises()
    expect(controls.attributes('data-option-count')).toBe('3')
    expect(controls.classes()).toContain('is-compact')

    layout.setHeaderWidth(680)
    layout.notifyResize()
    await nextTick()
    expect(controls.classes()).not.toContain('is-compact')
    wrapper.unmount()
  })

  it('窄版浮層可勾選，並支援外部點擊與 Esc 關閉', async () => {
    const layout = installCorrectionLayout(500)
    const character = useCharacterStore()
    character.selectJobByName('墨玄')
    character.setField('weaponSet', 'genesis')
    const buffs = useBuffsStore()
    const wrapper = mount(BuffPanel, { props: { mode: 'combat' }, attachTo: document.body })
    await flushPromises()
    const controls = wrapper.get('.buff-correction-controls')
    const trigger = wrapper.get('.buff-correction-compact-trigger')

    expect(controls.classes()).toContain('is-compact')
    await trigger.trigger('click')
    expect(wrapper.get('.buff-correction-popover').isVisible()).toBe(true)
    const checkboxes = wrapper.findAll('.buff-correction-checkbox')
    expect(checkboxes).toHaveLength(3)
    expect(wrapper.findAll('.buff-correction-option-label').map((item) => item.text())).toEqual([
      '師徒系統校正',
      '女皇祝福校正',
      '創世武器校正',
    ])
    const compactOption = wrapper.get('.buff-correction-option')
    await compactOption.trigger('mouseenter')
    await flushPromises()
    expect(compactOption.get('.buff-correction-tooltip').isVisible()).toBe(true)
    expect(compactOption.get('.buff-correction-tooltip').classes()).toContain(
      'buff-name-tooltip--above',
    )
    expect(compactOption.get('.buff-correction-tooltip').text()).toBe(
      '師徒能力計入含Buff戰鬥力(原始戰鬥力未計入)',
    )
    await compactOption.trigger('mouseleave')
    expect(compactOption.get('.buff-correction-tooltip').isVisible()).toBe(false)
    await checkboxes[2].setValue(false)
    expect(buffs.combatCorrections.genesis).toBe(false)
    expect(trigger.text()).toBe('校正 2/3')
    expect(controls.classes()).toContain('is-compact')
    await checkboxes[1].setValue(false)
    expect(trigger.text()).toBe('校正 1/3')
    expect(controls.classes()).toContain('is-compact')

    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(wrapper.get('.buff-correction-popover').isVisible()).toBe(false)

    await trigger.trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(wrapper.get('.buff-correction-popover').isVisible()).toBe(false)

    await trigger.trigger('click')
    layout.setHeaderWidth(680)
    layout.notifyResize()
    await nextTick()
    expect(controls.classes()).not.toContain('is-compact')
    expect(wrapper.get('.buff-correction-popover').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('適用項目改變時即使仍維持收合也會關閉浮層', async () => {
    installCorrectionLayout(430)
    const character = useCharacterStore()
    character.selectJobByName('墨玄')
    character.setField('weaponSet', 'genesis')
    const wrapper = mount(BuffPanel, { props: { mode: 'combat' } })
    await flushPromises()

    const controls = wrapper.get('.buff-correction-controls')
    const trigger = wrapper.get('.buff-correction-compact-trigger')
    expect(controls.classes()).toContain('is-compact')
    await trigger.trigger('click')
    expect(wrapper.get('.buff-correction-popover').isVisible()).toBe(true)

    character.setField('weaponSet', 'arcane')
    await flushPromises()
    await nextTick()
    expect(controls.attributes('data-option-count')).toBe('2')
    expect(controls.classes()).toContain('is-compact')
    const correctionComponent = wrapper.getComponent(CombatCorrectionControls)
    const popover = wrapper.get('.buff-correction-popover')
    expect({
      expanded: trigger.attributes('aria-expanded'),
      compactOpen: (correctionComponent.vm as unknown as { compactOpen: boolean }).compactOpen,
      popoverStyle: popover.attributes('style'),
    }).toEqual({
      expanded: 'false',
      compactOpen: false,
      popoverStyle: 'display: none;',
    })
    wrapper.unmount()
  })

  it('只在戰鬥力頁改標題並顯示校正，Buff 數量不含滿魂與校正', () => {
    const combat = mount(BuffPanel, { props: { mode: 'combat' } })
    const count = combat.get('.buff-head-count').text()
    expect(combat.get('.buff-head-title').text()).toBe('選擇Buff/校正項')
    expect(combat.find('.buff-correction-controls').exists()).toBe(true)
    expect(count).toMatch(/^Buff \d+$/)
    expect(count).not.toContain('校正')
    combat.unmount()

    const eff = mount(BuffPanel, { props: { mode: 'eff' } })
    expect(eff.get('.buff-head-title').text()).toBe('選擇Buff')
    expect(eff.find('.buff-correction-controls').exists()).toBe(false)
    eff.unmount()
  })
})

describe('Buff 浮動窗關閉控制', () => {
  it('使用固定 SVG 交叉線，並保留點擊與 Esc 關閉行為', async () => {
    const ui = useUiStore()
    ui.buffDrawerOpen = true
    const wrapper = mount(BuffOverlay, {
      props: { panelId: 'buff-overlay-test' },
      attachTo: document.body,
    })
    await nextTick()

    const closeButton = document.body.querySelector<HTMLButtonElement>('.buff-overlay-close')
    expect(closeButton).not.toBeNull()
    expect(closeButton?.getAttribute('aria-label')).toBe('關閉選擇 Buff')
    expect(closeButton?.textContent?.trim()).toBe('')
    const icon = closeButton?.querySelector('svg.buff-overlay-close-icon')
    expect(icon?.getAttribute('viewBox')).toBe('0 0 12 12')
    expect(
      Array.from(icon?.querySelectorAll('line') ?? []).map((line) => [
        line.getAttribute('x1'),
        line.getAttribute('y1'),
        line.getAttribute('x2'),
        line.getAttribute('y2'),
      ]),
    ).toEqual([
      ['2', '2', '10', '10'],
      ['10', '2', '2', '10'],
    ])
    expect(document.activeElement).toBe(closeButton)

    closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()
    expect(ui.buffDrawerOpen).toBe(false)

    ui.buffDrawerOpen = true
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(ui.buffDrawerOpen).toBe(false)
    wrapper.unmount()
  })
})
