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

## ⚠ Google OAuth precisa de domínio

O Google **não aceita IP** como redirect URI (só `localhost` ou domínio). Ou
seja: no `http://SEU_IP:8080` o site inteiro funciona, mas o botão "Entrar com
Google" só vai funcionar quando houver um domínio (um subdomínio grátis do
[DuckDNS](https://www.duckdns.org) resolve). Quando tiver:

1. Aponte o domínio para o IP da VPS;
2. Troque o bloco do Caddy por `bxlab.seudominio.com { reverse_proxy 127.0.0.1:3004 }`
   (TLS automático) e ajuste `SITE_URL=https://bxlab.seudominio.com` no `.env`;
3. No Google Cloud Console, na MESMA aplicação OAuth do GLC Hub, adicione o
   redirect `https://bxlab.seudominio.com/api/oauth/google/callback`;
4. `docker compose up -d` para recarregar o `.env`.

Para testar login antes disso, rode local com `DEV_LOGIN=1` (`npm run dev` +
`http://localhost:3000`), ou cadastre `http://localhost:3000/api/oauth/google/callback`
no Google Console e teste o Google login localmente.

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
