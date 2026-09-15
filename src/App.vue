<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import CompactToolbar from '@/components/layout/CompactToolbar.vue'
import CharacterInputView from '@/components/character/CharacterInputView.vue'
import EquipmentChangeView from '@/components/equipment/EquipmentChangeView.vue'
import ValueConversionView from '@/components/conversion/ValueConversionView.vue'
import WeightedAnalysisView from '@/components/weighted/WeightedAnalysisView.vue'
import EquipmentSetView from '@/building/views/EquipmentSetView.vue'
import GearCompareView from '@/building/views/GearCompareView.vue'
import ItemLibraryView from '@/building/views/ItemLibraryView.vue'
import WorkbenchView from '@/building/views/WorkbenchView.vue'
import FamiliarView from '@/building/views/FamiliarView.vue'
import InventoryView from '@/building/views/InventoryView.vue'
import CharacterView from '@/building/views/CharacterView.vue'
import OverviewView from '@/building/views/OverviewView.vue'
import CraftView from '@/building/views/CraftView.vue'
import { SHOW_STATE_SLOTS } from '@/building/featureFlags'
import { useStateSlotsStore } from '@/stores/stateSlots'

const ui = useUiStore()
const slots = useStateSlotsStore()
</script>

<template>
  <CompactToolbar />
  <div class="container" :data-view="ui.activeView">
    <WeightedAnalysisView v-if="SHOW_STATE_SLOTS && slots.isWeightedActive" :view="ui.activeView" />
    <template v-else>
      <OverviewView v-if="ui.activeView === 'overview'" />
      <CraftView v-else-if="ui.activeView === 'craft'" />
      <CharacterView v-else-if="ui.activeView === 'character'" />
      <CharacterInputView v-show="ui.activeView === 'characterInput'" />
      <EquipmentChangeView v-show="ui.activeView === 'equipmentChange'" />
      <ValueConversionView v-show="ui.activeView === 'valueConversion'" />
      <GearCompareView v-if="ui.activeView === 'gearCompare'" />
      <EquipmentSetView v-if="ui.activeView === 'equipmentSets'" />
      <ItemLibraryView v-if="ui.activeView === 'itemLibrary'" />
      <WorkbenchView v-if="ui.activeView === 'workbench'" />
      <FamiliarView v-if="ui.activeView === 'familiar'" />
      <InventoryView v-if="ui.activeView === 'inventory'" />
    </template>
  </div>
</template>
