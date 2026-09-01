# Deploy no VPS (site estático + Caddy)

O BX Deck Lab é 100% estático (HTML/CSS/JS, sem backend próprio — os catálogos
são consultados direto do navegador). Deploy é basicamente clonar o repo e
servir a pasta. Este guia assume acesso só por **IP** (sem domínio) numa VPS
Linux (Ubuntu/Debian).

## 1. Pré-requisitos

Caddy instalado (se a VPS já roda o GLC Hub, ele já está lá):

```bash
sudo apt install -y caddy
```

## 2. Código

```bash
sudo git clone https://github.com/ThaNogueira/bx-deck-lab.git /opt/bx-deck-lab
```

## 3. Servir por IP numa porta dedicada

Sem domínio não há certificado automático, então o site sai em HTTP puro numa
porta própria (aqui, `8080`) — sem conflitar com outros sites do mesmo Caddy.

Adicione ao `/etc/caddy/Caddyfile`:

```
http://:8080 {
    root * /opt/bx-deck-lab
    @oculto path /.git*
    respond @oculto 404
    encode gzip
    file_server
}
```

```bash
sudo systemctl reload caddy
```

Se houver firewall:

```bash
sudo ufw allow 8080/tcp
```

Pronto: `http://SEU_IP:8080`.

> Quando tiver um domínio, basta trocar `http://:8080` pelo domínio
> (ex.: `bx.seudominio.com { ... }`) que o Caddy emite o certificado
> Let's Encrypt sozinho.

## 4. Atualizações

```bash
cd /opt/bx-deck-lab && sudo git pull
```

Nada para rebuildar — o Caddy já serve os arquivos novos. Se o navegador
insistir em versão antiga, recarregue com Ctrl+Shift+R (os dados ficam no
`localStorage`, então recarregar não apaga coleção/decks).

## 5. Observações

- A coleção, os decks e os torneios ficam no `localStorage` do **navegador de
  quem usa** — o servidor não guarda nada, então não há banco nem backup a
  fazer no VPS.
- Os catálogos online (BEYBLADE X Database, BeyCommunity etc.) são consultados
  pelo navegador do visitante; a VPS não precisa de acesso a essas fontes.
