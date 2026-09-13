<script setup lang="ts">
// 萌獸（萌獸）：逐條記錄每一隻提供的詞條。
//
// 為什麼獨立成一個分頁而不是掛在製作台裡：
//   製作台的流程是「挑底 → 疊卷軸／星力／潛能／追加」，萌獸沒有基底可挑，
//   詞條是直接給的，塞在那條流程尾巴上只會讓兩邊都難找。
//   它也不隸屬於某一個裝備組 —— 換裝備組時萌獸不會跟著變。
//
// 終傷是**乘算**且遊戲以 float32 累加器逐條相加（見 src/core/familiar.ts），
// 所以一定要逐條存；魔力%／物攻% 則是加算，進公式的 percentAtk。

import { FAMILIAR_PRESETS, useFamiliarStore } from '../stores/familiar'

const familiar = useFamiliarStore()

function onLabel(id: string, event: Event): void {
  familiar.update(id, { label: (event.target as HTMLInputElement).value })
}

function num(event: Event): number {
  return Number((event.target as HTMLInputElement).value) || 0
}

// 三個欄位各寫一個 handler 而不是用計算屬性名：型別才守得住，
// 打錯欄位名會在編譯期就被抓到。
function onFinal(id: string, event: Event): void {
  familiar.update(id, { finalDamage: num(event) })
}

function onMagic(id: string, event: Event): void {
  familiar.update(id, { magicPowerPercent: num(event) })
}

function onAttack(id: string, event: Event): void {
  familiar.update(id, { attackPowerPercent: num(event) })
}
</script>

<template>
  <div class="mb-fam-page">
    <section class="mb-card">
      <h3 class="mb-card-title">
        萌獸
        <span class="mb-badge">
          {{ familiar.lines.length }} 條 · 終傷 {{ familiar.totalPercent }}% ×{{
            familiar.multiplier.toFixed(4)
          }}
          <template v-if="familiar.magicPowerPercent">
            · 魔力 +{{ familiar.magicPowerPercent }}%
          </template>
          <template v-if="familiar.attackPowerPercent">
            · 物攻 +{{ familiar.attackPowerPercent }}%
          </template>
        </span>
        <button
          v-if="familiar.lines.length"
          type="button"
          class="mb-link"
          @click="familiar.clear()"
        >
          全部清除
        </button>
      </h3>

      <div v-if="familiar.lines.length" class="mb-fam-list">
        <div class="mb-fam mb-fam--head">
          <span>備註</span>
          <span>終傷%</span>
          <span>魔力%</span>
          <span>物攻%</span>
          <span></span>
        </div>
        <div v-for="line in familiar.lines" :key="line.id" class="mb-fam">
          <input
            class="mb-input"
            placeholder="可留空"
            :value="line.label"
            @input="onLabel(line.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="line.finalDamage"
            @input="onFinal(line.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="line.magicPowerPercent"
            @input="onMagic(line.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="line.attackPowerPercent"
            @input="onAttack(line.id, $event)"
          />
          <button class="mb-btn mb-btn--sm" @click="familiar.remove(line.id)">移除</button>
        </div>
      </div>

      <p v-else class="mb-hint">還沒有任何萌獸詞條。用下面的按鈕加一條。</p>

      <div class="mb-row mb-fam-add">
        <button
          v-for="preset in FAMILIAR_PRESETS"
          :key="preset.label"
          class="mb-btn"
          @click="familiar.add({ finalDamage: preset.value, label: preset.label })"
        >
          ＋{{ preset.label }} {{ preset.value }}%
        </button>
        <button class="mb-btn" @click="familiar.add({})">＋自訂</button>
      </div>

      <p v-if="familiar.lastError" class="mb-hint">{{ familiar.lastError }}</p>
      <p class="mb-hint">
        <b>終傷是乘算</b>，而且遊戲以 float32 累加器逐條相加 ——
        務必逐條填，先加總再換算會有精度差。主萌獸每條 20%（超貴 25%），羈絆每條 2%、最多 4 條，20%
        與 25% 互斥。<b>魔力%／物攻% 則是加算</b>，直接相加即可。名稱只是備註，不影響計算。
      </p>
      <p class="mb-hint">
        萌獸不隨裝備組切換 —— 這裡填的是「目前開著的萌獸」，五組裝備共用同一份。
      </p>
    </section>
  </div>
</template>

<style scoped>
.mb-fam-page {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 24px;
}

.mb-fam-list {
  margin: 0 0 6px;
}

/* 欄位多，用格線對齊；標題列與資料列共用同一組欄寬 */
.mb-fam {
  display: grid;
  grid-template-columns: 1fr 62px 62px 62px auto;
  align-items: center;
  gap: 4px 6px;
  padding: 2px 0;
}

.mb-fam--head {
  padding-bottom: 2px;
  font-size: 10px;
  opacity: 0.55;
}

.mb-fam--head span:not(:first-child) {
  text-align: right;
}

.mb-fam-value {
  text-align: right;
}

.mb-fam-add {
  flex-wrap: wrap;
  gap: 4px;
}
</style>
