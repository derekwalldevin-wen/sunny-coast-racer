import { readFile, writeFile, copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(root, 'dist')
let html = await readFile(join(dist, 'index.html'), 'utf8')
const jsMatch = html.match(/<script type="module" crossorigin src="\.\/assets\/([^"]+\.js)"><\/script>/)
const cssMatch = html.match(/<link rel="stylesheet" crossorigin href="\.\/assets\/([^"]+\.css)">/)
if (!jsMatch || !cssMatch) throw new Error('Could not find Vite asset references in dist/index.html')
const js = await readFile(join(dist, 'assets', jsMatch[1]), 'utf8')
const css = await readFile(join(dist, 'assets', cssMatch[1]), 'utf8')
const safeJs = js.replace(/<\/script/gi, '<\\/script')
const safeCss = css.replace(/<\/style/gi, '<\\/style')
html = html.replace(jsMatch[0], () => `<script type="module">\n${safeJs}\n</script>`)
html = html.replace(cssMatch[0], () => `<style>\n${safeCss}\n</style>`)
const output = join(dist, 'sunny-coast-racer.html')
await writeFile(output, html, 'utf8')
await copyFile(output, join(root, 'sunny-coast-racer.html'))
console.log(`standalone=${output}`)
console.log(`bytes=${Buffer.byteLength(html, 'utf8')}`)
console.log(`external-assets=${/src="\.\/assets|href="\.\/assets/.test(html)}`)
