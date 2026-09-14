<script setup lang="ts">
// 萌獸：一隻一隻建立，可以裝備或卸下。
//
// 為什麼獨立成一個分頁而不是掛在製作台裡：
//   製作台的流程是「挑底 → 疊卷軸／星力／潛能／追加」，萌獸沒有基底可挑，
//   詞條是直接給的，塞在那條流程尾巴上只會讓兩邊都難找。
//
// 為什麼卸下而不是刪掉：留著才比較得出「換這隻會差多少」。
// 實際的替換在「裝備變更」頁做，這裡只負責建檔與編輯。

import { computed } from 'vue'
import { FAMILIAR_PRESETS, useFamiliarStore, type Familiar } from '../stores/familiar'

const familiar = useFamiliarStore()

const owned = computed(() => familiar.lines)

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

function toggleEquipped(item: Familiar): void {
  familiar.update(item.id, { equipped: !item.equipped })
}
</script>

<template>
  <div class="mb-fam-page">
    <section class="mb-card">
      <h3 class="mb-card-title">
        萌獸
        <span class="mb-badge">
          裝備中 {{ familiar.equipped.length }} / {{ owned.length }} 隻 · 終傷
          {{ familiar.totalPercent }}% ×{{ familiar.multiplier.toFixed(4) }}
          <template v-if="familiar.magicPowerPercent">
            · 魔力 +{{ familiar.magicPowerPercent }}%
          </template>
          <template v-if="familiar.attackPowerPercent">
            · 物攻 +{{ familiar.attackPowerPercent }}%
          </template>
        </span>
        <button v-if="owned.length" type="button" class="mb-link" @click="familiar.clear()">
          全部刪除
        </button>
      </h3>

      <div v-if="owned.length" class="mb-fam-list">
        <div class="mb-fam mb-fam--head">
          <span>裝備</span>
          <span>名稱</span>
          <span>終傷%</span>
          <span>魔力%</span>
          <span>物攻%</span>
          <span></span>
        </div>
        <div v-for="item in owned" :key="item.id" class="mb-fam" :class="{ off: !item.equipped }">
          <label class="mb-fam-equip">
            <input type="checkbox" :checked="item.equipped" @change="toggleEquipped(item)" />
          </label>
          <input
            class="mb-input"
            placeholder="可留空"
            :value="item.label"
            @input="onLabel(item.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="item.finalDamage"
            @input="onFinal(item.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="item.magicPowerPercent"
            @input="onMagic(item.id, $event)"
          />
          <input
            class="mb-input mb-fam-value"
            type="number"
            :value="item.attackPowerPercent"
            @input="onAttack(item.id, $event)"
          />
          <button class="mb-btn mb-btn--sm" @click="familiar.remove(item.id)">刪除</button>
        </div>
      </div>

      <p v-else class="mb-hint">還沒有任何萌獸。用下面的按鈕加一隻。</p>

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

      <p v-if="familiar.lastError" class="mb-error">{{ familiar.lastError }}</p>
      <p class="mb-hint">
        <b>終傷是乘算</b>，而且遊戲以 float32 累加器逐條相加 ——
        一隻一列、照遊戲畫面抄，不要自己先加總。 主萌獸每條 20%（超貴 25%），羈絆每條 2%、最多 4
        條，20% 與 25% 互斥。<b>魔力% / 物攻% 則是加算</b>，直接相加即可。名稱只是備註，不影響計算。
      </p>
      <p class="mb-hint">
        取消勾選是<b>卸下</b>而不是刪除 —— 留著才比較得出換裝差值。 實際要比較「換這隻會差多少」，
        到「裝備變更」點萌獸那一格。
      </p>
      <p class="mb-hint">萌獸不隨裝備組切換，五組裝備共用同一批。</p>
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
  grid-template-columns: 36px 1fr 72px 72px 72px auto;
  align-items: center;
  gap: 4px 6px;
  padding: 2px 0;
}

.mb-fam--head {
  padding-bottom: 2px;
  font-size: 10px;
  opacity: 0.55;
}

.mb-fam--head span:not(:nth-child(2)) {
  text-align: center;
}

/* 卸下的仍然看得到，但要一眼分得出沒在生效 */
.mb-fam.off {
  opacity: 0.45;
}

.mb-fam-equip {
  display: flex;
  justify-content: center;
}

.mb-fam-value {
  text-align: right;
}

.mb-fam-add {
  flex-wrap: wrap;
  gap: 4px;
}
</style>
