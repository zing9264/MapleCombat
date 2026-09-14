// 發布用的建置：從乾淨的 clone 建，不從工作樹建。
//
// 為什麼要這樣：工作樹裡有 .autosave.json（開發用的 localStorage 備份，
// 含 API 金鑰、角色名、世界名、公會名、五組裝備）。它是 gitignore 的，
// 但檔案就躺在那裡 —— 打包腳本、建置流程、任何一個 glob 都碰得到。
// 實際發生過：手工打包把它塞進 zip 寄出去三次。
//
// 靠「記得不要複製它」是靠不住的。改成從 clone 建，那個檔案根本不存在，
// 想帶都帶不了 —— 由結構保證，不是由紀律保證。
//
// 為什麼不是 Docker：這是 Windows 桌面程式，要 MSVC + Windows SDK + WebView2。
// Windows 容器光映像檔就十幾 GB，而且建完還是得在真的 Windows 上驗證。
// 我們要隔離的是「工作樹裡的個資檔」，clone 就完整達成了，成本差兩個數量級。
//
// 用法：
//   npm run build:release
//   npm run build:release -- --out D:\somewhere --cold

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const repo = resolve(process.cwd())

function arg(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const has = (name) => process.argv.includes(name)

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: 'inherit', shell: true, ...options })
}

function git(args, options = {}) {
  return execFileSync('git', args, { encoding: 'utf8', ...options }).trim()
}

function main() {
  const outDir = resolve(arg('--out', join(repo, 'dist-portable')))

  const dirty = git(['status', '--porcelain'])
  if (dirty && !has('--allow-dirty')) {
    console.error('✗ 工作樹有未提交的改動，clone 建出來的不會包含它們：\n')
    console.error(dirty)
    console.error('\n先提交，或加 --allow-dirty 明確表示你知道會建到 HEAD 的版本。')
    process.exit(1)
  }

  const head = git(['rev-parse', 'HEAD'])
  const work = mkdtempSync(join(tmpdir(), 'maplebuilding-build-'))
  const clone = join(work, 'repo')

  // 共用 cargo 的編譯快取：裡面只有 crates.io 相依與追蹤中的原始碼編出來的東西，
  // 沒有任何個資路徑，所以不影響我們要的保證，卻把冷建置從十幾分鐘縮到兩分鐘。
  // 要完全從零建就加 --cold。
  const env = { ...process.env }
  if (!has('--cold')) env.CARGO_TARGET_DIR = join(repo, 'src-tauri', 'target')

  try {
    console.log(`\n── clone ${head.slice(0, 8)} → ${clone}`)
    run('git', ['clone', '--no-hardlinks', '--quiet', repo, clone])
    run('git', ['-C', clone, 'checkout', '--quiet', head])

    // clone 出來只有版控裡的檔案。這行是斷言，不是保險。
    const leaked = ['tools/building/.autosave.json', 'tools/building/.crawl-cache.jsonl']
    for (const path of leaked) {
      if (existsSync(join(clone, path))) {
        throw new Error(`clone 裡不該有 ${path} —— 它被加進版控了？`)
      }
    }

    console.log('\n── npm ci')
    run('npm', ['ci'], { cwd: clone })

    console.log('\n── tauri build')
    run('npm', ['run', 'tauri', 'build'], { cwd: clone, env })

    console.log('\n── 打包')
    run('node', ['tools/building/packPortable.mjs', '--out', outDir], { cwd: clone })

    // 閘門刻意在主工作樹跑：比對用的個資快照只有這裡才有。
    console.log('\n── 洩漏閘門')
    const version = JSON.parse(
      execFileSync('node', ['-p', "JSON.stringify(require('./package.json').version)"], {
        cwd: repo,
        encoding: 'utf8',
      }),
    )
    run('node', [
      'tools/building/verifyPackage.mjs',
      join(outDir, `MapleBuilding-${version}-portable`),
      'tools/building/.autosave.json',
    ])

    console.log(`\n完成：${outDir}`)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main()
