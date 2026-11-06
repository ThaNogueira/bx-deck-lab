export function mountPartModes(button, modes, status) {
  if (!button || modes.length !== 2) return;
  let current = 0, busy = false;
  const images = [...button.querySelectorAll('img')];
  function update() {
    const next = modes[1 - current];
    button.classList.toggle('is-flipped', current === 1);
    button.setAttribute('aria-pressed', String(current === 1));
    button.setAttribute('aria-label', `${modes[current].label}. Virar para ${next.label}`);
    button.title = `Virar para ${next.label}`;
    if (status) status.textContent = modes[current].label;
  }
  update();
  button.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    button.setAttribute('aria-busy', 'true');
    try {
      // Só vira quando o outro render estiver pronto, para não mostrar vazio
      // durante o carregamento em conexões móveis.
      await images[1 - current]?.decode();
      current = 1 - current;
      update();
    } catch {
      if (status) status.textContent = 'Não foi possível carregar. Toque para tentar novamente.';
    } finally {
      busy = false;
      button.removeAttribute('aria-busy');
    }
  });
}
