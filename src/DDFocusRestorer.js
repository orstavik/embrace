function SelectionRestorer(active) {
  const okInputTypes = /text|search|password|tel|url|email/i;
  if (active.tagName == "TEXTAREA" || (active.tagName == "INPUT" && okInputTypes.test(active.type))) {
    const { selectionStart, selectionEnd, selectionDirection } = active;
    if (selectionStart != null)
      return active => active.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  }
}

export function FocusSelectionRestorer(root) {
  const { id, tagName, type, name, value } = document.activeElement;
  const selection = SelectionRestorer(document.activeElement);

  if (id)
    return () => {
      const active = root.querySelector(`#${CSS.escape(id)}`);
      if (!active)
        return;
      active.focus();
      selection?.(active);
    };

  let q = tagName;
  if (/input|textarea|select/i.test(tagName)) {
    if (name) q += `[name="${CSS.escape(name)}"]`;
    if (type) q += `[type="${CSS.escape(type)}"]`;
  } else {
    const contenteditable = document.activeElement.getAttribute("contenteditable");
    const tabindex = document.activeElement.getAttribute("tabindex");
    if (contenteditable) q += `[contenteditable="${CSS.escape(contenteditable)}"]`;
    if (tabindex) q += `[tabindex="${CSS.escape(tabindex)}"]`;
  }

  const equalInputs = [...root.querySelectorAll(q)]
    .filter(n => n.value === value)
    .indexOf(document.activeElement);

  return function () {
    const active = [...root.querySelectorAll(q)].filter(n => n.value === value)[equalInputs];
    if (!active)
      return;
    active.focus();
    selection?.(active);
  };
}