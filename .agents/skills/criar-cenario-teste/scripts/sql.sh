#!/usr/bin/env bash
# Único ponto de execução de SQL da skill criar-cenario-teste.
#
# Produção é inalcançável por desenho: o alvo é um NOME (local | dev), nunca
# uma URL livre, e o endereço de cada um é montado aqui. Qualquer conexão,
# variável ou arquivo SQL que mencione o ref de produção é recusado antes de
# abrir conexão.
#
# Uso:
#   sql.sh <local|dev> <arquivo.sql> [arquivo2.sql ...]
#   sql.sh <local|dev> -c "<sql>"
#
# Os helpers (references/helpers.sql) são carregados antes de tudo, e o
# conjunto roda numa transação única: um erro no meio desfaz o cenário inteiro.
#
# Alvo dev (projeto lingo-dev): exige a senha do banco no ambiente do shell,
# nunca em arquivo:
#   LINGO_DEV_DB_PASSWORD=...                     (obrigatória)
#   LINGO_DEV_DB_HOST / _PORT / _USER             (opcionais, p/ usar o pooler)
set -euo pipefail

readonly PROD_REF="uglvzvfgrnzoyfeotter"
readonly DEV_REF="jmswqnwghtlpxsvellar"
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly HELPERS="$SCRIPT_DIR/../references/helpers.sql"

recusar() { echo "RECUSADO: $*" >&2; exit 3; }
uso() { echo "uso: sql.sh <local|dev> <arquivo.sql>... | sql.sh <local|dev> -c \"<sql>\"" >&2; exit 2; }

[ $# -ge 2 ] || uso
alvo=$1; shift

case "$alvo" in
  local)
    host=127.0.0.1; port=54322; user=postgres; export PGPASSWORD=postgres
    ;;
  dev)
    [ -n "${LINGO_DEV_DB_PASSWORD:-}" ] \
      || recusar "defina LINGO_DEV_DB_PASSWORD no shell (nunca em arquivo) para usar o alvo dev"
    host=${LINGO_DEV_DB_HOST:-db.$DEV_REF.supabase.co}
    port=${LINGO_DEV_DB_PORT:-5432}
    user=${LINGO_DEV_DB_USER:-postgres}
    export PGPASSWORD=$LINGO_DEV_DB_PASSWORD
    # Pooler: o ref vem no usuário (postgres.<ref>); conexão direta: no host.
    case "$host $user" in *"$DEV_REF"*) ;; *) recusar "host/usuário do dev não contém o ref $DEV_REF" ;; esac
    ;;
  *)
    recusar "alvo '$alvo' — só existem 'local' e 'dev'"
    ;;
esac

# Defesa em profundidade: nada que cite produção passa, nem nas variáveis do
# libpq, nem na conexão montada, nem no conteúdo dos arquivos SQL.
env | grep -q "$PROD_REF" && recusar "há variável de ambiente apontando para PRODUÇÃO ($PROD_REF)"
case "$host $user" in *"$PROD_REF"*) recusar "conexão aponta para PRODUÇÃO" ;; esac
unset PGHOST PGPORT PGUSER PGDATABASE PGSERVICE PGSERVICEFILE DATABASE_URL

args=(-X -q -v ON_ERROR_STOP=1 --single-transaction -h "$host" -p "$port" -U "$user" -d postgres -f "$HELPERS")
if [ "$1" = "-c" ]; then
  [ $# -eq 2 ] || uso
  printf '%s' "$2" | grep -q "$PROD_REF" && recusar "o SQL cita o ref de PRODUÇÃO"
  args+=(-c "$2")
else
  for f in "$@"; do
    [ -f "$f" ] || { echo "arquivo não encontrado: $f" >&2; exit 2; }
    grep -q "$PROD_REF" "$f" && recusar "$f cita o ref de PRODUÇÃO"
    args+=(-f "$f")
  done
fi

echo "→ alvo: $alvo ($host:$port)" >&2
exec psql "${args[@]}"
