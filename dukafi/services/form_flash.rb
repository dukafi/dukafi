# A form's one-shot outcome, held between the POST that produced it and the
# region GET that renders it.
#
# A cart region can simply re-fetch itself, because a cart is real stored
# state — ask again and it is still there. A form outcome is not: it exists
# only as the result of one request. And htmx discards 4xx bodies by default
# (`responseHandling` maps `[45]..` to `swap: false`), so a failing POST
# cannot hand back the merchant's own error markup directly.
#
# So the shape is the same one the cart already uses: the POST fires an event,
# the form region hears it and re-renders itself. This is the part that has to
# survive the gap between those two requests, and on a stateless server the
# session is the only place it can live.
#
# Keyed by REGION NODE ID, so a page carrying both a login form and a newsletter
# form shows each outcome in its own banner instead of whichever fired last.
#
# Reads are DESTRUCTIVE. An error that outlived its render would reappear on the
# next page load as a ghost complaint about something the visitor already fixed.
class FormFlash
  KEY = "form_flash".freeze

  # These ride in a cookie session, so the payload is a short reason CODE and a
  # boolean — never a rendered sentence. Wording stays at the HTTP edge with
  # every other message, and the cookie stays far below its 4KB ceiling.
  #
  # The cap bounds a visitor who opens many forms without ever rendering them;
  # oldest entries are dropped first.
  LIMIT = 4

  def self.write(session, node_id, reason:, ok:)
    return unless session
    # No region means the merchant built no place to show this. The event still
    # fires; there is simply nothing to hold.
    return if node_id.to_s.empty?

    store = session[KEY]
    store = {} unless store.is_a?(Hash)
    store = store.to_a.last(LIMIT - 1).to_h if store.length >= LIMIT
    store[node_id.to_s] = { "reason" => reason.to_s, "ok" => ok ? true : false }
    session[KEY] = store
  end

  # Returns `{"reason" => …, "ok" => …}` or nil, removing it either way.
  def self.take(session, node_id)
    return nil unless session

    store = session[KEY]
    return nil unless store.is_a?(Hash)

    entry = store.delete(node_id.to_s)
    # Drop the key entirely once empty rather than leaving `{}` behind in the
    # cookie on every subsequent request.
    store.empty? ? session.delete(KEY) : session[KEY] = store
    entry.is_a?(Hash) ? entry : nil
  end
end
