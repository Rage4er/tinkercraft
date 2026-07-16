// ============================================================
// Generate PWA icons from SVG
// ============================================================

import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SVG_PATH = join(import.meta.dirname, '..', 'public', 'icon.svg')
const OUTPUT_DIR = join(import.meta.dirname, '..', 'public')

const SIZES = [
  { width: 192, filename: 'icon-192.png' },
  { width: 512, filename: 'icon-512.png' },
]

async function generateIcon(width, filename) {
  const outputPath = join(OUTPUT_DIR, filename)
  const svgBuffer = await readFile(SVG_PATH)
  
  await sharp(svgBuffer)
    .resize(width, width, {
      fit: 'contain',
      background: { r: 30, g: 30, b: 46, alpha: 1 },
    })
    .png()
    .toFile(outputPath)
  
  console.log(`✅ ${filename} (${width}×${width})`)
}

async function main() {
  console.log('🎨 Generating PWA icons from icon.svg...')
  
  for (const { width, filename } of SIZES) {
    await generateIcon(width, filename)
  }
  
  console.log('✨ Icons generated successfully!')
}

main().catch(err => {
  console.error('❌ Failed:', err)
  process.exit(1)
})
