# Deploy no VPS (Docker + Caddy)

A v2 tem servidor próprio (Node + Express + SQLite): contas Google, perfis,
decks da comunidade, torneios online, marketplace e painel de admin. O deploy
segue o padrão do GLC Hub: Docker Compose atrás do Caddy.

## 1. Pré-requisitos

Docker e Caddy (se a VPS já roda o GLC Hub, os dois já estão lá).

## 2. Código e variáveis

```bash
git clone https://github.com/ThaNogueira/bx-deck-lab.git && cd bx-deck-lab
cp .env.example .env
```

Edite `.env`:

| Variável | Valor |
|---|---|
| `SITE_URL` | URL pública (ex.: `http://SEU_IP:8080` — ver aviso do OAuth abaixo) |
| `GOOGLE_CLIENT_ID/SECRET` | os MESMOS do GLC Hub — copie do `.env` da pasta do glchub na VPS (`grep GOOGLE_ /caminho/glchub/.env`) |
| `ADMIN_EMAILS` | e-mails que viram admin ao logar (já vem com o seu) |
| `DEV_LOGIN` | `0` em produção, SEMPRE |

`DATABASE_URL` já vem certo no exemplo (SQLite em `data/`, que o compose monta
como volume).

## 3. Subir

```bash
docker compose up -d --build
docker compose logs -f web
```

O container roda `prisma migrate deploy` + seed (idempotente) e sobe na porta
interna **3004** (só localhost).

## 4. Caddy (acesso por IP, porta 8080)

`/etc/caddy/Caddyfile`:

```
http://:8080 {
    reverse_proxy 127.0.0.1:3004
    encode gzip
}
```

```bash
sudo systemctl reload caddy
sudo ufw allow 8080/tcp   # se houver firewall
```

Pronto: `http://SEU_IP:8080`.

## 4b. Domínio (beyxlab.com.br) — HTTPS automático

Um script faz tudo que é do lado da VPS: Caddy com certificado Let's Encrypt
automático (HTTPS), `SITE_URL` no `.env`, firewall e recriação do container.
Rode NA VPS, dentro da pasta do projeto:

```bash
cd ~/bxdeck/bx-deck-lab && git pull && sudo bash deploy/setup-domain.sh beyxlab.com.br
```

Ele mantém o acesso antigo por `http://IP:8080` até você desligar
(`KEEP_IP_PORT=0 sudo bash deploy/setup-domain.sh beyxlab.com.br`).
Pode rodar de novo quantas vezes quiser (é idempotente).

O que só você faz, fora da VPS:

1. **DNS** (painel do Registro.br ou do provedor de DNS): registro **A** de
   `beyxlab.com.br` e de `www` apontando para o IP da VPS (o script mostra o IP no passo 1).
   Se usar Cloudflare, deixe o proxy (nuvem laranja) DESLIGADO nesses registros,
   senão o Caddy não consegue emitir o certificado.
2. **Google Cloud Console**, na MESMA aplicação OAuth do GLC Hub:
   - URI de redirecionamento autorizado: `https://beyxlab.com.br/api/oauth/google/callback`
   - Origem JavaScript autorizada: `https://beyxlab.com.br`

O Google **não aceita IP** como redirect URI, por isso o login Google só funciona
depois do domínio. Para testar login local: `DEV_LOGIN=1` + `npm run dev`.

Se algo falhar: `journalctl -u caddy -n 50 --no-pager` mostra o motivo (quase
sempre DNS ainda não propagado ou porta 80/443 fechada).

## 5. Backup

Tudo que importa está em `data/` (SQLite + uploads). Crontab diário, 14 dias:

```
20 4 * * * cd /caminho/para/bx-deck-lab && tar czf backups/bx-$(date +\%F).tar.gz data && find backups -name '*.tar.gz' -mtime +14 -delete
```

```bash
mkdir -p backups
```

## 6. Atualizações

```bash
git pull
docker compose up -d --build   # migrate + seed rodam de novo sozinhos
```

## 7. Operação

- Painel: `/admin` (aparece a engrenagem no topo para contas MOD/ADMIN).
- Manutenção, feature flags, avisos e filtro de palavras: tudo pelo painel.
- Sync de produtos (BeyCommunity TT/Hasbro): botão em Admin → Home & meta,
  ou `docker compose exec web node server/sync-cli.js`.
- Erros do site e auditoria: Admin → Logs.
