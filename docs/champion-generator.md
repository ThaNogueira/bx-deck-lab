# Gerador de arte do campeão

Disponível exclusivamente para ADMIN em `/admin#champion`.

O admin escolhe um torneio encerrado ou preenche o evento manualmente, envia a foto e monta as três Beys. O recorte roda em um worker no navegador com ISNet FP16 por padrão; o modo rápido usa a versão quantizada. Os dois modelos ficam no próprio site. A versão de maior precisão evita os artefatos associados ao modelo compacto, descritos na [documentação oficial da IMG.LY](https://github.com/imgly/background-removal-js/blob/main/packages/web/README.md). O acabamento reforça a opacidade e corrige pequenos vazios internos, conservando aberturas maiores e bordas suaves. Isso melhora roupas claras, sem prometer um recorte perfeito para toda foto.

Fotos pequenas recebem ampliação de até 2×, até 1800 px no lado maior, com suavização e nitidez moderada. Essa ampliação é interpolada; não inventa detalhes nem usa um modelo de super-resolução. Fotos maiores conservam até 2400 px. O processamento ocorre fora da interface, com limite de resolução e liberação do worker ao terminar.

Saturação (padrão 140%), glow azul e sombra são ajustáveis. A foto fica atrás dos contornos reais das três caixas, da faixa do nome e dos elementos do cabeçalho. Não existe mais o corte vertical em x=437. O arrasto e os quatro cantos redimensionam mantendo proporção; há ajustes numéricos por sliders, teclado e um editor ampliado para celular ou desktop. Os controles e as bordas de seleção nunca entram no PNG.

Durante arrasto/redimensionamento, o navegador compõe fundo, foto e frente em camadas e atualiza apenas a transformação da foto. Saturação, sombra e glow são preparados uma vez e reutilizados, sem recalcular filtros ou recorte ao mover. A prévia usa 1000 px e buffers reaproveitados; a exportação é renderizada separadamente em 2160 px. Há tratamento de cor e sombra para navegadores sem filtros de canvas. A validação com CPU limitada em 4× mediu cerca de 1,24 ms por evento de movimentação no ambiente local; isso não é garantia de FPS em outros dispositivos.

O resultado é PNG quadrado de 2160 × 2160. Salvar cria um registro persistente; publicar cria um único post CHAMPION por arte, com mídia e vínculo ao torneio. A operação não altera partidas, classificação ou pontos. Uma arte ligada a torneio privado não pode ser publicada na comunidade.

O montador é compartilhado com torneios e aceita recolors. A legenda é derivada automaticamente das peças, incluindo CX; peças integradas com Bit ficam centralizadas como um grupo. Siglas fixas: Shark Scale = SSC, Suppress Superion = SPS, Narrow = NR, Needle = N. O restante usa a abreviação do catálogo e, quando ausente, as iniciais do nome. Em CX, Lock Chip e Main Blade formam o prefixo do nome, seguidos de Assist/Over, Ratchet e Bit.

## Arquivos e criação das imagens

As três imagens foram editadas com a ferramenta embutida ImageGen, a partir das referências fornecidas, e copiadas para o projeto:

- `public/assets/champion/template.png`: fundo permanente, título CAMPEÃO, coroa, logo BEYBLADE X e três molduras vazias.
- `public/assets/champion/beystyle.png`: logo BS recortado em transparência.
- `public/assets/champion/tamer.png`: apenas o logo central da Tamer, sem o círculo vermelho e sem o fundo externo.

Prompt final do template:

> Use case: precise-object-edit. Edit target: the attached blue/black square Beyblade champion poster. Create a CLEAN REUSABLE TEMPLATE, square, very high resolution, matching the original composition and artwork as exactly as possible. Keep the top-left white BEYBLADE X logo, the exact large distressed italic white-to-cyan CAMPEÃO typography and crown, the diagonal black/electric blue/cyan background, halftone texture and cyan lines. KEEP all THREE left neon cyan deck frames precisely in their original places: x approximately 2%-45%, y 32%-49%, 50%-67%, 68%-84%. Remove ALL the photographed person on the right, reconstruct the original blue diagonal background there. Remove ALL Beyblade pieces and ALL small combo text from inside the three frames, leaving empty dark interiors. Remove LIPÃO from its cyan name strip, preserve the empty cyan name strip x15%-53%, y24%-31%. Remove SEMANAL TAMER and 27/10 from the bottom right, leave a dark footer space ready for text x55%-99%, y85%-99%. Remove both small bottom-left sponsor logos and tiny instagram icon, preserving the footer background and thin cyan horizontal separator at y85%; leave empty sponsor positions. Do not add any new labels, any new text, photo, silhouette, placeholders or guides. Only permanent text must be CAMPEÃO and BEYBLADE X. Preserve texture and exact letter style. Crisp professional print-quality final flat poster template.

Prompt final do BS:

> Use case: background-extraction. Remove only the flat very dark rectangular exterior background surrounding this BeyStyle BS shark circular logo. Keep the EXACT logo design, black circular disk, blue/cyan/white shark and BS lettering, all colors, edges and proportions unchanged. Preserve black INSIDE the circular logo. Trim excessive outer padding. Output the original logo as a crisp faithful transparent PNG cutout, genuine alpha outside its outer round silhouette, no checkerboard, no added glow, no text changes.

Prompt final da Tamer:

> Use case: background-extraction. Edit target attached Tamer Shop badge. Extract ONLY the central Tamer Shop logo: the red parrot head, the white/blue/red/yellow emblem and exact black TAMER SHOP lettering. REMOVE COMPLETELY the outer circular badge: no red/maroon patterned disk, no circuit pattern, no pink/orange ring, no dark square. The central logo is bounded by its own white irregular outline; preserve that outline, the small blue/red swooshes, the parrot and letters EXACTLY. Output ONLY the central logo with genuine transparent alpha outside its irregular outline, tightly framed, no colored circle or circular halo at all.

## Execução e validação

```sh
node server/prepare-champion-model.mjs
npm run build
node scripts/champion.integration.mjs
```

O Docker prepara e verifica os dois modelos de recorte em uma etapa separada e inclui os arquivos no site. Eles ficam fora do Git. A versão 1.7.0 está fixada junto da dependência e cada fragmento é verificado com SHA-256. A biblioteca de recorte é IMG.LY Background Removal (AGPL-3.0); as fontes locais Russo One e Barlow Condensed incluem suas licenças OFL na pasta do modelo.

O teste isolado verifica permissões, siglas, composição com duas e seis peças, recolors, download, persistência, vínculo ao torneio, publicação sem duplicidade e responsividade. O teste real de recorte pode ser executado com `--real-photo` quando existe `artifacts/champion/portrait-input.jpg`. As prévias e imagens usadas na validação ficam em `artifacts/champion/` e não são publicadas nem incluídas no Git.
