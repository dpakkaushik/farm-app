// The missing native half of the back gesture. In the installed app (a
// Capacitor shell) the Android back swipe never reaches the page on its own:
// Capacitor core has NO back handling — that lives in the @capacitor/app
// plugin, and until it was installed the gesture fell through to the system,
// which closed the whole app from any screen. lib/backTrap.js was correct but
// waiting for a popstate that could never arrive.
//
// With the plugin's backButton event bridged here, the gesture becomes a plain
// history back: popstate fires, backTrap closes the overlay on top, or the
// router walks back a page. Only at the very root — nothing left to pop — does
// the app minimise, which is what Android users expect a home-screen back to do.
// (The plugin's own no-listener default would goBack too, but at the root it
// swallows the gesture entirely: a dead swipe. That is why this listener exists.)
//
// Like backTrap, the plumbing is injected so it runs under vitest's node env.
// `hooks` never see this: it is registered once at startup in main.jsx.

/** @param {{canGoBack: boolean}} event
 *  @param {{back: ()=>void, minimize: ()=>void}} env */
export function onNativeBack({ canGoBack }, env) {
  if (canGoBack) env.back()
  else env.minimize()
}

/** @param {{isNative: ()=>boolean, addListener: (event:string, fn:Function)=>void,
 *           back: ()=>void, minimize: ()=>void}} env */
export function registerNativeBack(env) {
  if (!env.isNative()) return
  env.addListener('backButton', (event) => onNativeBack(event, env))
}
