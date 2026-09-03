import { Children, isValidElement } from 'react'

// Android draws a native <select>'s option list ITSELF — a cream system dialog
// that ignores the app's colours (owner, 2 Sep: "the drop down opens as a
// separate window instead of a simple drop down"). components/SelectField
// replaces it with the app's own sheet, and reads its rows from the very same
// <option>/<optgroup> children the call site already wrote. That is the point:
// converting a screen is a one-word tag change, not a rewrite of its options.
//
// Values come back as STRINGS, because that is what a real select hands to
// `e.target.value` — a call site comparing against '3' must keep working.

const textOf = (node) => {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf(node.props?.children)
  return String(node)
}

/**
 * Flatten a <select>'s children into rows the sheet can draw.
 * @param {React.ReactNode} children
 * @returns {{value: string, label: string, group: string|null, disabled: boolean}[]}
 */
export function optionsFromChildren(children) {
  const out = []
  const walk = (nodes, group) => {
    Children.forEach(nodes, (node) => {
      if (!isValidElement(node)) return          // false/null from a condition
      if (node.type === 'optgroup') {
        walk(node.props.children, node.props.label ?? null)
        return
      }
      if (node.type !== 'option') return
      out.push({
        value:    String(node.props.value ?? ''),
        label:    textOf(node.props.children).replace(/\s+/g, ' ').trim(),
        group,
        disabled: !!node.props.disabled,
      })
    })
  }
  walk(children, null)
  return out
}

/** What the closed control should read. '' when the value matches no row —
 *  saying nothing beats naming the wrong thing. */
export function labelFor(options, value) {
  const hit = options.find(o => o.value === String(value ?? ''))
  return hit ? hit.label : ''
}
