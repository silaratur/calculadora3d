# Publicação — Hostinger VPS

**URL do app: https://calculadora3d.silaratur.cloud**

## Como está montado

O VPS (72.60.7.224) já usava **Traefik** (proxy com HTTPS automático) roteando domínios
para containers Docker — mesmo esquema do `meu-coach`. O Mínima 3D entrou **sem alterar**
os apps existentes:

- Código do app: `/opt/calculadora3d` (`.next` + `public` + `node_modules` + `.env` + `data/`)
- Container: `calculadora3d-calculadora3d-1` (imagem **`node:22-bookworm-slim`** — glibc, não
  alpine, para casar com o binário do Prisma instalado no host) — roda
  `node_modules/.bin/next start -p 3000`
- Compose próprio: `/opt/calculadora3d/docker-compose.yml`, conectado à rede `root_default` do Traefik
- Rota/SSL: labels Traefik com `Host(calculadora3d.silaratur.cloud)` + certresolver `mytlschallenge`
  (Let's Encrypt)
- DNS: registro A `calculadora3d` → 72.60.7.224 (já criado no hPanel antes do deploy)

## Banco de dados

SQLite via Prisma em `/opt/calculadora3d/data/prod.db` — separado do código para sobreviver aos
deploys (o `tar -xzf` só sobrescreve os arquivos do pacote, nunca `data/`). Schema aplicado com
`prisma migrate deploy` (as migrations do projeto vivem em `prisma/migrations`, versionadas no
repo — nunca usar `prisma db push` em produção).

⚠️ **Mesmo motivo do `meu-coach` para usar `node:22-bookworm-slim`:** o `npm install` roda no HOST
(Ubuntu, glibc) logo após o deploy, então o engine nativo do Prisma é resolvido para glibc. Se um dia
trocar a imagem para alpine, o `npm install`/`prisma generate` precisaria rodar dentro de um container
alpine (ou configurar `binaryTargets` no schema).

### Backup do banco (recomendado periodicamente)

```bash
ssh -i ~/.ssh/calculadora3d_ci root@72.60.7.224 "cp /opt/calculadora3d/data/prod.db /opt/calculadora3d/data/backup-\$(date +%Y%m%d).db"
```

## Acesso SSH

Chave dedicada só para o CI do GitHub Actions: `~/.ssh/calculadora3d_ci` (pública instalada em
`/root/.ssh/authorized_keys` do VPS). Não use a chave `meucoach_deploy` para este projeto — cada
app tem sua própria chave, então revogar uma não afeta os outros.

## Deploy automático

Todo push em **qualquer branch** do repositório [github.com/silaratur/calculadora3d](https://github.com/silaratur/calculadora3d)
dispara `.github/workflows/deploy.yml`: builda (`next build`), gera o Prisma Client, empacota
`.next` + `public` + `package.json` + `prisma/schema.prisma` + `prisma/migrations`, faz backup do
banco, envia por SSH/SCP, reinstala dependências no VPS, roda `prisma migrate deploy` e reinicia
o container.

- Secrets do repositório (Settings → Secrets and variables → Actions): `VPS_HOST` (`72.60.7.224`),
  `VPS_USER` (`root`), `VPS_SSH_KEY` (conteúdo de `~/.ssh/calculadora3d_ci`, a chave **privada**).
- Rodar manualmente: aba **Actions** → workflow "Deploy para produção" → **Run workflow**.

### Política de branches

Mesma convenção do `meu-coach`: cada rodada de mudanças pode ir para uma branch nova e já ser
publicada sozinha — a `main` só recebe merge quando o dono do projeto pedir explicitamente.

## Atualizar o app manualmente (sem passar pelo GitHub)

Na pasta do projeto, no PC (Git Bash):

```bash
npm run build
tar -czf /tmp/calculadora3d.tar.gz .next public package.json package-lock.json next.config.ts prisma/schema.prisma prisma/migrations
scp -o IdentitiesOnly=yes -i ~/.ssh/calculadora3d_ci /tmp/calculadora3d.tar.gz root@72.60.7.224:/tmp/
ssh -o IdentitiesOnly=yes -i ~/.ssh/calculadora3d_ci root@72.60.7.224 "tar -xzf /tmp/calculadora3d.tar.gz -C /opt/calculadora3d && cd /opt/calculadora3d && npm install --omit=dev && npx prisma generate && npx prisma migrate deploy && docker compose restart"
```

## Comandos úteis (no VPS)

```bash
docker logs calculadora3d-calculadora3d-1 --tail 50   # ver logs do app
cd /opt/calculadora3d && docker compose restart        # reiniciar
docker compose down                                    # parar (não afeta os outros apps)
```
