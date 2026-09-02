#!/usr/bin/env bash
# Configura o domínio do BX Deck Lab na VPS: Caddy (HTTPS automático), SITE_URL no .env,
# firewall e recriação do container. Rode NA VPS, dentro da pasta do projeto:
#
#   cd ~/bxdeck/bx-deck-lab && git pull && sudo bash deploy/setup-domain.sh beyxlab.com.br
#
# Idempotente: pode rodar de novo à vontade.
set -euo pipefail

DOMAIN="${1:-beyxlab.com.br}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CADDYFILE="/etc/caddy/Caddyfile"
UPSTREAM="127.0.0.1:3004"
KEEP_IP_PORT="${KEEP_IP_PORT:-1}"   # KEEP_IP_PORT=0 para desligar o acesso antigo por http://IP:8080

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()  { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash deploy/setup-domain.sh $DOMAIN"; exit 1; }
command -v caddy >/dev/null || { echo "Caddy não encontrado. Instale antes (https://caddyserver.com/docs/install)."; exit 1; }

say "1/5 DNS de $DOMAIN"
MY_IP="$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
echo "  IP desta VPS: ${MY_IP:-?}   |   $DOMAIN resolve para: ${DNS_IP:-nada ainda}"
if [ -z "$DNS_IP" ]; then
  warn "O domínio ainda não resolve. Crie o registro A ($DOMAIN e www) apontando para $MY_IP e rode de novo quando propagar."
  warn "Vou configurar mesmo assim; o Caddy só consegue emitir o certificado depois que o DNS propagar."
elif [ -n "$MY_IP" ] && [ "$DNS_IP" != "$MY_IP" ]; then
  warn "O domínio aponta para $DNS_IP, mas esta VPS é $MY_IP. Se estiver atrás do Cloudflare, deixe o proxy (nuvem) DESLIGADO neste registro."
else
  ok "DNS ok"
fi

say "2/5 Caddyfile ($CADDYFILE)"
cp -a "$CADDYFILE" "$CADDYFILE.bak.$(date +%Y%m%d%H%M%S)" 2>/dev/null || true
# Remove blocos antigos do BX Deck Lab (marcados) e reescreve
if [ -f "$CADDYFILE" ] && grep -q "# bxlab:begin" "$CADDYFILE"; then
  sed -i '/# bxlab:begin/,/# bxlab:end/d' "$CADDYFILE"
fi
# Se o bloco antigo "http://:8080 { reverse_proxy 127.0.0.1:3004 ... }" existir sem marcação, remove também
if [ -f "$CADDYFILE" ] && grep -q "^http://:8080" "$CADDYFILE" && grep -q "$UPSTREAM" "$CADDYFILE"; then
  python3 - "$CADDYFILE" "$UPSTREAM" <<'PY' || true
import re,sys
p,up=sys.argv[1],sys.argv[2]
s=open(p).read()
s2=re.sub(r'http://:8080\s*\{[^{}]*'+re.escape(up)+r'[^{}]*\}\s*','',s)
open(p,'w').write(s2)
PY
fi
{
  echo "# bxlab:begin — gerado por deploy/setup-domain.sh (BX Deck Lab)"
  echo "$DOMAIN, www.$DOMAIN {"
  echo "    encode zstd gzip"
  echo "    reverse_proxy $UPSTREAM"
  echo "    header {"
  echo "        Strict-Transport-Security \"max-age=31536000; includeSubDomains\""
  echo "        X-Content-Type-Options nosniff"
  echo "        Referrer-Policy no-referrer"
  echo "        -Server"
  echo "    }"
  echo "}"
  if [ "$KEEP_IP_PORT" = "1" ]; then
    echo "# acesso antigo por IP (pode remover depois: KEEP_IP_PORT=0)"
    echo "http://:8080 {"
    echo "    encode gzip"
    echo "    reverse_proxy $UPSTREAM"
    echo "}"
  fi
  echo "# bxlab:end"
} >> "$CADDYFILE"
caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null && ok "Caddyfile válido"

say "3/5 Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
  [ "$KEEP_IP_PORT" = "1" ] || ufw delete allow 8080/tcp >/dev/null 2>&1 || true
  ok "portas 80/443 liberadas"
else
  echo "  ufw inativo/ausente — nada a fazer"
fi

say "4/5 .env do site (SITE_URL=https://$DOMAIN)"
ENV="$APP_DIR/.env"
[ -f "$ENV" ] || { echo "Não achei $ENV"; exit 1; }
if grep -q '^SITE_URL=' "$ENV"; then sed -i "s#^SITE_URL=.*#SITE_URL=https://$DOMAIN#" "$ENV"; else echo "SITE_URL=https://$DOMAIN" >> "$ENV"; fi
grep -q '^NODE_ENV=' "$ENV" || echo "NODE_ENV=production" >> "$ENV"
grep -q '^DEV_LOGIN=' "$ENV" && sed -i 's#^DEV_LOGIN=.*#DEV_LOGIN=0#' "$ENV" || echo "DEV_LOGIN=0" >> "$ENV"
ok "$(grep '^SITE_URL=' "$ENV")"

say "5/5 Recarregando Caddy e recriando o container"
systemctl reload caddy && ok "caddy recarregado"
cd "$APP_DIR" && docker compose up -d --force-recreate >/dev/null && ok "container recriado com o .env novo"

echo
echo "=================================================================="
echo " Pronto na VPS. Falta só o que é feito fora dela:"
echo "  1) DNS: registro A de $DOMAIN (e www) -> $MY_IP"
echo "  2) Google Cloud Console (mesmo app OAuth do GLC Hub):"
echo "     redirect URI:   https://$DOMAIN/api/oauth/google/callback"
echo "     origem JS:      https://$DOMAIN"
echo " Teste: https://$DOMAIN  (o certificado sai na 1ª visita após o DNS propagar)"
echo " Logs do Caddy se algo falhar: journalctl -u caddy -n 50 --no-pager"
echo "=================================================================="
