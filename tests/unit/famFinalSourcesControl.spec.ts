import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FamFinalSourcesControl from '@/components/character/shared/FamFinalSourcesControl.vue'
import EquipmentSidePanel from '@/components/equipment/EquipmentSidePanel.vue'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

describe('萌獸終傷逐條面板', () => {
  it('逐條列使用框內百分比樣式，移除按鈕顯示減號與來源名稱', async () => {
    const wrapper = mount(FamFinalSourcesControl, {
      props: { fieldId: 'famFinal' },
    })

    await wrapper.get('.fam-src-gear').trigger('click')

    expect(wrapper.find('.fam-src-unit').exists()).toBe(false)
    expect(wrapper.findAll('.fam-src-input')).toHaveLength(3)
    const removeButtons = wrapper.findAll('.fam-src-del')
    expect(removeButtons).toHaveLength(3)
    removeButtons.forEach((button, index) => {
      expect(button.text()).toBe('−')
      expect(button.attributes('title')).toBe(`移除來源 ${index + 1}`)
      expect(button.attributes('aria-label')).toBe(`移除來源 ${index + 1}`)
    })

    wrapper.unmount()
  })

  it('新增來源使下方空間不足時會重新判定並向上展開', async () => {
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })

    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('fam-src-wrap')) return rect(450, 500, 26, 22)
        if (this.classList.contains('fam-src-panel')) {
          const height = this.querySelectorAll('.fam-src-row').length >= 4 ? 220 : 180
          return rect(300, 522, 194, height)
        }
        return rect(0, 0, 0, 0)
      })

    const wrapper = mount(FamFinalSourcesControl, {
      props: { fieldId: 'famFinal' },
    })

    try {
      await wrapper.get('.fam-src-gear').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fam-src-panel').classes()).not.toContain('is-up')

      await wrapper.get('.fam-src-add').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fam-src-panel').classes()).toContain('is-up')

      await wrapper.get('.fam-src-del').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fam-src-panel').classes()).toContain('is-up')
    } finally {
      wrapper.unmount()
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('重算位置時維持相同的水平防裁切位移', async () => {
    const originalInnerWidth = window.innerWidth
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 300 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1000 })

    const rect = (left: number, top: number, width: number, height: number) =>
      ({
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height,
        toJSON: () => ({}),
      }) as DOMRect

    const rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('fam-src-wrap')) return rect(100, 100, 26, 22)
        if (this.classList.contains('fam-src-panel')) {
          const shift = Number(this.style.transform.match(/translateX\(([-\d.]+)px\)/)?.[1] ?? 0)
          return rect(-40 + shift, 122, 194, 180)
        }
        return rect(0, 0, 0, 0)
      })

    const wrapper = mount(FamFinalSourcesControl, {
      props: { fieldId: 'famFinal' },
    })

    try {
      await wrapper.get('.fam-src-gear').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fam-src-panel').attributes('style')).toContain('translateX(48px)')

      await wrapper.get('.fam-src-add').trigger('click')
      await flushPromises()
      expect(wrapper.get('.fam-src-panel').attributes('style')).toContain('translateX(48px)')
    } finally {
      wrapper.unmount()
      rectSpy.mockRestore()
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: originalInnerWidth,
      })
      Object.defineProperty(window, 'innerHeight', {
        configurable: true,
        value: originalInnerHeight,
      })
    }
  })

  it('裝備兩側欄位 DOM 順序皆為無視防禦率後接萌獸終傷', () => {
    for (const side of ['old', 'new'] as const) {
      const wrapper = mount(EquipmentSidePanel, { props: { side } })
      const labels = wrapper.findAll('.input-group > label').map((label) => label.text())
      expect(labels.indexOf('爆擊傷害')).toBeLessThan(labels.indexOf('無視防禦率'))
      expect(labels.indexOf('無視防禦率')).toBeLessThan(labels.indexOf('萌獸終傷'))
      wrapper.unmount()
    }
  })
})
