# Guia de conexão do Battle Pass

Quatro passos, considerando o acessório já ligado: retirar a Bey, segurar o
botão por um segundo, conectar e encaixar a Bey para lançar. Navegação por
deslize, setas e teclado. O botão Conectar chama a mesma ação da página,
diretamente no toque, para preservar a autorização Bluetooth do navegador.

As indicações do botão e LED sobre as fotos são elementos SVG. A primeira
imagem combina a ilustração do lançador com a fotografia oficial da Dran Sword
3-60F. A Bey não é gerada por IA: seu render original é exibido como uma camada
SVG, com enquadramento e máscara suave apenas no fundo ao redor do produto.
Formato, peças e emblema vêm diretamente da fotografia oficial.

## Arquivos e referências

- `public/battle-pass/bx09-guide-launcher.webp`: lançador ilustrado, sem Bey,
  1200 × 800. Exportado em WebP para reduzir o download no celular.
- `public/battle-pass/bx01-dransword-official.png`: fotografia oficial completa,
  586 × 709, copiada sem alterações. O site enquadra só a Bey e preserva a
  perspectiva da fotografia.
- `public/js/battle-pass/connection-guide.mjs`: composição, máscara e indicações.

Fonte da Dran Sword 3-60F:
https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html

Imagem original:
https://beyblade.takaratomy.co.jp/beyblade-x/lineup/_image/BX01@1.png

Demais créditos e manual em `public/battle-pass/THIRD-PARTY.txt`.

## Limpeza da ilustração

A ferramenta integrada de imagens removeu a Bey inventada da ilustração
anterior. Nenhuma Bey foi sintetizada nessa correção; a substituta é o render
oficial, composto pelo site. Saída original da limpeza: 1536 × 1024.

Prompt usado:

> Use case: precise-object-edit. Edit target: provided landscape BX-09 tutorial image. Remove ONLY the detached blue/silver Beyblade at the bottom center (and its contact shadow). Fill that vacated area with the same uniform pale cool gray background as around it. Preserve the complete launcher, ripcord, handle, Battle Pass accessory, printed details, perspective, position, scale, light, shadows and the 3:2 canvas exactly unchanged. Do not move or recreate the launcher. Do not put any replacement object in the blank area. No new Beyblade, no text, no arrows or borders. The vacated bottom center must be empty background because a genuine official product photograph will be composited there by the website.
