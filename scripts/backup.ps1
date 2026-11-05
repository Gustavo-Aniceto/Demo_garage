# =====================================================================
# Backup completo (banco + fotos) para agendar no Windows.
# Agendador de Tarefas -> Criar Tarefa Básica -> Diariamente 19:00 ->
#   Programa: powershell.exe
#   Argumentos: -ExecutionPolicy Bypass -File "C:\caminho\oficina\scripts\backup.ps1"
#
# Antes, crie um arquivo FORA do projeto (ex.: C:\oficina-segredos.ps1) com:
#   $env:SUPABASE_URL = "https://SEU-PROJETO.supabase.co"
#   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
#   $env:SUPABASE_DB_URL = "postgresql://postgres.SEU-PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"
# e proteja-o (Propriedades -> Segurança -> só o seu usuário).
# =====================================================================
$ErrorActionPreference = "Stop"
. "C:\oficina-segredos.ps1"
Set-Location (Split-Path $PSScriptRoot -Parent)
$dia = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force -Path "backups\banco" | Out-Null

npx supabase db dump --db-url $env:SUPABASE_DB_URL -f "backups\banco\$dia-estrutura.sql"
npx supabase db dump --db-url $env:SUPABASE_DB_URL --data-only -f "backups\banco\$dia-dados.sql"
node scripts/backup-fotos.mjs

# Mantém 30 dias de dumps do banco (fotos ficam todas)
Get-ChildItem "backups\banco\*.sql" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
Write-Output "Backup de $dia concluído."
