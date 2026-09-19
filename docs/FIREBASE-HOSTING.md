# Firebase Hosting — MillionsNest Live

MillionsNest Live usa o mesmo projeto Firebase canônico do ecossistema:

- project: `millionsnest`
- Auth/Firestore: compartilhados com o ecossistema MillionsNest/MusicScale
- Hosting site dedicado: `mn-live-555464791734`
- target local: `millionsnest-live`
- domínio oficial: `live.millionsnest.com`
- fallback Firebase: `https://mn-live-555464791734.web.app`

## Isolamento

O Live tem bundle e Hosting próprios. O target `millionsnest-live` aponta exclusivamente para o site `mn-live-555464791734`. Nenhum deploy do Live deve publicar no Hosting do MusicScale, Hub, NestFinance, Connect, NestJourney ou NestLocal.

## Deploy

O bundle web fica em `apps/live/dist`.

```bash
npm run setup
npm run typecheck
npm test
npm run build --workspace=@millionsnest/live-web
firebase deploy --project millionsnest --only hosting:millionsnest-live --non-interactive
```

## Regras

- O deploy de Hosting não altera Firestore Rules nem Functions.
- Escritas de entidades Live no Firestore continuam sujeitas ao contrato RBAC + Rules + emulator tests.
- O Live Node local não depende deste Hosting durante o culto.
- A URL oficial e o fallback devem servir o mesmo build certificado da branch `production`.
- O domínio oficial é autorizado no Firebase Authentication.

## CI/CD

O repositório atual continua em `prdanielcunha/musicscale-live` enquanto o slug físico não puder ser renomeado pela automação conectada. A marca do produto, packages, executáveis e infraestrutura usam **MillionsNest Live**.

O pipeline de produção deve:

1. construir e testar antes da autenticação cloud;
2. autenticar via WIF;
3. publicar somente `hosting:millionsnest-live`;
4. smoke-testar o fallback e o domínio oficial;
5. executar produção somente a partir da branch `production`.

## Autorização de deploy

O repositório `prdanielcunha/musicscale-live` está autorizado no WIF `mn-prod-github` exclusivamente para a branch `production`, com impersonação do `mn-web-deployer`. Esse vínculo é necessário para que o pipeline publique o build real no Hosting dedicado.
