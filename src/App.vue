<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import CompactToolbar from '@/components/layout/CompactToolbar.vue'
import CharacterInputView from '@/components/character/CharacterInputView.vue'
import EquipmentChangeView from '@/components/equipment/EquipmentChangeView.vue'
import ValueConversionView from '@/components/conversion/ValueConversionView.vue'
import WeightedAnalysisView from '@/components/weighted/WeightedAnalysisView.vue'
import EquipmentSetView from '@/building/views/EquipmentSetView.vue'
import ItemLibraryView from '@/building/views/ItemLibraryView.vue'
import WorkbenchView from '@/building/views/WorkbenchView.vue'
import InventoryView from '@/building/views/InventoryView.vue'
import { useStateSlotsStore } from '@/stores/stateSlots'

const ui = useUiStore()
const slots = useStateSlotsStore()
</script>

<template>
  <CompactToolbar />
  <div class="container">
    <WeightedAnalysisView v-if="slots.isWeightedActive" :view="ui.activeView" />
    <template v-else>
      <CharacterInputView v-show="ui.activeView === 'characterInput'" />
      <EquipmentChangeView v-show="ui.activeView === 'equipmentChange'" />
      <ValueConversionView v-show="ui.activeView === 'valueConversion'" />
      <EquipmentSetView v-if="ui.activeView === 'equipmentSets'" />
      <ItemLibraryView v-if="ui.activeView === 'itemLibrary'" />
      <WorkbenchView v-if="ui.activeView === 'workbench'" />
      <InventoryView v-if="ui.activeView === 'inventory'" />
    </template>
  </div>
</template>
