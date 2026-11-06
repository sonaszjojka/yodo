// Where a card's menu opens. It opens upwards from the card by default (its
// bottom edge `MENU_OFFSET` px above the card's bottom, as in `.menu`); when
// that would put its top above the viewport (a tall menu on a card near the
// top of the screen), it opens downwards instead.

/** Space kept between the menu and the top edge of the viewport, in px. */
export const MENU_MARGIN = 8

/** How far above the card's bottom edge an upward menu ends; matches `.menu` in index.css. */
export const MENU_OFFSET = 54

/**
 * Whether a menu of `menuHeight` px on a card whose bottom edge is at
 * `cardBottom` (viewport px) has to open downwards.
 */
export function opensDown(cardBottom: number, menuHeight: number): boolean {
  return cardBottom - MENU_OFFSET - menuHeight < MENU_MARGIN
}
