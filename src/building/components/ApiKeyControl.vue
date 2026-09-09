<script setup lang="ts">
// 放在「管理」下拉選單裡的 API Key 設定欄。
import { ref } from 'vue'
import { useApiKeyStore } from '../stores/apiKey'

const apiKey = useApiKeyStore()
const input = ref('')

function onSave(): void {
  apiKey.set(input.value)
  input.value = ''
}
</script>

<template>
  <div class="mb-apikey" @click.stop>
    <div class="mb-apikey-title">NEXON API Key</div>
    <div v-if="apiKey.hasKey" class="mb-apikey-row">
      <span class="mb-apikey-mask">{{ apiKey.masked }}</span>
      <button type="button" class="mb-apikey-btn" @click="apiKey.clear()">清除</button>
    </div>
    <div v-else class="mb-apikey-row">
      <input
        v-model="input"
        type="password"
        class="mb-apikey-input"
        placeholder="貼上 API Key"
        autocomplete="off"
        @keyup.enter="onSave"
      />
      <button type="button" class="mb-apikey-btn" :disabled="!input.trim()" @click="onSave">
        儲存
      </button>
    </div>
    <div v-if="!apiKey.hasKey" class="mb-apikey-hint">
      openapi.nexon.com → My Applications → 註冊應用程式 → MapleStory (TW)
    </div>
  </div>
</template>

<style scoped>
.mb-apikey {
  padding: 6px 8px 4px;
  margin-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.mb-apikey-title {
  margin-bottom: 4px;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.8;
}

.mb-apikey-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mb-apikey-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  padding: 0 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  color: inherit;
  font-size: 11px;
}

.mb-apikey-mask {
  flex: 1;
  overflow: hidden;
  font-family: ui-monospace, monospace;
  font-size: 10px;
  opacity: 0.75;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-apikey-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}

.mb-apikey-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.mb-apikey-hint {
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.4;
  opacity: 0.55;
}
</style>
