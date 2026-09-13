import { mkdir, copyFile } from 'node:fs/promises'
await mkdir('dist/server',{recursive:true})
await copyFile('hosting/worker.mjs','dist/server/index.js')
await copyFile('THIRD_PARTY_NOTICES.md','dist/client/THIRD_PARTY_NOTICES.txt')
