// ============================================================
// list-scroll — прокрутка списка к элементу без прокрутки предков (DOUBLE-CLICK-TIMING)
// ============================================================
// `item.scrollIntoView({ block: 'nearest' })` прокручивает ВСЕ прокручиваемые предки, пока элемент
// не станет виден. История (Timeline) — внизу левой панели; панель (`.panel-left`, overflow-y: auto)
// переполнена уже с ~5 фигурами, и каждый новый шаг прокручивал всю панель на строку вниз —
// палитра фигур уезжала из-под курсора: второй клик по «Кубу» через 300 мс попадал в зазор между
// кнопками или в «Конус». Теперь прокручивается только сам список (у `.tl-list` своя прокрутка).

/**
 * Прокрутить `list` так, чтобы `item` был виден целиком (как `block: 'nearest'`: уже виден — не
 * двигать; выше — к верхнему краю; ниже — к нижнему). Предки `list` не прокручиваются.
 */
export function scrollListToItem(list: HTMLElement, item: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
  const box = list.getBoundingClientRect()
  const r = item.getBoundingClientRect()
  const viewTop = box.top + list.clientTop
  const viewBottom = viewTop + list.clientHeight
  let top: number | null = null
  if (r.top < viewTop) top = list.scrollTop - (viewTop - r.top)
  else if (r.bottom > viewBottom) top = list.scrollTop + (r.bottom - viewBottom)
  if (top === null) return
  top = Math.max(0, top)
  if (typeof list.scrollTo === 'function') list.scrollTo({ top, behavior })
  else list.scrollTop = top
}
