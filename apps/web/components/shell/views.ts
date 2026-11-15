export type ViewLink = {
  href: '/package' | '/map' | '/learn' | '/ask' | '/graph' | '/pipeline';
  name: string;
  key: '1' | '2' | '3' | '4' | '5' | '6';
  platform?: boolean;
};

export const VIEWS: ViewLink[] = [
  { href: '/package', name: 'Package', key: '1' },
  { href: '/map', name: 'Site map', key: '2' },
  { href: '/learn', name: 'Learn', key: '3' },
  { href: '/ask', name: 'Ask the evidence', key: '4', platform: true },
  { href: '/graph', name: 'Knowledge graph', key: '5', platform: true },
  { href: '/pipeline', name: 'Data pipeline', key: '6', platform: true },
];

/**
 * True when keystrokes belong to a form field or an open widget rather than
 * the app: text fields, dropdowns (whose typeahead uses letters and digits),
 * menus, listboxes and dialogs.
 */
export const isTyping = (el: Element | null): boolean =>
  !!el &&
  ((el as HTMLElement).isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) ||
    !!el.closest('[role="combobox"],[role="listbox"],[role="menu"],[role="dialog"],[role="alertdialog"],[role="slider"]'));
