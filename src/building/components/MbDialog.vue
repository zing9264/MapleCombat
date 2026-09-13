<script setup lang="ts">
// 對話框的畫面部分；狀態與 Promise 都在 useDialog() 裡。
//
// 用 Teleport 掛到 body：對話框若留在原本的 DOM 位置，會被祖先的
// overflow / transform 裁切，也搶不到正確的堆疊順序。
import { nextTick, ref, watch } from 'vue'
import type { DialogController } from '../composables/useDialog'

const props = defineProps<{ controller: DialogController }>()

const inputEl = ref<HTMLInputElement | null>(null)

// 背景點擊要「按下與放開都在背景」才算取消，否則從輸入框往外拖曳選取文字
// 放開時會誤關對話框，剛打的字就沒了。
const pressedOnBackdrop = ref(false)

watch(
  () => props.controller.state.value,
  async (state) => {
    if (state?.kind !== 'prompt') return
    await nextTick()
    inputEl.value?.focus()
    inputEl.value?.select()
  },
)

function onBackdropMouseDown(event: MouseEvent): void {
  pressedOnBackdrop.value = event.target === event.currentTarget
}

function onBackdropClick(event: MouseEvent): void {
  if (pressedOnBackdrop.value && event.target === event.currentTarget) {
    props.controller.cancel()
  }
  pressedOnBackdrop.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="controller.state.value"
      class="mb-dlg-backdrop"
      @mousedown="onBackdropMouseDown"
      @click="onBackdropClick"
      @keydown.esc="controller.cancel()"
    >
      <div class="mb-dlg" role="dialog" aria-modal="true" @click.stop>
        <div class="mb-dlg-head">
          <strong>{{ controller.state.value.title }}</strong>
          <button type="button" class="mb-dlg-close" aria-label="關閉" @click="controller.cancel()">
            ×
          </button>
        </div>

        <p v-for="(line, i) in controller.state.value.lines" :key="i" class="mb-dlg-line">
          {{ line }}
        </p>

        <input
          v-if="controller.state.value.kind === 'prompt'"
          ref="inputEl"
          v-model="controller.input.value"
          class="mb-dlg-input"
          type="text"
          :placeholder="controller.state.value.placeholder"
          :maxlength="controller.state.value.maxLength || undefined"
          @keydown.enter.prevent="controller.ok()"
          @keydown.esc.prevent="controller.cancel()"
        />

        <div class="mb-dlg-actions">
          <button type="button" class="mb-dlg-btn" @click="controller.cancel()">
            {{ controller.state.value.cancelLabel }}
          </button>
          <button
            type="button"
            class="mb-dlg-btn mb-dlg-btn--primary"
            :class="{ danger: controller.state.value.danger }"
            @click="controller.ok()"
          >
            {{ controller.state.value.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mb-dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.5);
}

.mb-dlg {
  width: 100%;
  max-width: 360px;
  padding: 14px 16px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.16));
  border-radius: 10px;
  background: var(--surface-1, #1e1e28);
  color: inherit;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.mb-dlg-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}

.mb-dlg-head strong {
  flex: 1;
  min-width: 0;
}

.mb-dlg-close {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
}

.mb-dlg-close:hover {
  background: rgba(255, 255, 255, 0.1);
  opacity: 1;
}

.mb-dlg-line {
  margin: 0 0 5px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.8;
}

.mb-dlg-input {
  width: 100%;
  height: 30px;
  margin-top: 8px;
  padding: 0 8px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.2));
  border-radius: 6px;
  background: var(--surface-0, rgba(0, 0, 0, 0.2));
  color: inherit;
  font-size: 12px;
}

.mb-dlg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 14px;
}

.mb-dlg-btn {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--outline, rgba(255, 255, 255, 0.2));
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.mb-dlg-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.mb-dlg-btn--primary {
  border-color: transparent;
  background: var(--accent, #6c8cff);
  color: #fff;
}

.mb-dlg-btn--primary.danger {
  background: #d9534f;
}
</style>
