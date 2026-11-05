# Teste do backup das fotos (sem tocar no Supabase real)

1. `node scripts/teste-backup/mock-storage.mjs` (servidor que imita o Storage, com 1.109 arquivos)
2. Em outro terminal: `SUPABASE_URL=http://127.0.0.1:54999 SUPABASE_SERVICE_ROLE_KEY=service-key BACKUP_DIR=./backup-teste node scripts/backup-fotos.mjs`
3. Rode de novo: deve baixar 0 (incremental). Para simular falha: `FAIL_ONE=1 node scripts/teste-backup/mock-storage.mjs`.
