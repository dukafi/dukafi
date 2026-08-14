/**
 * Sheets and modals — wiring only.
 *
 * Everything hard is the browser's: `<dialog>.showModal()` gives a focus trap,
 * Escape to close, a `::backdrop`, an inert background and `aria-modal`. Trying
 * to reproduce any of that in script is how modal implementations become a
 * thousand lines and still trap focus badly. So this file does three things and
 * stops: find the target, open or close it, and close on a backdrop click.
 *
 * Loaded only on pages that contain an overlay — modules declare the runtimes
 * they need and `RenderPage` collects the union (see RuntimeScripts).
 *
 * Delegated from the document, so a trigger that arrives later — inside an htmx
 * swap, a cart region re-render — works without re-binding anything.
 */
(function () {
  'use strict'

  function overlayById(id) {
    if (!id) return null
    // Attribute lookup, not getElementById: the id lives in a data attribute so
    // it cannot collide with an author's own `id`.
    return document.querySelector('[data-dukafy-overlay="' + CSS.escape(id) + '"]')
  }

  function open(id) {
    var dialog = overlayById(id)
    if (!dialog || dialog.open) return
    // showModal, not show: the modal form is what makes the background inert
    // and the focus trap real.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
    dialog.dispatchEvent(new CustomEvent('dukafi:overlay-opened', { bubbles: true }))
  }

  function close(dialog) {
    if (!dialog || !dialog.open) return
    if (typeof dialog.close === 'function') dialog.close()
    else dialog.removeAttribute('open')
    dialog.dispatchEvent(new CustomEvent('dukafi:overlay-closed', { bubbles: true }))
  }

  document.addEventListener('click', function (event) {
    var target = event.target
    if (!target || typeof target.closest !== 'function') return

    var opener = target.closest('[data-dukafy-overlay-open]')
    if (opener) {
      event.preventDefault()
      open(opener.getAttribute('data-dukafy-overlay-open'))
      return
    }

    var closer = target.closest('[data-dukafy-overlay-close]')
    if (closer) {
      event.preventDefault()
      var id = closer.getAttribute('data-dukafy-overlay-close')
      // No target means "the one I am inside" — what a drawer's own X wants.
      close(id ? overlayById(id) : closer.closest('[data-dukafy-overlay]'))
      return
    }

    // A click on the dialog element itself is a click on its backdrop: the
    // contents are inside child elements, so `event.target === dialog` only
    // happens outside them. Cheaper and more reliable than comparing
    // coordinates against getBoundingClientRect.
    if (target.matches && target.matches('[data-dukafy-overlay]')) close(target)
  })
})()
