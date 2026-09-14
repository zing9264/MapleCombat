// 洩漏閘門。這是最後一道防線，壞掉的話沒有人會發現 —— 所以它自己要有測試。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  listFiles,
  scanFiles,
  secretsFrom,
  unexpectedEntries,
} from '../../../tools/building/verifyPackage.mjs'

let dir = ''

function sandbox(): string {
  dir = mkdtempSync(join(tmpdir(), 'mb-verify-'))
  return dir
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

describe('secretsFrom', () => {
  it('抓得到 API 金鑰', () => {
    const secrets = secretsFrom({ keys: { mbNexonApiKey: 'test_0179188f0f001d86' } })
    expect(secrets).toEqual([{ value: 'test_0179188f0f001d86', label: 'mbNexonApiKey' }])
  })

  it('從巢狀 JSON 裡挖出角色名、世界名、公會名', () => {
    const secrets = secretsFrom({
      keys: {
        mbEquipmentSetsV1: JSON.stringify([
          {
            name: '裝備1',
            characterName: '藜樂拌楓糖',
            worldName: '優依娜',
            guildName: '燃燒之戒',
          },
        ]),
      },
    })
    expect(secrets.map((s) => s.value)).toEqual(['藜樂拌楓糖', '優依娜', '燃燒之戒'])
  })

  // 三個字的中文名是最該擋的，門檻設高等於把它放掉
  it('三個字的中文名要算在內', () => {
    const secrets = secretsFrom({
      keys: { a: JSON.stringify({ characterName: '優依娜' }) },
    })
    expect(secrets).toHaveLength(1)
  })

  it('壞掉的 JSON 不會讓整個掃描炸掉', () => {
    expect(secretsFrom({ keys: { broken: '{不是 JSON', ok: '"字串"' } })).toEqual([])
  })

  it('沒有快照時回空陣列', () => {
    expect(secretsFrom(undefined)).toEqual([])
    expect(secretsFrom({})).toEqual([])
  })
})

describe('scanFiles', () => {
  it('文字檔裡命中就回報', () => {
    const root = sandbox()
    writeFileSync(join(root, 'data.json'), '{"key":"test_0179188f"}')
    const hits = scanFiles(listFiles(root), [{ value: 'test_0179188f', label: 'mbNexonApiKey' }])
    expect(hits).toHaveLength(1)
    expect(hits[0].label).toBe('mbNexonApiKey')
  })

  // 二進位檔也要掃：資料有可能是被編進 exe 而不是躺在旁邊的檔案裡
  it('二進位檔裡的 UTF-8 位元組也掃得到', () => {
    const root = sandbox()
    writeFileSync(
      join(root, 'app.exe'),
      Buffer.concat([
        Buffer.from([0x4d, 0x5a, 0x00, 0x00]),
        Buffer.from('藜樂拌楓糖', 'utf8'),
        Buffer.from([0x00, 0xff]),
      ]),
    )
    const hits = scanFiles(listFiles(root), [{ value: '藜樂拌楓糖', label: 'characterName' }])
    expect(hits).toHaveLength(1)
  })

  it('乾淨的檔案回空陣列', () => {
    const root = sandbox()
    writeFileSync(join(root, 'readme.txt'), 'MapleBuilding v1.0')
    expect(scanFiles(listFiles(root), [{ value: '藜樂拌楓糖', label: 'characterName' }])).toEqual(
      [],
    )
  })
})

describe('unexpectedEntries', () => {
  it('只放行 exe 與讀我.txt', () => {
    const root = sandbox()
    writeFileSync(join(root, 'MapleBuilding.exe'), '')
    writeFileSync(join(root, '讀我.txt'), '')
    expect(unexpectedEntries(root)).toEqual([])
  })

  it('多出來的檔案要被點名 —— 上次就是多一個 mapledata.json', () => {
    const root = sandbox()
    writeFileSync(join(root, 'MapleBuilding.exe'), '')
    writeFileSync(join(root, 'mapledata.json'), '')
    expect(unexpectedEntries(root)).toEqual(['mapledata.json'])
  })
})
